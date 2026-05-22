/**
 * @fileoverview Regression tests for settings deep-merge (INC-03)
 *
 * Ensures SETTINGS_UPDATE performs deep-merge so that saving a nested
 * partial config (e.g. { llm: { provider: 'gpt-4' } }) does NOT wipe
 * sibling nested fields (e.g. llm.temperature, atlassian.*, consent_*).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSupabase, handlers } = vi.hoisted(() => {
  const _from = vi.fn();
  return {
    mockSupabase: { from: _from },
    handlers: new Map(),
  };
});

vi.mock('../../src/supabaseConfig.js', () => ({ supabase: mockSupabase }));

vi.mock('../../src/background/messageRouter.js', () => ({
  registerHandler: vi.fn((type, handler) => handlers.set(type, handler)),
}));

vi.mock('../../src/background/utils/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue('user-123'),
}));

vi.mock('../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn((op) => op()),
}));

vi.mock('../../src/shared/errorCodes.js', () => ({
  ERROR_CODES: { INVALID_INPUT: 'INVALID_INPUT', NETWORK_ERROR: 'NETWORK_ERROR', SUPABASE_ERROR: 'SUPABASE_ERROR' },
  getUserFriendlyMessage: vi.fn((c) => `Error: ${c}`),
}));

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    startOperation: vi.fn(() => 'cid'), endOperation: vi.fn(),
  }),
  generateCorrelationId: vi.fn(() => 'cid'),
}));

vi.mock('../../src/shared/messageSchema.js', async () => {
  const actual = await vi.importActual('../../src/shared/messageSchema.js');
  return actual;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let capturedUpsertConfig = null;

function setupSettingsMock(existingConfig) {
  capturedUpsertConfig = null;

  mockSupabase.from.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { config: existingConfig }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { config: existingConfig }, error: null }),
    upsert: vi.fn((row, _opts) => {
      capturedUpsertConfig = row.config;
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { config: row.config },
          error: null,
        }),
      };
    }),
  }));
}

// Import once — triggers registerHandler calls
await import('../../src/background/handlers/settings.js');

describe('Settings – deep-merge behavior (INC-03)', () => {
  const handler = handlers.get('SETTINGS_UPDATE');

  const makeMsg = (config) => ({
    type: 'SETTINGS_UPDATE',
    correlationId: 'test-cid',
    timestamp: Date.now(),
    data: { config },
  });

  it('deep-merges nested objects instead of overwriting', async () => {
    setupSettingsMock({
      llm: { provider: 'gpt-4', temperature: 0.7, maxTokens: 2000 },
      theme: 'dark',
      consent_analytics: true,
    });

    await handler(makeMsg({ llm: { provider: 'claude' } }));

    // Should keep temperature and maxTokens from existing config
    expect(capturedUpsertConfig.llm).toEqual({
      provider: 'claude',
      temperature: 0.7,
      maxTokens: 2000,
    });
    expect(capturedUpsertConfig.theme).toBe('dark');
    expect(capturedUpsertConfig.consent_analytics).toBe(true);
  });

  it('preserves sibling top-level keys', async () => {
    setupSettingsMock({
      atlassian: { baseUrl: 'https://co.atlassian.net', email: 'a@b.com' },
      interval: 5,
    });

    await handler(makeMsg({ interval: 10 }));

    expect(capturedUpsertConfig.interval).toBe(10);
    expect(capturedUpsertConfig.atlassian).toEqual({
      baseUrl: 'https://co.atlassian.net',
      email: 'a@b.com',
    });
  });

  it('overwrites arrays (no array merge)', async () => {
    setupSettingsMock({ tags: ['old1', 'old2'] });

    await handler(makeMsg({ tags: ['new1'] }));

    expect(capturedUpsertConfig.tags).toEqual(['new1']);
  });

  it('allows setting nested fields to null', async () => {
    setupSettingsMock({ llm: { provider: 'gpt-4', apiKey: 'sk-xxx' } });

    await handler(makeMsg({ llm: { apiKey: null } }));

    expect(capturedUpsertConfig.llm).toEqual({ provider: 'gpt-4', apiKey: null });
  });
});
