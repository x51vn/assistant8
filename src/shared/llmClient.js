/**
 * @fileoverview LLM Client — Unified API for LLM interactions
 *
 * Usable from Background Service Worker and UI (Preact side-panel).
 * API keys are persisted in Supabase `settings` table (per-user, RLS enforced).
 * chrome.storage.local is used **only** as a short-lived read-cache (TTL ≤ 15 min).
 *
 * MV3 constraints respected:
 *  - No dynamic import()
 *  - No persistent in-memory state
 *  - fetch()-only networking
 *  - CSP-safe (no remote script injection)
 *
 * @module llmClient
 */

import { createLogger, generateCorrelationId } from '../logger.js';
import { SYSTEM_PROMPT_KEYS, DEFAULT_SYSTEM_PROMPTS } from './systemPrompts.js';

const logger = createLogger('LLMClient');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {string} Default LiteLLM base URL */
const DEFAULT_BASE_URL = 'https://lite.x51.vn';

/** @type {number} Default timeout in ms (60 s) */
const DEFAULT_TIMEOUT_MS = 60_000;

/** @type {number} Default max retries for transient errors */
const DEFAULT_MAX_RETRIES = 3;

/** @type {number} Default short-lived cache TTL in ms (10 min) */
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** @type {string} Chrome storage key prefix for cached API keys */
const CACHE_KEY_PREFIX = 'llm_key_cache_';

/** @type {number} Default max symbols per batchEnrich call */
const DEFAULT_MAX_BATCH_SIZE = 10;

/** @type {string[]} Known provider identifiers */
const KNOWN_PROVIDERS = ['litellm', 'jira', 'confluence'];

/** @type {string} Supabase settings key pattern for API keys */
const settingsKeyForProvider = (provider) => `${provider}_api_key`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sleep helper for exponential backoff.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Read a short-lived cached value from chrome.storage.local.
 * Returns `null` if missing or expired.
 * @param {string} cacheKey
 * @returns {Promise<string|null>}
 */
