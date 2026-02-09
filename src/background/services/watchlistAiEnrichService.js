/**
 * @fileoverview Watchlist AI Enrichment Service
 * Core business logic for AI-based watchlist enrichment
 *
 * Responsibilities:
 * 1. Fetch full watchlist from X-Neews (paginated)
 * 2. Build prompt from template with batch of symbols
 * 3. Send prompt to ChatGPT (via SEND_PROMPT)
 * 4. Parse JSON response & validate
 * 5. Update watchlist items via X-Neews API
 * 6. Persist run state for MV3 crash recovery
 *
 * Architecture:
 * - Stateless service (can be called from handler or alarm)
 * - Run state persisted in chrome.storage.local (operational, not business data)
 * - Anti-overlap lock with TTL (2h) to prevent concurrent runs
 */

import { createLogger } from '../../logger.js';
import { generateCorrelationId } from '../../logger.js';
import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';
import { route } from '../messageRouter.js';
import { SYSTEM_PROMPT_KEYS } from '../../shared/systemPrompts.js';
import { DEFAULT_SYSTEM_PROMPTS } from '../../shared/systemPrompts.js';
import { parseJsonOnlyResponse, validateEnrichItems } from '../../shared/watchlistEnrichParser.js';
import {
  WATCHLIST_AI_ENRICH_BATCH_SIZE,
  WATCHLIST_AI_ENRICH_STATE_KEY,
  WATCHLIST_AI_ENRICH_LOCK_EXPIRY_MS
} from '../../shared/appConstants.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';

const logger = createLogger('Services/WatchlistAiEnrich');

// X-Neews API config (shared with xneewsWatchlist.js)
const XNEEWS_API_BASE = import.meta.env.VITE_XNEEWS_API_URL || 'https://api.x51.vn/api';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'xneews_access_token'
};

/**
 * Vietnamese error messages
 */
const ERROR_MESSAGES = {
  INVALID_JSON_OUTPUT: 'ChatGPT không trả về JSON hợp lệ. Vui lòng thử lại.',
  NO_ITEMS_TO_UPDATE: 'Không có mã nào hợp lệ để cập nhật.',
  AUTH_ERROR: 'Phiên đăng nhập X-Neews hết hạn. Vui lòng đăng nhập lại.',
  NETWORK_ERROR: 'Không có kết nối internet. Vui lòng kiểm tra mạng.',
  API_ERROR: 'Lỗi kết nối API. Vui lòng thử lại.',
  LOCK_ACTIVE: 'Đang có một lần chạy enrichment khác. Vui lòng chờ.',
  NO_WATCHLIST: 'Watchlist trống. Không có mã nào để phân tích.',
  PROMPT_SEND_FAILED: 'Không thể gửi prompt tới ChatGPT. Vui lòng thử lại.'
};

// ============================================================================
// STATE MANAGEMENT (MV3-safe, chrome.storage.local)
// ============================================================================

/**
 * Load enrichment run state from chrome.storage.local
 * @returns {Promise<Object|null>}
 */
async function loadRunState() {
  const stored = await chrome.storage.local.get([WATCHLIST_AI_ENRICH_STATE_KEY]);
  return stored[WATCHLIST_AI_ENRICH_STATE_KEY] || null;
}

/**
 * Save enrichment run state
 * @param {Object} state
 */
async function saveRunState(state) {
  await chrome.storage.local.set({ [WATCHLIST_AI_ENRICH_STATE_KEY]: state });
}

/**
 * Clear enrichment run state
 */
async function clearRunState() {
  await chrome.storage.local.remove([WATCHLIST_AI_ENRICH_STATE_KEY]);
}

/**
 * Check if enrichment lock is active
 * @returns {Promise<boolean>}
 */
async function isLockActive() {
  const state = await loadRunState();
  if (!state || !state.lockUntil) return false;
  return Date.now() < state.lockUntil;
}

/**
 * Acquire lock for enrichment run
 * @param {string} runId
 * @returns {Promise<boolean>} true if lock acquired
 */
