/**
 * @fileoverview Unit Tests for llmClient module
 * Tests: chat, streamChat, summarize, batchEnrich,
 *        getApiKey, setApiKey, migrateLocalKeysToSupabase, healthCheck
 *
 * Mocks: fetch, chrome.storage.local, chrome.runtime.sendMessage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startOperation: vi.fn(() => 'op-id'),
    endOperation: vi.fn(),
  })),
  generateCorrelationId: vi.fn(() => 'test-corr-id'),
}));

// Minimal chrome API stubs
const storageStore = {};
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        const result = {};
        for (const k of (Array.isArray(keys) ? keys : [keys])) {
          if (storageStore[k] !== undefined) result[k] = storageStore[k];
        }
        return result;
      }),
      set: vi.fn(async (obj) => {
        Object.assign(storageStore, obj);
      }),
      remove: vi.fn(async (keys) => {
        for (const k of (Array.isArray(keys) ? keys : [keys])) {
          delete storageStore[k];
        }
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
  },
};
globalThis.chrome = chromeMock;

// Global fetch mock
const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

// Import module under test (after mocks)
import {
  chat,
  streamChat,
  summarize,
  batchEnrich,
  getApiKey,
  setApiKey,
  migrateLocalKeysToSupabase,
  healthCheck,
} from '../../src/shared/llmClient.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (key) => headers[key] || null,
    },
  };
}

/** Simulate a readable SSE stream from lines */
function sseStream(lines) {
  const encoder = new TextEncoder();
  const data = lines.join('\n') + '\n';
  let sent = false;
  return new ReadableStream({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(encoder.encode(data));
      } else {
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  // Clear storage store
  for (const k of Object.keys(storageStore)) delete storageStore[k];
});

// ======================= getApiKey ========================================

describe('getApiKey', () => {
  it('returns cached value when present and not expired', async () => {
    storageStore['llm_key_cache_litellm'] = { value: 'sk-cached', expiresAt: Date.now() + 60_000 };
    const key = await getApiKey('litellm');
    expect(key).toBe('sk-cached');
  });

  it('returns null when cache is expired', async () => {
    storageStore['llm_key_cache_litellm'] = { value: 'sk-old', expiresAt: Date.now() - 1000 };
    // No sendMessage mock → will not fetch from BG
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: false });
    const key = await getApiKey('litellm');
    expect(key).toBeNull();
  });

  it('reads from BG via sendMessage when cache misses', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true, apiKey: 'sk-from-bg' });
    const key = await getApiKey('litellm', { skipCache: true });
    expect(key).toBe('sk-from-bg');
    // Should have cached it
    expect(storageStore['llm_key_cache_litellm']).toBeDefined();
    expect(storageStore['llm_key_cache_litellm'].value).toBe('sk-from-bg');
  });

  it('calls _readFromSupabase when provided (BG context)', async () => {
    const reader = vi.fn(async () => 'sk-direct');
    const key = await getApiKey('litellm', { _readFromSupabase: reader, skipCache: true });
    expect(reader).toHaveBeenCalledWith('litellm');
    expect(key).toBe('sk-direct');
  });
});

// ======================= setApiKey ========================================

describe('setApiKey', () => {
  it('validates provider', async () => {
    const res = await setApiKey('unknown_provider', 'sk-123456789');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('LLM_APIKEY_INVALID');
  });

  it('validates key length', async () => {
    const res = await setApiKey('litellm', 'short');
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('LLM_APIKEY_INVALID');
  });

  it('calls _writeToSupabase when provided', async () => {
    const writer = vi.fn(async () => {});
    const res = await setApiKey('litellm', 'sk-123456789-valid-key', { _writeToSupabase: writer });
    expect(writer).toHaveBeenCalledWith('litellm', 'sk-123456789-valid-key');
    expect(res.success).toBe(true);
  });

  it('sends message to BG when no writer provided', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
    const res = await setApiKey('litellm', 'sk-123456789-valid-key');
    expect(res.success).toBe(true);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalled();
  });
});

