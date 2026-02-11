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

// Vietnamese error messages
const ERROR_MESSAGES = {
  AUTH_ERROR: 'Lỗi xác thực. Vui lòng đăng nhập.',
  API_ERROR: 'Lỗi kết nối dữ liệu. Vui lòng thử lại.',
  NETWORK_ERROR: 'Không thể kết nối. Vui lòng kiểm tra mạng.',
  NO_WATCHLIST: 'Watchlist của bạn trống. Hãy thêm mục trước khi sử dụng tính năng này.',
  LOCK_ACTIVE: 'Enrichment đang chạy. Vui lòng đợi hoàn thành trước khi chạy lại.'
};

// ============================================================================
// RUNTIME STATE (IN-MEMORY)
// ============================================================================

// Track if cancellation is requested for current run
let _currentRunId = null;
let _shouldCancel = false;
let _currentRunState = null;

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
// SUPABASE HELPERS (migrated from x51.vn)
// ============================================================================

/**
 * Fetch ALL watchlist items from Supabase (paginated)
 * @returns {Promise<Array>} Full list of watchlist items
 */
async function fetchAllWatchlistItems() {
  const allItems = [];
  const pageSize = 100; // Batch fetch size
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const result = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (response.error) throw response.error;
        return response;
      },
      {
        operationName: 'watchlist.fetch-all-for-enrichment',
        maxRetries: 2
      }
    );

    allItems.push(...(result.data || []));
    hasMore = (result.data?.length || 0) === pageSize;
    offset += pageSize;
  }

  return allItems;
}

/**
 * Update a single watchlist item via Supabase
 * @param {string} symbol
 * @param {Object} updates - { entry, target, stoploss, investment_thesis }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function updateWatchlistItem(symbol, updates) {
  // Build update data - only non-null fields
  const updateData = {};
  if (updates.entry !== null && updates.entry !== undefined) {
    updateData.entry = Number(updates.entry);
  }
  if (updates.target !== null && updates.target !== undefined) {
    updateData.target = Number(updates.target);
  }
  if (updates.stoploss !== null && updates.stoploss !== undefined) {
    updateData.stoploss = Number(updates.stoploss);
  }
  if (updates.investment_thesis !== null && updates.investment_thesis !== undefined) {
    updateData.investment_thesis = updates.investment_thesis;
  }

  // Skip if nothing to update
  if (Object.keys(updateData).length === 0) {
    logger.debug('No fields to update - skipping', { symbol });
    return { success: true, skipped: true };
  }

  const startTime = Date.now();
  const sanitizedSymbol = symbol.trim().toUpperCase();

  logger.debug('Preparing Supabase update request', {
    symbol: sanitizedSymbol,
    updateFields: Object.keys(updateData),
    updateData: {
      entry: updateData.entry || null,
      target: updateData.target || null,
      stoploss: updateData.stoploss || null,
      investment_thesis: updateData.investment_thesis
        ? `${updateData.investment_thesis.substring(0, 50)}...`
        : null
    }
  });

  try {
    const result = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .update(updateData)
          .eq('symbol', sanitizedSymbol)
          .select();

        if (response.error) throw response.error;
        return response;
      },
      {
        operationName: 'watchlist.update-for-enrichment',
        maxRetries: 2
      }
    );

    const elapsed = Date.now() - startTime;

    logger.debug('Database update completed', {
      symbol: sanitizedSymbol,
      updated: result.data?.length > 0,
      elapsed: `${elapsed}ms`
    });

    if (!result.data || result.data.length === 0) {
      logger.warn('❌ Update failed - symbol not found', {
        symbol: sanitizedSymbol
      });
      return {
        success: false,
        error: 'SYMBOL_NOT_FOUND'
      };
    }

    logger.info('✅ Update successful', {
      symbol: sanitizedSymbol,
      updatedFields: Object.keys(updateData),
      elapsed: `${elapsed}ms`
    });

    return { success: true };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.error('❌ Update exception', {
      symbol: sanitizedSymbol,
      error: error.message,
      errorName: error.name,
      elapsed: `${elapsed}ms`,
      stack: error.stack?.split('\n')[0]
    });
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
 * @param {number} [timeoutMs=900000] - Timeout in ms (default 15 min, matches content script)
 * @returns {Promise<string|null>} Response text or null on timeout
 */