async function acquireLock(runId) {
  if (await isLockActive()) return false;

  await saveRunState({
    runId,
    lockUntil: Date.now() + WATCHLIST_AI_ENRICH_LOCK_EXPIRY_MS,
    startedAt: Date.now(),
    cursor: 0,
    totalSymbols: 0,
    successCount: 0,
    failureCount: 0,
    stage: 'starting'
  });

  return true;
}

// ============================================================================
// X-NEEWS API HELPERS
// ============================================================================

/**
 * Get X-Neews access token
 * @returns {Promise<string|null>}
 */
async function getAccessToken() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.ACCESS_TOKEN]);
  return result[STORAGE_KEYS.ACCESS_TOKEN] || null;
}

/**
 * Fetch with retry + exponential backoff (reused from xneewsWatchlist pattern)
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 400 && response.status < 500) return response;
      if (!response.ok && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Fetch ALL watchlist items from X-Neews (paginated)
 * @returns {Promise<Array>} Full list of watchlist items
 */
async function fetchAllWatchlistItems() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error(ERROR_MESSAGES.AUTH_ERROR);
  }

  const allItems = [];
  let page = 1;
  const size = 100; // Max page size

  while (true) {
    const url = new URL(`${XNEEWS_API_BASE}/watchlist/`);
    url.searchParams.set('page', page.toString());
    url.searchParams.set('size', size.toString());

    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      throw new Error(ERROR_MESSAGES.AUTH_ERROR);
    }

    if (!response.ok) {
      throw new Error(ERROR_MESSAGES.API_ERROR);
    }

    const data = await response.json();
    const items = data.data || [];
    allItems.push(...items);

    const totalPages = data.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allItems;
}

/**
 * Update a single watchlist item via X-Neews API
 * @param {string} symbol
 * @param {Object} updates - { entry, target, stoploss, investment_thesis }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function updateWatchlistItem(symbol, updates) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, error: 'AUTH_ERROR' };
  }

  // Build request body - only non-null fields
  const requestBody = {};
  if (updates.entry !== null && updates.entry !== undefined) {
    requestBody.entry = Number(updates.entry);
  }
  if (updates.target !== null && updates.target !== undefined) {
    requestBody.target = Number(updates.target);
  }
  if (updates.stoploss !== null && updates.stoploss !== undefined) {
    requestBody.stoploss = Number(updates.stoploss);
  }
  if (updates.investment_thesis !== null && updates.investment_thesis !== undefined) {
    requestBody.investment_thesis = updates.investment_thesis;
  }

  // Skip if nothing to update
  if (Object.keys(requestBody).length === 0) {
    return { success: true, skipped: true };
  }

  try {
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status === 401) {
      return { success: false, error: 'AUTH_ERROR' };
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        success: false,
        error: data.detail || `HTTP ${response.status}`
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Network error'
    };
  }
}

// ============================================================================
// PROMPT MANAGEMENT
// ============================================================================

/**
 * Get watchlist enrichment prompt content from Supabase (or default)
 * @returns {Promise<string>}
 */
async function getEnrichPromptTemplate() {
  try {
    // Try to get user's custom prompt from Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('prompts')
        .select('content')
        .eq('user_id', user.id)
        .eq('key', SYSTEM_PROMPT_KEYS.WATCHLIST_ENRICH)
        .single();

      if (data?.content) {
        return data.content;
      }
    }
  } catch (_) {
    // Fall through to default
  }

  // Return default prompt
  return DEFAULT_SYSTEM_PROMPTS[SYSTEM_PROMPT_KEYS.WATCHLIST_ENRICH];
}

/**
 * Build reduced input payload for prompt (minimal fields per watchlist item)
 * @param {Array} items - Watchlist items from X-Neews
 * @returns {Array} Reduced items for prompt
 */
function buildReducedPayload(items) {
  return items.map(item => ({
    symbol: item.symbol,
    price: item.price ?? null,
    ediff: item.ediff ?? null,
    investment_thesis: item.investment_thesis || null,
    notes: item.notes || null
  }));
}