// ======================= migrateLocalKeysToSupabase =======================

describe('migrateLocalKeysToSupabase', () => {
  it('migrates existing local keys', async () => {
    storageStore['litellm_api_key'] = 'sk-local-legacy-key-1234';
    const writer = vi.fn(async () => {});

    const res = await migrateLocalKeysToSupabase({ _writeToSupabase: writer });
    expect(res.success).toBe(true);
    expect(res.data.migrated).toContain('litellm');
    // Local key should be removed
    expect(storageStore['litellm_api_key']).toBeUndefined();
  });

  it('is idempotent when no local keys exist', async () => {
    const writer = vi.fn(async () => {});
    const res = await migrateLocalKeysToSupabase({ _writeToSupabase: writer });
    expect(res.success).toBe(true);
    expect(res.data.migrated).toHaveLength(0);
    expect(writer).not.toHaveBeenCalled();
  });

  it('reports partial failures', async () => {
    storageStore['litellm_api_key'] = 'sk-local-legacy-key-1234';
    storageStore['jira_api_key'] = 'jira-token-12345678';
    const writer = vi.fn(async (provider) => {
      if (provider === 'jira') throw new Error('DB error');
    });

    const res = await migrateLocalKeysToSupabase({ _writeToSupabase: writer });
    expect(res.data.migrated).toContain('litellm');
    expect(res.data.failed).toHaveLength(1);
    expect(res.data.failed[0].provider).toBe('jira');
  });
});

// ======================= healthCheck ======================================

describe('healthCheck', () => {
  it('returns error when no API key found', async () => {
    const reader = vi.fn(async () => null);
    const res = await healthCheck('litellm', { _readFromSupabase: reader });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('LLM_APIKEY_NOT_FOUND');
  });

  it('returns success on 200 OK', async () => {
    const reader = vi.fn(async () => 'sk-valid-key-12345');
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

    const res = await healthCheck('litellm', { _readFromSupabase: reader });
    expect(res.success).toBe(true);
    expect(res.status).toBe(200);
  });

  it('returns failure on non-OK status', async () => {
    const reader = vi.fn(async () => 'sk-valid-key-12345');
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

    const res = await healthCheck('litellm', { _readFromSupabase: reader });
    expect(res.success).toBe(false);
    expect(res.status).toBe(401);
  });

  it('handles timeout (AbortError)', async () => {
    const reader = vi.fn(async () => 'sk-valid-key-12345');
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    const res = await healthCheck('litellm', { _readFromSupabase: reader, timeoutMs: 1 });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('TIMEOUT');
  });
});

// ======================= chat =============================================

describe('chat', () => {
  const msgs = [{ role: 'user', content: 'Hello' }];

  it('returns content on successful chat', async () => {
    // Provide key via _readFromSupabase
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: 'Hi there!' } }],
        model: 'gpt-4',
      })
    );

    const res = await chat(msgs, { _readFromSupabase: reader });
    expect(res.success).toBe(true);
    expect(res.data.content).toBe('Hi there!');
  });

  it('returns error when no API key', async () => {
    const reader = vi.fn(async () => null);
    const res = await chat(msgs, { _readFromSupabase: reader });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('LLM_APIKEY_NOT_FOUND');
  });

  it('retries on 500 and eventually fails', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500));

    const res = await chat(msgs, { _readFromSupabase: reader, maxRetries: 2 });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('LLM_ERROR');
    // Should have called fetch 3 times (1 initial + 2 retries)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 400 (client error)', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad request' }, 400));

    const res = await chat(msgs, { _readFromSupabase: reader, maxRetries: 3 });
    expect(res.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles AbortError as timeout', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    const res = await chat(msgs, { _readFromSupabase: reader, timeoutMs: 1 });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('TIMEOUT');
  });

  it('includes systemPrompt as first system message', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    );

    await chat(msgs, { systemPrompt: 'You are a helper', _readFromSupabase: reader });

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.messages[0]).toEqual({ role: 'system', content: 'You are a helper' });
    expect(callBody.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('sends correct headers', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    );

    await chat(msgs, { correlationId: 'cid-42', _readFromSupabase: reader });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer sk-test-key-1234567');
    expect(headers['X-Correlation-Id']).toBe('cid-42');
    expect(headers['X-Timestamp']).toBeDefined();
  });
});

