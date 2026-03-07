/**
 * @fileoverview Regression tests for API key audit logging (INC-06)
 *
 * Verifies that logAuditEvent writes to the `runs` table with the correct
 * columns: run_id (string), status, metadata, timestamp — NOT the
 * non-existent `type` column.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSupabase, handlers } = vi.hoisted(() => {
  const _insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const _from = vi.fn((table) => {
    if (table === 'runs') {
      return { insert: _insert };
    }
    // Default chain for settings table
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
    };
  });
  return {
    mockSupabase: { from: _from, _insert },
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
  ERROR_CODES: { INVALID_INPUT: 'INVALID_INPUT', OPERATION_FAILED: 'OPERATION_FAILED', LLM_APIKEY_SAVE_FAILED: 'LLM_APIKEY_SAVE_FAILED' },
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

vi.mock('../../src/shared/llmClient.js', () => ({
  healthCheck: vi.fn(),
  migrateLocalKeysToSupabase: vi.fn(),
}));

// Mock chrome.storage.local for key cache
global.chrome = {
  storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
  runtime: { sendMessage: vi.fn() },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsApiKeys – audit log schema (INC-06)', () => {
  let handler;

  beforeEach(async () => {
    handlers.clear();
    mockSupabase._insert.mockClear();
    await import('../../src/background/handlers/settingsApiKeys.js');
    handler = handlers.get('SETTINGS_APIKEY_SET');
  });

  it('writes audit log with run_id and timestamp, NOT type column', async () => {
    // Override settings read to return empty config
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'runs') {
        return { insert: mockSupabase._insert };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { config: {} }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { config: {} }, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    await handler({
      type: 'SETTINGS_APIKEY_SET',
      correlationId: 'test-cid',
      timestamp: Date.now(),
      provider: 'litellm',
      apiKey: 'sk-test-key-12345678',
    });

    expect(mockSupabase._insert).toHaveBeenCalled();
    const insertedRow = mockSupabase._insert.mock.calls[0][0];

    // Must have run_id (required by schema constraint)
    expect(insertedRow.run_id).toBeDefined();
    expect(typeof insertedRow.run_id).toBe('string');
    expect(insertedRow.run_id.length).toBeGreaterThan(0);

    // Must have timestamp (required by schema)
    expect(insertedRow.timestamp).toBeDefined();
    expect(typeof insertedRow.timestamp).toBe('number');

    // Must have status
    expect(insertedRow.status).toBe('completed');

    // Must NOT have `type` column (doesn't exist in runs schema)
    expect(insertedRow.type).toBeUndefined();

    // Action info should be in metadata
    expect(insertedRow.metadata.action).toContain('apikey_set');
    expect(insertedRow.metadata.provider).toBe('litellm');
  });
});