/**
 * Render prompt template with data
 * @param {string} template - Prompt template with placeholders
 * @param {Array} batchItems - Watchlist items for this batch
 * @returns {string} Rendered prompt
 */
function renderPrompt(template, batchItems) {
  const reducedItems = buildReducedPayload(batchItems);
  const asOfDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return template
    .replace('{WATCHLIST_ITEMS_JSON}', JSON.stringify(reducedItems, null, 2))
    .replace('{AS_OF_DATE}', asOfDate);
}

// ============================================================================
// CORE ENRICHMENT LOGIC
// ============================================================================

/**
 * Broadcast status update to UI
 * @param {Object} statusData
 */
function broadcastStatus(statusData) {
  chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS,
    correlationId: statusData.runId || generateCorrelationId(),
    timestamp: Date.now(),
    ...statusData
  }).catch(() => {
    // UI not open - expected
  });
}

/**
 * Broadcast completion to UI
 * @param {Object} doneData
 */
function broadcastDone(doneData) {
  chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_DONE,
    correlationId: doneData.runId || generateCorrelationId(),
    timestamp: Date.now(),
    ...doneData
  }).catch(() => {
    // UI not open - expected
  });
}

/**
 * Wait for content script to capture ChatGPT response
 * Listens for CONTENT_RESPONSE_CAPTURED matching the given runId
 *
 * @param {string} runId - Correlation ID of the prompt
 * @param {number} [timeoutMs=120000] - Timeout in ms (default 2 min)
 * @returns {Promise<string|null>} Response text or null on timeout
 */
function waitForResponseCapture(runId, timeoutMs = 120000) {
  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId;

    const handler = (message) => {
      if (resolved) return;

      // Match CONTENT_RESPONSE_CAPTURED with our runId
      if (
        message?.type === MESSAGE_TYPES.CONTENT_RESPONSE_CAPTURED &&
        message?.data?.runId === runId &&
        typeof message?.data?.response === 'string'
      ) {
        resolved = true;
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(handler);
        resolve(message.data.response);
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.runtime.onMessage.removeListener(handler);
        resolve(null);
      }
    }, timeoutMs);
  });
}

/**
 * Run a single batch of enrichment
 * @param {Array} batchItems - Items for this batch
 * @param {string} promptTemplate - Prompt template
 * @param {string} runId - Run identifier
 * @param {number} batchIndex - Batch index (0-based)
 * @returns {Promise<{ successCount: number, failureCount: number, errors: Array }>}
 */
