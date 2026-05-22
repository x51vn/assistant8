/**
 * @fileoverview Regression tests for data export secret sanitization (INC-02)
 *
 * Ensures that settings config export strips ALL sensitive fields:
 * - Top-level atlassianApiToken
 * - Nested atlassian.apiToken / atlassian.password
 * - api_keys.<provider>.apiKey for every stored provider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSupabase, handlers } = vi.hoisted(() => {
  const _from = vi.fn();
  return {
    mockSupabase: {
      from: _from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'a@b.com' } } }) },
    },
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
  ERROR_CODES: { OPERATION_FAILED: 'OPERATION_FAILED' },
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
// Setup
// ---------------------------------------------------------------------------

/** Helper: build a mock Supabase query chain */
function mockQueryChain(data, error = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

// Import once — triggers registerHandler calls
await import('../../src/background/handlers/dataExport.js');

describe('DataExport – secret sanitization (INC-02)', () => {
  const handler = handlers.get('DATA_EXPORT_REQUEST');

  beforeEach(() => {
    // Default mock: most tables return []
    mockSupabase.from.mockImplementation(() => mockQueryChain([]));
  });

  const makeMsg = () => ({
    type: 'DATA_EXPORT_REQUEST',
    correlationId: 'test-cid',
    timestamp: Date.now(),
  });

  it('strips top-level atlassianApiToken', async () => {
    // Override settings fetch to return a config with a top-level token
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'settings') {
        return mockQueryChain({
          config: {
            atlassianApiToken: 'SECRET_TOP_LEVEL',
            theme: 'dark',
          },
        });
      }
      return mockQueryChain([]);
    });

    const res = await handler(makeMsg());
    expect(res.exportData.settings.atlassianApiToken).toBeUndefined();
    expect(res.exportData.settings.theme).toBe('dark');
  });

  it('strips nested atlassian.apiToken and atlassian.password', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'settings') {
        return mockQueryChain({
          config: {
            atlassian: {
              apiToken: 'SECRET_NESTED',
              password: 'SECRET_PASS',
              baseUrl: 'https://company.atlassian.net',
            },
          },
        });
      }
      return mockQueryChain([]);
    });

    const res = await handler(makeMsg());
    expect(res.exportData.settings.atlassian.apiToken).toBeUndefined();
    expect(res.exportData.settings.atlassian.password).toBeUndefined();
    expect(res.exportData.settings.atlassian.baseUrl).toBe('https://company.atlassian.net');
  });

  it('strips api_keys.<provider>.apiKey for all providers', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'settings') {
        return mockQueryChain({
          config: {
            api_keys: {
              litellm: { apiKey: 'sk-secret-1', updatedAt: '2026-01-01' },
              jira: { apiKey: 'sk-secret-2', updatedAt: '2026-02-01' },
            },
            theme: 'light',
          },
        });
      }
      return mockQueryChain([]);
    });

    const res = await handler(makeMsg());
    const exported = res.exportData.settings;
    expect(exported.api_keys.litellm.apiKey).toBeUndefined();
    expect(exported.api_keys.litellm.updatedAt).toBe('2026-01-01');
    expect(exported.api_keys.jira.apiKey).toBeUndefined();
    expect(exported.api_keys.jira.updatedAt).toBe('2026-02-01');
    expect(exported.theme).toBe('light');
  });

  it('handles config with no secrets gracefully', async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'settings') {
        return mockQueryChain({ config: { theme: 'dark', interval: 5 } });
      }
      return mockQueryChain([]);
    });

    const res = await handler(makeMsg());
    expect(res.exportData.settings).toEqual({ theme: 'dark', interval: 5 });
  });
});