async function readCache(cacheKey) {
  try {
    const result = await chrome.storage.local.get([cacheKey]);
    const entry = result[cacheKey];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Expired — remove lazily
      chrome.storage.local.remove([cacheKey]).catch(() => {});
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

/**
 * Write a short-lived cache entry to chrome.storage.local.
 * @param {string} cacheKey
 * @param {string} value
 * @param {number} ttlMs
 * @returns {Promise<void>}
 */
async function writeCache(cacheKey, value, ttlMs) {
  try {
    await chrome.storage.local.set({
      [cacheKey]: { value, expiresAt: Date.now() + ttlMs },
    });
  } catch {
    // Best-effort — cache failure is non-critical
  }
}

/**
 * Remove a cached key.
 * @param {string} cacheKey
 * @returns {Promise<void>}
 */
async function removeCache(cacheKey) {
  try {
    await chrome.storage.local.remove([cacheKey]);
  } catch {
    // Best-effort
  }
}

/**
 * Build normalized result envelope.
 * @param {Object} fields
 * @returns {import('./llmClient').LLMResult}
 */
function buildResult({ success, status = 0, data = null, errorCode = null, errorMessage = null, correlationId = null }) {
  return { success, status, data, errorCode, errorMessage, correlationId };
}

/**
 * Parse SSE or newline-delimited JSON stream.
 * Yields parsed objects from `data:` lines or raw JSON lines.
 * @param {ReadableStream<Uint8Array>} body
 * @yields {Object}
 */
async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // comment or empty

        let jsonStr = trimmed;
        if (trimmed.startsWith('data:')) {
          jsonStr = trimmed.slice(5).trim();
        }
        if (jsonStr === '[DONE]') return;

        try {
          yield JSON.parse(jsonStr);
        } catch {
          // Non-JSON line — skip
          logger.debug('SSE parse skip non-JSON line', { line: trimmed.slice(0, 80) });
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      const jsonStr = buffer.trim().startsWith('data:') ? buffer.trim().slice(5).trim() : buffer.trim();
      if (jsonStr && jsonStr !== '[DONE]') {
        try { yield JSON.parse(jsonStr); } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Determine if an HTTP status is retryable.
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status >= 500 || status === 429 || status === 0;
}

/**
 * Compute exponential backoff delay with optional Retry-After header.
 * @param {number} attempt 0-based
 * @param {Response|null} response
 * @returns {number} delay in ms
 */
function backoffDelay(attempt, response) {
  if (response) {
    const retryAfter = response.headers?.get?.('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
  }
  return Math.min(1000 * Math.pow(2, attempt), 30_000);
}

// ---------------------------------------------------------------------------
// API key helpers (Background-side: call Supabase via message;
//                   can also be called directly when running inside BG)
// ---------------------------------------------------------------------------

/**
 * Get API key for a provider.
 * 
 * When called from **Background** context (handlers), reads from Supabase
 * `settings` table via the imported supabase client (passed as option).
 * When called from **UI**, sends a message to Background.
 *
 * Short-lived cache in chrome.storage.local (TTL configurable, default 10 min).
 *
 * @param {string} provider - Provider identifier (e.g. 'litellm', 'jira', 'confluence')
 * @param {Object} [options]
 * @param {number} [options.cacheTtlMs=600000] - Cache TTL in ms
 * @param {boolean} [options.skipCache=false] - Bypass local cache
 * @param {Function} [options._readFromSupabase] - Internal: direct Supabase reader (BG only)
 * @returns {Promise<string|null>} The API key or null
 */
export async function getApiKey(provider, options = {}) {
  const { cacheTtlMs = DEFAULT_CACHE_TTL_MS, skipCache = false, _readFromSupabase } = options;
  const cacheKey = `${CACHE_KEY_PREFIX}${provider}`;

  // 1. Try local cache first (unless skipped)
  if (!skipCache) {
    const cached = await readCache(cacheKey);
    if (cached !== null) {
      logger.debug('getApiKey cache hit', { provider });
      return cached;
    }
  }

  // 2. Read from Supabase (Background direct) or via message (UI)
  let apiKey = null;

  if (typeof _readFromSupabase === 'function') {
    // Background context — direct DB read
    apiKey = await _readFromSupabase(provider);
  } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    // UI context — delegate to Background handler
    try {
      const { createMessage } = await import('./messageSchema.js');
      const response = await chrome.runtime.sendMessage(
        createMessage('SETTINGS_APIKEY_GET', { provider })
      );
      if (response?.success) {
        apiKey = response.apiKey || null;
      }
    } catch (err) {
      logger.warn('getApiKey message failed', { provider, error: err.message });
    }
  }

  // 3. Populate cache if key found
  if (apiKey) {
    await writeCache(cacheKey, apiKey, cacheTtlMs);
  }

  return apiKey;
}

/**
 * Set (persist) an API key for a provider.
 * Always delegates to Background handler which writes to Supabase.
 *
 * @param {string} provider
 * @param {string} key - The API key value
 * @param {Object} [options]
 * @param {string} [options.correlationId]
 * @param {number} [options.cacheTtlMs=600000]
 * @param {Function} [options._writeToSupabase] - Internal: direct Supabase writer (BG only)
 * @returns {Promise<import('./llmClient').LLMResult>}
 */
export async function setApiKey(provider, key, options = {}) {
  const { correlationId = generateCorrelationId(), cacheTtlMs = DEFAULT_CACHE_TTL_MS, _writeToSupabase } = options;

  if (!provider || !KNOWN_PROVIDERS.includes(provider)) {
    return buildResult({ success: false, errorCode: 'LLM_APIKEY_INVALID', errorMessage: `Unknown provider: ${provider}`, correlationId });
  }
  if (!key || typeof key !== 'string' || key.trim().length < 8) {
    return buildResult({ success: false, errorCode: 'LLM_APIKEY_INVALID', errorMessage: 'API key quá ngắn hoặc không hợp lệ', correlationId });
  }

  try {
    if (typeof _writeToSupabase === 'function') {
      // Background context — direct DB write
      await _writeToSupabase(provider, key.trim());
    } else if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const { createMessage } = await import('./messageSchema.js');
      const response = await chrome.runtime.sendMessage(
        createMessage('SETTINGS_APIKEY_SET', { provider, apiKey: key.trim(), correlationId })
      );
      if (!response?.success) {
        return buildResult({ success: false, errorCode: response?.errorCode || 'LLM_APIKEY_SAVE_FAILED', errorMessage: response?.errorMessage || 'Lưu API key thất bại', correlationId });
      }
    }

    // Update local cache
    const cacheKey = `${CACHE_KEY_PREFIX}${provider}`;
    await writeCache(cacheKey, key.trim(), cacheTtlMs);

    logger.info('setApiKey success', { provider, correlationId });
    return buildResult({ success: true, correlationId });
  } catch (err) {
    logger.error('setApiKey failed', { provider, error: err.message, correlationId });
    return buildResult({ success: false, errorCode: 'LLM_APIKEY_SAVE_FAILED', errorMessage: err.message, correlationId });
  }
}

/**
 * Migrate locally-stored API keys (chrome.storage.local) to Supabase.
 * Idempotent: if key already exists in Supabase, local copy is still removed.
 * Keys are never logged.
 *
 * @param {Object} [options]
 * @param {string} [options.correlationId]
 * @param {Function} [options._writeToSupabase] - BG direct writer
 * @returns {Promise<import('./llmClient').LLMResult>}
 */
export async function migrateLocalKeysToSupabase(options = {}) {
  const { correlationId = generateCorrelationId(), _writeToSupabase } = options;
  const migrated = [];
  const failed = [];

  // Known legacy local storage keys
  const legacyKeys = KNOWN_PROVIDERS.map((p) => ({ provider: p, localKey: `${p}_api_key` }));

  try {
    const localKeys = legacyKeys.map((k) => k.localKey);
    const stored = await chrome.storage.local.get(localKeys);

    for (const { provider, localKey } of legacyKeys) {
      const value = stored[localKey];
      if (!value || typeof value !== 'string' || value.trim().length === 0) continue;

      try {
        const setResult = await setApiKey(provider, value, { correlationId, _writeToSupabase });
        if (setResult.success) {
          // Remove local copy
          await chrome.storage.local.remove([localKey]);
          migrated.push(provider);
          logger.info('migrateLocalKeysToSupabase: migrated', { provider, correlationId });
        } else {
          failed.push({ provider, error: setResult.errorMessage });
        }
      } catch (err) {
        failed.push({ provider, error: err.message });
        logger.warn('migrateLocalKeysToSupabase: failed for provider', { provider, error: err.message, correlationId });
      }
    }

    return buildResult({
      success: failed.length === 0,
      data: { migrated, failed },
      correlationId,
      errorCode: failed.length > 0 ? 'LLM_APIKEY_MIGRATE_FAILED' : null,
      errorMessage: failed.length > 0 ? `Di chuyển thất bại cho: ${failed.map((f) => f.provider).join(', ')}` : null,
    });
  } catch (err) {
    logger.error('migrateLocalKeysToSupabase error', { error: err.message, correlationId });
    return buildResult({ success: false, errorCode: 'LLM_APIKEY_MIGRATE_FAILED', errorMessage: err.message, correlationId });
  }
}

/**
 * Health-check a provider by sending a lightweight request.
 *
 * @param {string} provider
 * @param {Object} [options]
 * @param {string} [options.correlationId]
 * @param {number} [options.timeoutMs=10000]
 * @param {string} [options.baseUrl]
 * @param {Function} [options._readFromSupabase]
 * @returns {Promise<import('./llmClient').LLMResult>}
 */
export async function healthCheck(provider, options = {}) {
  const {
    correlationId = generateCorrelationId(),
    timeoutMs = 10_000,
    baseUrl = DEFAULT_BASE_URL,
    _readFromSupabase,
  } = options;

  let timer;
  try {
    logger.info('healthCheck start', { provider, baseUrl, timeoutMs, correlationId });

    const apiKey = await getApiKey(provider, { _readFromSupabase, skipCache: true });
    if (!apiKey) {
      logger.warn('healthCheck aborted — no API key', { provider, correlationId });
      return buildResult({ success: false, status: 0, errorCode: 'LLM_APIKEY_NOT_FOUND', errorMessage: `Không tìm thấy API key cho ${provider}`, correlationId });
    }
    logger.debug('healthCheck API key found', { provider, keyLength: apiKey.length, correlationId });

    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);

    let url;
    let fetchOptions;

    if (provider === 'litellm') {
      url = `${baseUrl}/health`;
      fetchOptions = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-Correlation-Id': correlationId,
          'X-Timestamp': String(Date.now()),
        },
        signal: controller.signal,
      };
    } else if (provider === 'jira' || provider === 'confluence') {
      // Atlassian health: verify auth by fetching user profile
      url = provider === 'jira'
        ? 'https://x51labs.atlassian.net/rest/api/3/myself'
        : 'https://x51labs.atlassian.net/wiki/rest/api/user/current';
      fetchOptions = {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Accept': 'application/json',
          'X-Correlation-Id': correlationId,
        },
        signal: controller.signal,
      };
    } else {
      clearTimeout(timer);
      logger.warn('healthCheck unknown provider', { provider, correlationId });
      return buildResult({ success: false, errorCode: 'LLM_APIKEY_INVALID', errorMessage: `Unknown provider: ${provider}`, correlationId });
    }

    logger.info('healthCheck fetch', { provider, url, method: fetchOptions.method, correlationId });

    const res = await fetch(url, fetchOptions);
    clearTimeout(timer);

    logger.info('healthCheck response', { provider, url, status: res.status, statusText: res.statusText, correlationId });

    if (res.ok) {
      return buildResult({ success: true, status: res.status, data: { provider, message: 'Kết nối thành công' }, correlationId });
    }

    const errBody = await res.text().catch(() => '');
    logger.warn('healthCheck HTTP error', { provider, status: res.status, statusText: res.statusText, body: errBody.slice(0, 300), correlationId });
    return buildResult({ success: false, status: res.status, errorCode: 'LLM_HEALTHCHECK_FAILED', errorMessage: `HTTP ${res.status}: ${res.statusText}`, correlationId });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      logger.warn('healthCheck timeout', { provider, timeoutMs, correlationId });
      return buildResult({ success: false, errorCode: 'TIMEOUT', errorMessage: 'Health check quá thời gian chờ', correlationId });
    }
    logger.error('healthCheck error', { provider, error: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | '), correlationId });
    return buildResult({ success: false, errorCode: 'LLM_HEALTHCHECK_FAILED', errorMessage: err.message, correlationId });
  }
}