// ======================= streamChat =======================================

describe('streamChat', () => {
  const msgs = [{ role: 'user', content: 'Hi' }];

  it('parses SSE stream and calls onChunk', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    const chunks = [];
    const onChunk = vi.fn((c) => chunks.push(c));

    const sseBody = sseStream([
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}],"model":"gpt-4"}',
      'data: {"choices":[{"delta":{"content":" World"},"finish_reason":null}],"model":"gpt-4"}',
      'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"model":"gpt-4"}',
      'data: [DONE]',
    ]);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseBody,
      headers: { get: () => null },
    });

    const res = await streamChat(msgs, onChunk, { _readFromSupabase: reader });
    expect(res.success).toBe(true);
    expect(res.data.content).toBe('Hello World');
    // onChunk should have been called multiple times
    expect(onChunk.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Last call should have done=true
    const lastCall = onChunk.mock.calls[onChunk.mock.calls.length - 1][0];
    expect(lastCall.done).toBe(true);
  });

  it('returns error when no API key', async () => {
    const reader = vi.fn(async () => null);
    const res = await streamChat(msgs, vi.fn(), { _readFromSupabase: reader });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('LLM_APIKEY_NOT_FOUND');
  });
});

// ======================= summarize ========================================

describe('summarize', () => {
  it('calls chat with summarize system prompt (Vietnamese)', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'Tóm tắt...' } }] })
    );

    const res = await summarize('Long text here...', { _readFromSupabase: reader });
    expect(res.success).toBe(true);
    expect(res.data.content).toBe('Tóm tắt...');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('tiếng Việt');
  });

  it('uses English system prompt when language is en', async () => {
    const reader = vi.fn(async () => 'sk-test-key-1234567');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { content: 'Summary...' } }] })
    );

    await summarize('Long text...', { language: 'en', _readFromSupabase: reader });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Summarize');
  });
});

// ======================= batchEnrich ======================================

describe('batchEnrich', () => {
  it('returns empty batches for empty symbols', () => {
    const result = batchEnrich([]);
    expect(result.batches).toHaveLength(0);
  });

  it('creates single batch for <= maxBatchSize symbols', () => {
    const result = batchEnrich(['VNM', 'HPG', 'FPT'], { maxBatchSize: 10 });
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].symbols).toEqual(['VNM', 'HPG', 'FPT']);
    // Messages should contain the template with JSON
    expect(result.batches[0].messages[0].content).toContain('VNM');
    expect(result.batches[0].messages[0].content).toContain('entry');
  });

  it('splits into multiple batches when exceeding maxBatchSize', () => {
    const symbols = Array.from({ length: 15 }, (_, i) => `SYM${i}`);
    const result = batchEnrich(symbols, { maxBatchSize: 5 });
    expect(result.batches).toHaveLength(3);
    expect(result.batches[0].symbols).toHaveLength(5);
    expect(result.batches[1].symbols).toHaveLength(5);
    expect(result.batches[2].symbols).toHaveLength(5);
  });

  it('includes asOfDate in the prompt', () => {
    const result = batchEnrich(['VNM'], { asOfDate: '2026-03-01' });
    expect(result.batches[0].messages[0].content).toContain('2026-03-01');
  });

  it('uses watchlistItems when provided', () => {
    const items = [{ symbol: 'VNM', current_price: 75000 }];
    const result = batchEnrich(['VNM'], { watchlistItems: items });
    expect(result.batches[0].messages[0].content).toContain('75000');
  });
});