async function runBatch(batchItems, promptTemplate, runId, batchIndex) {
  const batchResult = { successCount: 0, failureCount: 0, errors: [] };
  const symbols = batchItems.map(i => i.symbol);

  // 1. Render prompt for this batch
  const prompt = renderPrompt(promptTemplate, batchItems);
  logger.info('Sending enrichment prompt', {
    runId,
    batchIndex,
    symbolCount: symbols.length,
    promptLength: prompt.length
  });

  // 2. Generate a unique sub-runId for this batch (for chat_history correlation)
  const batchRunId = `${runId}-batch${batchIndex}`;

  // 3. Set up response listener BEFORE sending prompt
  const responsePromise = waitForResponseCapture(batchRunId);

  // 4. Send prompt to ChatGPT via SEND_PROMPT handler (direct call)
  // NOTE: chrome.runtime.sendMessage() does NOT deliver to the sender's own
  // onMessage listener in MV3 Service Workers, so we call route() directly.
  const sendResponse = await route({
    v: 1,
    type: MESSAGE_TYPES.SEND_PROMPT,
    correlationId: batchRunId,
    timestamp: Date.now(),
    data: {
      prompt,
      options: {
        createNewChat: true,
        focusTab: false,
        saveToHistory: true,
        metadata: {
          feature: 'watchlist_ai_enrich',
          asOf: new Date().toISOString().split('T')[0],
          symbols,
          batchIndex,
          batchSize: WATCHLIST_AI_ENRICH_BATCH_SIZE
        }
      }
    }
  }, { id: chrome.runtime.id });

  // Check if prompt was sent successfully
  if (!sendResponse?.success) {
    logger.error('Failed to send enrichment prompt', {
      runId,
      batchIndex,
      error: sendResponse?.error?.message || 'Unknown error'
    });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: ERROR_MESSAGES.PROMPT_SEND_FAILED
    });
    return batchResult;
  }

  // 5. Wait for response capture from content script
  broadcastStatus({
    runId,
    stage: 'waiting_response',
    batchIndex,
    batchTotal: null, // Filled by caller
    symbolCount: symbols.length
  });

  const responseText = await responsePromise;

  if (!responseText) {
    logger.warn('Response capture timed out', { runId, batchIndex });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: 'ChatGPT response timeout. Vui lòng thử lại.'
    });
    return batchResult;
  }

  logger.info('Response captured', {
    runId,
    batchIndex,
    responseLength: responseText.length
  });

  // 6. Parse JSON response
  const parseResult = parseJsonOnlyResponse(responseText);
  if (!parseResult.success) {
    logger.warn('Invalid JSON response', { runId, batchIndex, error: parseResult.error });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: ERROR_MESSAGES.INVALID_JSON_OUTPUT
    });
    return batchResult;
  }

  // 7. Validate items
  const validationResult = validateEnrichItems(parseResult.data, symbols);

  if (validationResult.valid.length === 0) {
    logger.warn('No valid items in response', { runId, batchIndex });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: ERROR_MESSAGES.NO_ITEMS_TO_UPDATE
    });
    return batchResult;
  }

  // 8. Update each valid item sequentially (avoid rate-limit)
  broadcastStatus({
    runId,
    stage: 'updating_watchlist',
    batchIndex
  });

  for (const item of validationResult.valid) {
    const updateResult = await updateWatchlistItem(item.symbol, {
      entry: item.entry,
      target: item.target,
      stoploss: item.stoploss,
      investment_thesis: item.investment_thesis
    });

    if (updateResult.success) {
      batchResult.successCount++;
    } else {
      batchResult.failureCount++;
      batchResult.errors.push({
        symbol: item.symbol,
        error: updateResult.error
      });

      // Stop on auth error
      if (updateResult.error === 'AUTH_ERROR') {
        logger.error('Auth error during update, stopping batch', { runId, batchIndex });
        // Mark remaining as failed
        batchResult.failureCount += (validationResult.valid.length - batchResult.successCount - batchResult.failureCount);
        break;
      }
    }

    // Small delay between updates (200ms) to avoid rate-limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Count invalid items as failures
  batchResult.failureCount += validationResult.invalid.length;
  for (const inv of validationResult.invalid) {
    batchResult.errors.push({
      symbol: inv.symbol,
      error: inv.reason
    });
  }

  return batchResult;
}

/**
 * Run the full enrichment process
 * Fetches watchlist, splits into batches, processes each batch sequentially
 *
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - If true, skip actual updates
 * @returns {Promise<Object>} Run result
 */