// ---------------------------------------------------------------------------
// Core LLM operations
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request (non-streaming).
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} [options]
 * @param {string} [options.systemPrompt] - Prepended as system message
 * @param {string} [options.model] - Model identifier (provider-dependent)
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens]
 * @param {string} [options.correlationId]
 * @param {number} [options.timeoutMs=60000]
 * @param {number} [options.maxRetries=3]
 * @param {string} [options.baseUrl]
 * @param {string} [options.provider='litellm']
 * @param {Function} [options._readFromSupabase] - BG direct reader
 * @returns {Promise<import('./llmClient').LLMResult>}
 */
export async function chat(messages, options = {}) {
  const {
    systemPrompt,
    model,
    temperature = 0.7,
    maxTokens,
    correlationId = generateCorrelationId(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseUrl = DEFAULT_BASE_URL,
    provider = 'litellm',
    _readFromSupabase,
  } = options;

  const apiKey = await getApiKey(provider, { _readFromSupabase });
  if (!apiKey) {
    return buildResult({ success: false, errorCode: 'LLM_APIKEY_NOT_FOUND', errorMessage: `API key chưa được cấu hình cho ${provider}`, correlationId });
  }

  // Build messages array
  const msgs = [];
  if (systemPrompt) {
    msgs.push({ role: 'system', content: systemPrompt });
  }
  msgs.push(...messages);

  const body = {
    messages: msgs,
    temperature,
    stream: false,
  };
  if (model) body.model = model;
  if (maxTokens) body.max_tokens = maxTokens;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const chatUrl = `${baseUrl}/v1/chat/completions`;
      logger.debug('chat fetch', { attempt, url: chatUrl, correlationId });
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Correlation-Id': correlationId,
          'X-Timestamp': String(Date.now()),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || '';
        logger.info('chat success', { provider, model: json.model, contentLength: content.length, status: res.status, correlationId });
        return buildResult({ success: true, status: res.status, data: { content, raw: json, model: json.model }, correlationId });
      }

      // Not retryable status → return immediately
      if (!isRetryableStatus(res.status)) {
        const errBody = await res.text().catch(() => '');
        logger.warn('chat non-retryable error', { status: res.status, body: errBody.slice(0, 200), correlationId });
        return buildResult({ success: false, status: res.status, errorCode: 'LLM_ERROR', errorMessage: `HTTP ${res.status}: ${errBody.slice(0, 200)}`, correlationId });
      }

      // Retryable — backoff
      lastError = { status: res.status, message: `HTTP ${res.status}` };
      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt, res);
        logger.warn('chat retry', { attempt, status: res.status, delay, correlationId });
        await sleep(delay);
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        return buildResult({ success: false, errorCode: 'TIMEOUT', errorMessage: 'Yêu cầu quá thời gian chờ', correlationId });
      }
      lastError = { status: 0, message: err.message };
      logger.error('chat fetch error', { attempt, error: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | '), correlationId });
      if (attempt < maxRetries) {
        await sleep(delay);
      }
    }
  }

  logger.warn('chat exhausted retries', { provider, lastError, maxRetries, correlationId });
  return buildResult({ success: false, status: lastError?.status || 0, errorCode: 'LLM_ERROR', errorMessage: lastError?.message || 'Max retries exceeded', correlationId });
}

