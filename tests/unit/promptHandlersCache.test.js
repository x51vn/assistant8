import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES } from '../../src/shared/messageSchema.js';

const {
  handlers,
  mockSupabase,
  mockReadPromptCache,
  mockWritePromptCache,
  mockRemovePromptCache,
  mockRequireAuth
} = vi.hoisted(() => ({
  handlers: new Map(),
  mockSupabase: { from: vi.fn() },
  mockReadPromptCache: vi.fn(),
  mockWritePromptCache: vi.fn(),
  mockRemovePromptCache: vi.fn(),
  mockRequireAuth: vi.fn()
}));

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: mockSupabase
}));

vi.mock('../../src/background/messageRouter.js', () => ({
  registerHandler: vi.fn((type, handler) => handlers.set(type, handler))
}));

vi.mock('../../src/background/utils/auth.js', () => ({
  requireAuth: mockRequireAuth
}));

vi.mock('../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn((operation) => operation())
}));

vi.mock('../../src/background/services/promptCacheService.js', async () => {
  const actual = await vi.importActual('../../src/background/services/promptCacheService.js');
  return {
    ...actual,
    readPromptCache: mockReadPromptCache,
    writePromptCache: mockWritePromptCache,
    removePromptCache: mockRemovePromptCache
  };
});

vi.mock('../../src/background/handlers/contextMenu.js', () => ({
  invalidatePromptCache: vi.fn()
}));

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startOperation: vi.fn(() => 'cid'),
    endOperation: vi.fn()
  }),
  generateCorrelationId: vi.fn(() => 'cid')
}));

await import('../../src/background/handlers/prompts.js');

function makeMessage(type, data = {}) {
  return {
    v: 1,
    type,
    correlationId: 'test-cid',
    timestamp: Date.now(),
    data
  };
}

function setupSelectRows(rows) {
  const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
  const inFn = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn(() => ({ eq, in: inFn }));
  mockSupabase.from.mockReturnValue({ select });
  return { select, eq, inFn };
}

function setupUpsertSuccess() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  mockSupabase.from.mockReturnValue({ upsert });
  return { upsert };
}

describe('Prompts handler cache behavior', () => {
  const cachedPrompts = {
    'prompt.master': { key: 'prompt.master', content: 'cached master', promptType: 'system', isSystem: true },
    'writing.email': { key: 'writing.email', content: 'cached email', promptType: 'writing', isSystem: true }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('user-123');
    mockReadPromptCache.mockResolvedValue({ hit: false, reason: 'missing' });
    mockWritePromptCache.mockResolvedValue({ success: true });
    mockRemovePromptCache.mockResolvedValue({ success: true });
  });

  it('serves PROMPTS_GET_ALL from fresh cache without querying Supabase', async () => {
    mockReadPromptCache.mockResolvedValue({
      hit: true,
      stale: false,
      prompts: cachedPrompts,
      cachedAt: 123,
      source: 'supabase'
    });

    const handler = handlers.get(MESSAGE_TYPES.PROMPTS_GET_ALL);
    const response = await handler(makeMessage(MESSAGE_TYPES.PROMPTS_GET_ALL, { preferCache: true }));

    expect(response.prompts).toEqual(cachedPrompts);
    expect(response.cache).toMatchObject({ hit: true, stale: false });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('force refresh bypasses cache and writes refreshed prompts', async () => {
    setupSelectRows([
      {
        id: 'p1',
        key: 'prompt.master',
        title: 'Master Prompt',
        content: 'db master',
        tags: [],
        prompt_type: 'system',
        is_system: true,
        updated_at: '2026-04-27T00:00:00.000Z'
      }
    ]);

    const handler = handlers.get(MESSAGE_TYPES.PROMPTS_GET_ALL);
    const response = await handler(makeMessage(MESSAGE_TYPES.PROMPTS_GET_ALL, {
      preferCache: true,
      forceRefresh: true
    }));

    expect(response.prompts['prompt.master'].content).toBe('db master');
    expect(mockReadPromptCache).not.toHaveBeenCalled();
    expect(mockWritePromptCache).toHaveBeenCalledWith('user-123', response.prompts, expect.any(Object));
  });

  it('serves PROMPTS_GET_BY_TYPE from fresh all-prompts cache', async () => {
    mockReadPromptCache.mockResolvedValue({
      hit: true,
      stale: false,
      prompts: cachedPrompts,
      cachedAt: 123,
      source: 'supabase'
    });

    const handler = handlers.get(MESSAGE_TYPES.PROMPTS_GET_BY_TYPE);
    const response = await handler(makeMessage(MESSAGE_TYPES.PROMPTS_GET_BY_TYPE, {
      promptType: 'writing',
      preferCache: true
    }));

    expect(Object.keys(response.prompts)).toEqual(['writing.email']);
    expect(response.prompts['writing.email'].content).toBe('cached email');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('updates cache after full prompt upsert success', async () => {
    setupUpsertSuccess();

    const prompts = {
      'prompt.master': { key: 'prompt.master', title: 'Master Prompt', content: 'saved', isSystem: true }
    };
    const handler = handlers.get(MESSAGE_TYPES.PROMPTS_UPSERT);
    const response = await handler(makeMessage(MESSAGE_TYPES.PROMPTS_UPSERT, { prompts }));

    expect(response.success).toBe(true);
    expect(mockWritePromptCache).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        'prompt.master': expect.objectContaining(prompts['prompt.master'])
      }),
      expect.any(Object)
    );
    expect(mockRemovePromptCache).not.toHaveBeenCalled();
  });

  it('invalidates cache after partial prompt upsert failure', async () => {
    setupUpsertSuccess();

    const prompts = {
      'writing.email': { key: 'writing.email', title: 'Writing Email', content: 'saved', isSystem: true },
      'prompt.master': { key: 'prompt.master', title: 'Master Prompt', content: '', isSystem: true }
    };
    const handler = handlers.get(MESSAGE_TYPES.PROMPTS_UPSERT);
    const response = await handler(makeMessage(MESSAGE_TYPES.PROMPTS_UPSERT, { prompts }));

    expect(response.partialSuccess).toBe(true);
    expect(mockRemovePromptCache).toHaveBeenCalledWith('user-123');
    expect(mockWritePromptCache).not.toHaveBeenCalled();
  });
});