export async function runEnrichment(options = {}) {
  const runId = generateCorrelationId();
  const { dryRun = false } = options;

  logger.info('Starting watchlist AI enrichment', { runId, dryRun });

  // 1. Acquire lock
  const lockAcquired = await acquireLock(runId);
  if (!lockAcquired) {
    logger.warn('Enrichment lock active, skipping run', { runId });
    return {
      success: false,
      runId,
      error: ERROR_MESSAGES.LOCK_ACTIVE
    };
  }

  try {
    // 2. Broadcast start
    broadcastStatus({ runId, stage: 'fetching_watchlist' });

    // 3. Fetch all watchlist items
    const allItems = await fetchAllWatchlistItems();
    if (allItems.length === 0) {
      await clearRunState();
      broadcastDone({
        runId,
        success: false,
        error: ERROR_MESSAGES.NO_WATCHLIST,
        successCount: 0,
        failureCount: 0
      });
      return {
        success: false,
        runId,
        error: ERROR_MESSAGES.NO_WATCHLIST
      };
    }

    logger.info('Watchlist fetched', { runId, totalItems: allItems.length });

    // 4. Get prompt template
    const promptTemplate = await getEnrichPromptTemplate();

    // 5. Split into batches of WATCHLIST_AI_ENRICH_BATCH_SIZE
    const batches = [];
    for (let i = 0; i < allItems.length; i += WATCHLIST_AI_ENRICH_BATCH_SIZE) {
      batches.push(allItems.slice(i, i + WATCHLIST_AI_ENRICH_BATCH_SIZE));
    }

    // Update run state
    await saveRunState({
      runId,
      lockUntil: Date.now() + WATCHLIST_AI_ENRICH_LOCK_EXPIRY_MS,
      startedAt: Date.now(),
      cursor: 0,
      totalSymbols: allItems.length,
      totalBatches: batches.length,
      successCount: 0,
      failureCount: 0,
      stage: 'running'
    });

    broadcastStatus({
      runId,
      stage: 'running',
      totalSymbols: allItems.length,
      totalBatches: batches.length
    });

    // 6. Process each batch sequentially
    let totalSuccess = 0;
    let totalFailure = 0;
    const allErrors = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      broadcastStatus({
        runId,
        stage: 'sending_prompt',
        batchIndex: i,
        batchTotal: batches.length,
        symbolCount: batch.length,
        progress: `${i + 1}/${batches.length}`
      });

      if (dryRun) {
        logger.info('Dry run - skipping batch', { runId, batchIndex: i });
        totalSuccess += batch.length;
        continue;
      }

      const batchResult = await runBatch(batch, promptTemplate, runId, i);
      totalSuccess += batchResult.successCount;
      totalFailure += batchResult.failureCount;
      allErrors.push(...batchResult.errors);

      // Update run state after each batch (MV3 crash recovery)
      await saveRunState({
        runId,
        lockUntil: Date.now() + WATCHLIST_AI_ENRICH_LOCK_EXPIRY_MS,
        startedAt: Date.now(),
        cursor: i + 1,
        totalSymbols: allItems.length,
        totalBatches: batches.length,
        successCount: totalSuccess,
        failureCount: totalFailure,
        stage: i + 1 >= batches.length ? 'done' : 'running'
      });

      // Check for fatal auth error
      const hasAuthError = batchResult.errors.some(e => e.error === 'AUTH_ERROR');
      if (hasAuthError) {
        logger.error('Auth error detected, stopping enrichment', { runId });
        totalFailure += allItems.length - (totalSuccess + totalFailure);
        break;
      }

      // Delay between batches (3s) to let ChatGPT settle
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // 7. Done - cleanup
    await clearRunState();

    const result = {
      success: true,
      runId,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalSymbols: allItems.length,
      totalBatches: batches.length,
      errors: allErrors.length > 0 ? allErrors.slice(0, 20) : [] // Cap errors
    };

    broadcastDone({
      runId,
      ...result
    });

    logger.info('Watchlist AI enrichment completed', {
      runId,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalSymbols: allItems.length
    });

    return result;

  } catch (error) {
    // Cleanup lock on unexpected error
    await clearRunState();

    logger.error('Watchlist AI enrichment failed', {
      runId,
      error: error.message
    });

    const errorMsg = error.message?.includes('Failed to fetch')
      ? ERROR_MESSAGES.NETWORK_ERROR
      : error.message || ERROR_MESSAGES.API_ERROR;

    broadcastDone({
      runId,
      success: false,
      error: errorMsg,
      successCount: 0,
      failureCount: 0
    });

    return {
      success: false,
      runId,
      error: errorMsg
    };
  }
}

/**
 * Check if a run is currently in progress
 * @returns {Promise<boolean>}
 */
export async function isEnrichmentRunning() {
  return isLockActive();
}

/**
 * Get current run status (for UI polling)
 * @returns {Promise<Object|null>}
 */
export async function getEnrichmentStatus() {
  return loadRunState();
}