/**
 * Streaming chat completion via SSE / chunked JSON.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {Function} onChunk - Called with ({ partialText: string, done: boolean, meta?: Object })
 * @param {Object} [options] - Same as chat() options
 * @returns {Promise<import('./llmClient').LLMResult>} Resolves when stream ends
 */
export async function streamChat(messages, onChunk, options = {}) {
  const {
    systemPrompt,
    model,
    temperature = 0.7,
    maxTokens,
    correlationId = generateCorrelationId(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    baseUrl = DEFAULT_BASE_URL,
    provider = 'litellm',
    _readFromSupabase,
  } = options;

  logger.info('streamChat start', { provider, baseUrl, model: model || 'default', msgCount: messages.length, correlationId });

  const apiKey = await getApiKey(provider, { _readFromSupabase });
  if (!apiKey) {
    logger.warn('streamChat aborted — no API key', { provider, correlationId });
    return buildResult({ success: false, errorCode: 'LLM_APIKEY_NOT_FOUND', errorMessage: `API key chưa được cấu hình cho ${provider}`, correlationId });
  }

  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  msgs.push(...messages);

  const body = { messages: msgs, temperature, stream: true };
  if (model) body.model = model;
  if (maxTokens) body.max_tokens = maxTokens;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Correlation-Id': correlationId,
          'X-Timestamp': String(Date.now()),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        if (!isRetryableStatus(res.status)) {
          const errBody = await res.text().catch(() => '');
          return buildResult({ success: false, status: res.status, errorCode: 'LLM_ERROR', errorMessage: `HTTP ${res.status}: ${errBody.slice(0, 200)}`, correlationId });
        }
        lastError = { status: res.status, message: `HTTP ${res.status}` };
        if (attempt < maxRetries) {
          const delay = backoffDelay(attempt, res);
          logger.warn('streamChat retry', { attempt, status: res.status, delay, correlationId });
          await sleep(delay);
          continue;
        }
        break;
      }

      // Stream response
      let accumulated = '';
      for await (const chunk of parseSSEStream(res.body)) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (delta) accumulated += delta;
        const done = finishReason === 'stop' || finishReason === 'length';
        try {
          onChunk({ partialText: accumulated, done, meta: { chunk, model: chunk.model } });
        } catch (cbErr) {
          logger.warn('streamChat onChunk callback error', { error: cbErr.message });
        }
        if (done) break;
      }

      // Final callback if not already done
      onChunk({ partialText: accumulated, done: true, meta: { model } });

      return buildResult({ success: true, status: res.status, data: { content: accumulated, model }, correlationId });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        return buildResult({ success: false, errorCode: 'TIMEOUT', errorMessage: 'Stream quá thời gian chờ', correlationId });
      }
      lastError = { status: 0, message: err.message };
      if (attempt < maxRetries) {
        const delay = backoffDelay(attempt, null);
        logger.warn('streamChat retry (error)', { attempt, error: err.message, delay, correlationId });
        await sleep(delay);
      }
    }
  }

  return buildResult({ success: false, status: lastError?.status || 0, errorCode: 'LLM_ERROR', errorMessage: lastError?.message || 'Max retries exceeded', correlationId });
}