function waitForResponseCapture(runId, timeoutMs = 900000) {
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
        logger.info('Response captured from content script', {
          runId,
          responseLength: message.data.response.length,
          waitedMs: message.data.waitedMs
        });
        resolve(message.data.response);
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.runtime.onMessage.removeListener(handler);
        logger.error('Response capture timeout - ChatGPT may still be processing', {
          runId,
          timeoutMs
        });
        resolve(null);
      }
    }, timeoutMs);

    logger.debug('Waiting for response capture', { runId, timeoutMs });
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
  const batchStartTime = Date.now();
  const batchResult = { successCount: 0, failureCount: 0, errors: [] };
  const symbols = batchItems.map(i => i.symbol);

  logger.info('📦 BATCH START', {
    runId,
    batchIndex,
    symbols,
    itemCount: batchItems.length,
    timestamp: new Date().toLocaleString()
  });

  // 1. Render prompt for this batch
  const prompt = renderPrompt(promptTemplate, batchItems);
  logger.info('Rendering prompt', {
    runId,
    batchIndex,
    symbolCount: symbols.length,
    promptLength: prompt.length,
    templateLength: promptTemplate.length
  });

  // 2. Generate a unique sub-runId for this batch (for chat_history correlation)
  const batchRunId = `${runId}-batch${batchIndex}`;

  // 3. Set up response listener BEFORE sending prompt
  logger.debug('Setting up response listener', { runId, batchRunId, timeoutMs: 900000 });
  const responsePromise = waitForResponseCapture(batchRunId);

  // 4. Send prompt to ChatGPT via SEND_PROMPT handler (direct call)
  // NOTE: chrome.runtime.sendMessage() does NOT deliver to the sender's own
  // onMessage listener in MV3 Service Workers, so we call route() directly.
  const promptStartTime = Date.now();
  logger.info('🚀 Sending prompt to ChatGPT', {
    runId,
    batchIndex,
    batchRunId,
    symbols,
    promptLength: prompt.length
  });

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

  const sendElapsed = Date.now() - promptStartTime;

  // Check if prompt was sent successfully
  if (!sendResponse?.success) {
    logger.error('❌ Failed to send enrichment prompt', {
      runId,
      batchIndex,
      symbols,
      error: sendResponse?.error?.message || 'Unknown error',
      elapsed: `${sendElapsed}ms`
    });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: ERROR_MESSAGES.PROMPT_SEND_FAILED
    });
    return batchResult;
  }

  logger.info('✅ Prompt sent successfully', {
    runId,
    batchIndex,
    symbols,
    elapsed: `${sendElapsed}ms`
  });

  // 5. Wait for response capture from content script
  broadcastStatus({
    runId,
    stage: 'waiting_response',
    batchIndex,
    batchTotal: null, // Filled by caller
    symbolCount: symbols.length
  });

  logger.info('⏳ Waiting for ChatGPT response...', {
    runId,
    batchIndex,
    batchRunId,
    symbols
  });

  const responseStartTime = Date.now();
  const responseText = await responsePromise;
  const responseElapsed = Date.now() - responseStartTime;

  logger.info('✅ Response await completed', {
    runId,
    batchIndex,
    hasResponse: !!responseText,
    responseLength: responseText?.length || 0,
    waitTotalTime: `${responseElapsed}ms`
  });

  if (!responseText) {
    logger.warn('❌ Response capture timed out', {
      runId,
      batchIndex,
      symbols,
      timeoutMs: 900000,
      elapsed: `${responseElapsed}ms`
    });
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
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 100).replace(/\n/g, ' ') + '...'
  });

  // 6. Parse JSON response
  logger.info('📝 Parsing JSON response...', { runId, batchIndex });
  const parseStartTime = Date.now();
  const parseResult = parseJsonOnlyResponse(responseText);
  const parseElapsed = Date.now() - parseStartTime;

  if (!parseResult.success) {
    logger.warn('❌ Invalid JSON response', {
      runId,
      batchIndex,
      symbols,
      error: parseResult.error,
      elapsed: `${parseElapsed}ms`
    });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: ERROR_MESSAGES.INVALID_JSON_OUTPUT
    });
    return batchResult;
  }

  logger.info('✅ JSON parsed successfully', {
    runId,
    batchIndex,
    itemsInResponse: parseResult.data?.items?.length || 0,
    elapsed: `${parseElapsed}ms`
  });

  // 7. Validate items
  logger.info('✓ JSON parsed, validating items...', { runId, batchIndex });
  const validateStartTime = Date.now();
  const validationResult = validateEnrichItems(parseResult.data, symbols);
  const validateElapsed = Date.now() - validateStartTime;

  logger.info('Validation completed', {
    runId,
    batchIndex,
    validCount: validationResult.valid.length,
    invalidCount: validationResult.invalid.length,
    elapsed: `${validateElapsed}ms`
  });

  if (validationResult.invalid.length > 0) {
    logger.warn('⚠️ Invalid items detected', {
      runId,
      batchIndex,
      invalidItems: validationResult.invalid.map(i => ({
        symbol: i.symbol,
        reason: i.reason
      }))
    });
  }

  if (validationResult.valid.length === 0) {
    logger.warn('❌ No valid items in response', { runId, batchIndex });
    batchResult.failureCount = symbols.length;
    batchResult.errors.push({
      batch: batchIndex,
      error: ERROR_MESSAGES.NO_ITEMS_TO_UPDATE
    });
    return batchResult;
  }

  // 8. Update each valid item sequentially (avoid rate-limit)
  logger.info('💾 Starting watchlist updates...', {
    runId,
    batchIndex,
    itemCount: validationResult.valid.length
  });

  const updateStartTime = Date.now();
  broadcastStatus({
    runId,
    stage: 'updating_watchlist',
    batchIndex
  });

  for (const item of validationResult.valid) {
    const itemStartTime = Date.now();
    logger.debug('📍 Updating item', {
      runId,
      batchIndex,
      symbol: item.symbol,
      data: {
        entry: item.entry,
        target: item.target,
        stoploss: item.stoploss,
        thesisLength: item.investment_thesis?.length || 0
      }
    });

    const updateResult = await updateWatchlistItem(item.symbol, {
      entry: item.entry,
      target: item.target,
      stoploss: item.stoploss,
      investment_thesis: item.investment_thesis
    });

    const itemElapsed = Date.now() - itemStartTime;

    if (updateResult.success) {
      batchResult.successCount++;
      logger.debug('✓ Updated successfully', {
        runId,
        batchIndex,
        symbol: item.symbol,
        elapsed: `${itemElapsed}ms`
      });
    } else {
      batchResult.failureCount++;
      batchResult.errors.push({
        symbol: item.symbol,
        error: updateResult.error
      });
      logger.warn('✗ Update failed', {
        runId,
        batchIndex,
        symbol: item.symbol,
        error: updateResult.error,
        elapsed: `${itemElapsed}ms`
      });

      // Stop on auth error
      if (updateResult.error === 'AUTH_ERROR') {
        logger.error('🔐 Auth error during update, stopping batch', { runId, batchIndex });
        // Mark remaining as failed
        batchResult.failureCount += (validationResult.valid.length - batchResult.successCount - batchResult.failureCount);
        break;
      }
    }

    // Small delay between updates (200ms) to avoid rate-limiting
    await new Promise(r => setTimeout(r, 200));
  }

  const updateElapsed = Date.now() - updateStartTime;

  logger.info('✅ Batch completed', {
    runId,
    batchIndex,
    symbols,
    results: {
      successCount: batchResult.successCount,
      failureCount: batchResult.failureCount,
      totalProcessed: batchResult.successCount + batchResult.failureCount
    },
    timing: {
      prompt: `${sendElapsed}ms`,
      response: `${responseElapsed}ms`,
      parse: `${parseElapsed}ms`,
      validate: `${validateElapsed}ms`,
      update: `${updateElapsed}ms`,
      total: `${Date.now() - batchStartTime}ms`
    }
  });

  // Count invalid items as failures
  batchResult.failureCount += validationResult.invalid.length;
  for (const inv of validationResult.invalid) {
    batchResult.errors.push({
      symbol: inv.symbol,
      error: inv.reason
    });
  }

  logger.info('🏁 Batch processing completed', {
    runId,
    batchIndex,
    successCount: batchResult.successCount,
    failureCount: batchResult.failureCount,
    errorCount: batchResult.errors.length,
    totalBatchTime: `${Date.now() - batchStartTime}ms`
  });

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
export async function cancelEnrichment() {
  logger.warn('⚠️ Cancel request received', {
    currentRunId: _currentRunId,
    isRunning: _currentRunId !== null
  });

  if (!_currentRunId) {
    logger.warn('No enrichment running to cancel');
    return {
      success: false,
      error: 'Không có lần chạy nào'
    };
  }

  // Set flag để batch loop check
  _shouldCancel = true;

  logger.info('🛑 Cancel flag set - enrichment will stop after current batch', {
    runId: _currentRunId
  });

  return {
    success: true,
    message: 'Yêu cầu hủy đã gửi. Enrichment sẽ dừng sau batch hiện tại.',
    successCount: _currentRunState?.successCount || 0,
    failureCount: _currentRunState?.failureCount || 0
  };
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
  const overallStartTime = Date.now();

  // Set runtime state for cancellation
  _currentRunId = runId;
  _shouldCancel = false;
  _currentRunState = {};

  logger.info('═════════════════════════════════════════════════════════════', {
    runId,
    action: 'START ENRICHMENT'
  });
  logger.info('Starting watchlist AI enrichment', {
    runId,
    dryRun,
    timestamp: new Date().toLocaleString()
  });

  // 1. Supabase auth check - ensure user is authenticated before starting
  logger.info('🔐 Checking Supabase authentication before enrichment', { runId });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.error('❌ Not authenticated - cannot proceed with enrichment', { runId });
      return {
        success: false,
        runId,
        error: 'Vui lòng đăng nhập trước khi sử dụng tính năng này.'
      };
    }
    logger.info('✅ Authentication verified', { runId, userId: user.id });
  } catch (error) {
    logger.error('Auth check exception', { runId, error: error.message });
    return {
      success: false,
      runId,
      error: 'Lỗi xác thực. Vui lòng thử lại.'
    };
  }

  // 2. Acquire lock
  logger.info('🔒 Acquiring enrichment lock...', { runId });
  const lockAcquired = await acquireLock(runId);
  if (!lockAcquired) {
    logger.warn('⚠️ Enrichment lock active, skipping run', { runId });
    return {
      success: false,
      runId,
      error: ERROR_MESSAGES.LOCK_ACTIVE
    };
  }
  logger.info('✅ Lock acquired', { runId });

  try {
    // 3. Broadcast start
    broadcastStatus({ runId, stage: 'fetching_watchlist' });

    // 4. Fetch all watchlist items from Supabase
    logger.info('📥 Fetching watchlist from Supabase...', { runId });
    const fetchStartTime = Date.now();
    const allItems = await fetchAllWatchlistItems();
    const fetchElapsed = Date.now() - fetchStartTime;

    if (allItems.length === 0) {
      logger.warn('❌ Watchlist is empty', { runId });
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

    logger.info('✅ Watchlist fetched', {
      runId,
      totalItems: allItems.length,
      elapsed: `${fetchElapsed}ms`,
      symbols: allItems.map(i => i.symbol)
    });

    // 5. Get prompt template
    logger.info('📋 Loading enrichment prompt template...', { runId });
    const promptTemplate = await getEnrichPromptTemplate();
    logger.debug('Prompt template loaded', {
      runId,
      templateLength: promptTemplate.length
    });

    // 6. Split into batches of WATCHLIST_AI_ENRICH_BATCH_SIZE
    const batches = [];
    for (let i = 0; i < allItems.length; i += WATCHLIST_AI_ENRICH_BATCH_SIZE) {
      batches.push(allItems.slice(i, i + WATCHLIST_AI_ENRICH_BATCH_SIZE));
    }

    logger.info('📊 Split into batches', {
      runId,
      batchSize: WATCHLIST_AI_ENRICH_BATCH_SIZE,
      totalBatches: batches.length,
      batchBreakdown: batches.map((b, i) => ({
        batchIndex: i,
        itemCount: b.length,
        symbols: b.map(x => x.symbol)
      }))
    });

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

    // 7. Process each batch sequentially
    let totalSuccess = 0;
    let totalFailure = 0;
    const allErrors = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      logger.info('═══════════════════════════════════════════════════', {
        runId,
        batchIndex: i,
        totalBatches: batches.length,
        progress: `${i + 1}/${batches.length}`
      });
      logger.info('🚀 Starting batch processing', {
        runId,
        batchIndex: i,
        symbols: batch.map(b => b.symbol)
      });

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

      logger.info('🏁 Batch processing completed', {
        runId,
        batchIndex: i,
        successCount: batchResult.successCount,
        failureCount: batchResult.failureCount,
        errorCount: batchResult.errors.length
      });

      totalSuccess += batchResult.successCount;
      totalFailure += batchResult.failureCount;
      allErrors.push(...batchResult.errors);

      // Update runtime state
      _currentRunState = {
        successCount: totalSuccess,
        failureCount: totalFailure,
        batchIndex: i,
        totalBatches: batches.length
      };

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

      // Check for cancel request
      if (_shouldCancel) {
        logger.warn('⚠️ Cancel requested - stopping enrichment after current batch', {
          runId,
          batchIndex: i,
          successCount: totalSuccess,
          failureCount: totalFailure,
          remainingBatches: batches.length - i - 1
        });
        break;
      }

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

    // 8. Done - cleanup
    await clearRunState();

    const overallElapsed = Date.now() - overallStartTime;
    const cancelled = _shouldCancel;

    // Reset runtime state
    _currentRunId = null;
    _shouldCancel = false;
    _currentRunState = null;
    const result = {
      success: true,
      runId,
      successCount: totalSuccess,
      failureCount: totalFailure,
      totalSymbols: allItems.length,
      totalBatches: batches.length,
      cancelled: cancelled,
      errors: allErrors.length > 0 ? allErrors.slice(0, 20) : [] // Cap errors
    };

    if (cancelled) {
      logger.info('═════════════════════════════════════════════════════════════', {
        runId,
        action: 'ENRICHMENT CANCELLED'
      });
      logger.info('⚠️ Watchlist AI enrichment cancelled by user', {
        runId,
        results: {
          successCount: totalSuccess,
          failureCount: totalFailure,
          totalSymbols: allItems.length,
          totalBatches: batches.length
        },
        timing: {
          overallTime: `${overallElapsed}ms`,
          averagePerBatch: `${Math.round(overallElapsed / (batches.length))}ms`
        },
        timestamp: new Date().toLocaleString()
      });
    } else {
      logger.info('═════════════════════════════════════════════════════════════', {
        runId,
        action: 'ENRICHMENT COMPLETED'
      });
      logger.info('✅ Watchlist AI enrichment completed successfully', {
        runId,
        results: {
          successCount: totalSuccess,
          failureCount: totalFailure,
          totalSymbols: allItems.length,
          totalBatches: batches.length,
          successRate: totalSuccess > 0 ? `${Math.round((totalSuccess / (totalSuccess + totalFailure)) * 100)}%` : '0%'
        },
        timing: {
          overallTime: `${overallElapsed}ms`,
          averagePerBatch: `${Math.round(overallElapsed / batches.length)}ms`,
          averagePerItem: `${Math.round(overallElapsed / allItems.length)}ms`
        },
        errorSummary: {
          totalErrors: allErrors.length,
          errorTypes: allErrors.slice(0, 10).map(e => ({
            symbol: e.symbol || e.batch,
            error: e.error
          }))
        },
        timestamp: new Date().toLocaleString()
      });
    }

    return result;

  } catch (error) {
    // Cleanup lock on unexpected error
    const overallElapsed = Date.now() - overallStartTime;

    // Reset runtime state
    _currentRunId = null;
    _shouldCancel = false;
    _currentRunState = null;

    await clearRunState();

    logger.error('═════════════════════════════════════════════════════════════', {
      runId,
      action: 'ENRICHMENT FAILED'
    });
    logger.error('❌ Watchlist AI enrichment failed with exception', {
      runId,
      error: error.message,
      errorName: error.name,
      stack: error.stack?.split('\n')[0],
      elapsed: `${overallElapsed}ms`,
      timestamp: new Date().toLocaleString()
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

/**
 * Force reset enrichment state (clear stuck lock)
 * Use when enrichment is stuck and won't start
 * @returns {Promise<void>}
 */
export async function resetEnrichmentState() {
  logger.warn('🔄 Force reset enrichment state requested');

  // Clear runtime state
  _currentRunId = null;
  _shouldCancel = false;
  _currentRunState = null;

  // Clear persisted state
  await clearRunState();

  logger.info('✅ Enrichment state reset completed');
}