/**
 * Summarize a text block using the LLM.
 *
 * @param {string} text - Text to summarize
 * @param {Object} [options] - Passed to chat(); additionally:
 * @param {string} [options.language='vi'] - Summary language hint
 * @returns {Promise<import('./llmClient').LLMResult>}
 */
export async function summarize(text, options = {}) {
  const { language = 'vi', ...chatOpts } = options;
  const systemPrompt = language === 'vi'
    ? 'Bạn là trợ lý AI. Hãy tóm tắt ngắn gọn, rõ ràng nội dung sau. Trả lời bằng tiếng Việt.'
    : 'You are a helpful AI assistant. Summarize the following text concisely.';

  return chat(
    [{ role: 'user', content: text }],
    { systemPrompt, ...chatOpts }
  );
}

/**
 * Build a batch-enrichment payload for watchlist symbols using the
 * WATCHLIST_ENRICH prompt template from systemPrompts.js.
 *
 * Splits into batches of `maxBatchSize` and returns an array of
 * message payloads ready for `chat()`.
 *
 * @param {string[]} symbols - Stock symbols (e.g. ['VNM','HPG','FPT'])
 * @param {Object} [options]
 * @param {number} [options.maxBatchSize=10]
 * @param {string} [options.asOfDate] - ISO date string; defaults to today
 * @param {Object[]} [options.watchlistItems] - Optional enriched watchlist rows
 * @param {string} [options.correlationId]
 * @returns {{ batches: Array<{ symbols: string[], messages: Array<{role: string, content: string}> }>, correlationId: string }}
 */
export function batchEnrich(symbols, options = {}) {
  const {
    maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
    asOfDate = new Date().toISOString().split('T')[0],
    watchlistItems = [],
    correlationId = generateCorrelationId(),
  } = options;

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { batches: [], correlationId };
  }

  // Get the WATCHLIST_ENRICH template
  const template = DEFAULT_SYSTEM_PROMPTS[SYSTEM_PROMPT_KEYS.WATCHLIST_ENRICH];

  // Chunk symbols
  const batches = [];
  for (let i = 0; i < symbols.length; i += maxBatchSize) {
    const batchSymbols = symbols.slice(i, i + maxBatchSize);

    // Build watchlist items JSON for this batch
    const items = batchSymbols.map((sym) => {
      const existing = watchlistItems.find((w) => w.symbol === sym);
      return existing || { symbol: sym };
    });

    // Fill template placeholders
    const filledPrompt = template
      .replace('{WATCHLIST_ITEMS_JSON}', JSON.stringify(items, null, 2))
      .replace('{AS_OF_DATE}', asOfDate);

    batches.push({
      symbols: batchSymbols,
      messages: [{ role: 'user', content: filledPrompt }],
    });
  }

  return { batches, correlationId };
}
