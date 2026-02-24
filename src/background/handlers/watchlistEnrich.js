/**
 * @fileoverview Watchlist Enrichment Handler (Unified Queue)
 *
 * Architecture:
 * 1. UI sends WATCHLIST_AI_ENRICH_RUN → handler enqueues background job
 * 2. Unified PromptQueue (p-queue, concurrency=1) processes jobs sequentially
 * 3. For each job: prepare prompt → ChatGPT → parse → persist Supabase
 * 4. Background broadcasts status/done/error — UI observes via listener
 * 5. Job state persisted in chrome.storage.local (survives SW restart)
 *
 * All ChatGPT operations go through the unified prompt queue to prevent
 * concurrent ChatGPT interactions.
 *
 * Ticket: XST-742, XST-803
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { generateCorrelationId } from '../../logger.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { SYSTEM_PROMPT_KEYS } from '../../shared/systemPrompts.js';
import { DEFAULT_SYSTEM_PROMPTS } from '../../shared/systemPrompts.js';
import * as ChatGPTSession from '../../chatgptSession.js';
import { persistPromptSafe } from './_persistPromptHelper.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { calcEdiff, calcPprofit, round4 } from '../../shared/watchlistCalc.js';

/** Rate-limit window: 1 AI analysis per symbol per hour */
const AI_ANALYSIS_COOLDOWN_MS = 60 * 60 * 1000;
import { runStockResearch } from '../services/stock/stockResearchOrchestrator.js';
import { enqueue as promptQueueEnqueue } from '../services/promptQueue.js';
import {
  enqueueBackgroundJob,
  cancelJob,
  getQueueInfo,
  resetQueue,
  resumeOnStartup,
  isJobCancelled,
  setActiveSessionChatId
} from '../services/promptQueue.js';

const logger = createLogger('Handlers/WatchlistEnrich');

/**
 * Sanitize JSON string from ChatGPT response
 * ChatGPT responses captured from DOM often contain literal control characters
 * (newlines, tabs) inside JSON string values, which is invalid JSON.
 *
 * Strategy: Replace control characters inside JSON string literals with spaces,
 * while preserving structural newlines between JSON tokens.
 */
function sanitizeJsonString(raw) {
  // Replace control characters (0x00-0x1F) inside JSON string values
  // Walk through the string tracking whether we're inside a quoted string
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    // If inside a string value, replace control chars with space
    if (inString && code < 0x20) {
      result += ' ';
      continue;
    }

    result += ch;
  }

  return result;
}

/**
 * Parse JSON from ChatGPT response
 * Handles: markdown code blocks, control characters, nested items array
 */
function parseJsonFromResponse(responseText) {
  // Extract JSON candidate text
  let jsonText = responseText;

  // Try extracting from markdown code block first
  const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  } else {
    // Try extracting JSON object from surrounding text.
    // Use a greedy match from the FIRST '{' to the LAST '}' — this skips
    // leading noise like ChatGPT web-search source cards (site names, "+N" badges)
    // that can prepend the actual JSON content.
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    } else {
      // Try JSON array format [{ ... }]
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonText = arrayMatch[0];
      }
    }
  }

  // Sanitize control characters inside JSON string values
  const sanitized = sanitizeJsonString(jsonText);

  const parsed = JSON.parse(sanitized);
  return parsed;
}

/**
 * Extract enrichment item from parsed response
 * Handles both flat format and nested { items: [...] } format
 */
function extractEnrichmentItem(parsed, symbol) {
  // Format 1: Flat object with entry/target/stoploss directly
  if ('entry' in parsed || 'target' in parsed || 'stoploss' in parsed || 'investment_thesis' in parsed) {
    return parsed;
  }

  // Format 2: { items: [{ symbol, entry, target, ... }] }
  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    // Find matching symbol or take first item
    const match = parsed.items.find(
      item => item.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    return match || parsed.items[0];
  }

  return null;
}

/**
 * Validate enrichment data has at least one field to update
 */
function validateEnrichmentData(data) {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('entry' in data || 'target' in data || 'stoploss' in data || 'investment_thesis' in data)
  );
}

/**
 * Handle WATCHLIST_ENRICH_SYMBOL (legacy) and WATCHLIST_AI_ENRICH_RUN (new queue-based)
 *
 * Legacy: direct call, blocks until complete (backward compat)
 * New: enqueues job, returns immediately, background processes async
 */

// ===== Core Processor Function (used by queue worker) =====

/**
 * Process a single enrichment job
 * This runs in background context — UI-independent
 *
 * @param {Object} job - { correlationId, payload: { symbol }, attempt }
 * @returns {Promise<{success: boolean, item?: Object, error?: string}>}
 */
export async function processEnrichmentJob(job) {
  const { correlationId, payload } = job;
  const symbol = payload?.symbol;

  logger.info('Processing enrichment job', { symbol, correlationId, attempt: job.attempt });

  try {
    const sanitizedSymbol = symbol?.trim().toUpperCase();
    if (!sanitizedSymbol) {
      return { success: false, error: 'Mã cổ phiếu là bắt buộc' };
    }

    // 1. Fetch watchlist item from Supabase
    const { data: watchlistItem, error: fetchError } = await supabase
      .from('watchlist')
      .select('*')
      .eq('symbol', sanitizedSymbol)
      .single();

    if (fetchError || !watchlistItem) {
      return { success: false, error: `Mã ${sanitizedSymbol} không tồn tại trong watchlist` };
    }

    // ── Rate limit: max 1 AI analysis per symbol per hour ────────────
    if (watchlistItem.last_ai_analysis_at) {
      const elapsed = Date.now() - new Date(watchlistItem.last_ai_analysis_at).getTime();
      if (elapsed < AI_ANALYSIS_COOLDOWN_MS) {
        const minutesLeft = Math.ceil((AI_ANALYSIS_COOLDOWN_MS - elapsed) / 60000);
        logger.info('AI analysis rate limited', { symbol: sanitizedSymbol, minutesLeft, correlationId });
        return {
          success: false,
          error: `${sanitizedSymbol} đã được phân tích gần đây. Vui lòng đợi ${minutesLeft} phút nữa.`,
        };
      }
    }

    // XST-803: Check feature flag — route to orchestrator if enabled
    const userId = await getUserIdSafe();
    const settingsConfig = userId ? await getUserSettingsConfigForEnrich(userId) : {};
    const useOrchestrator = getFeatureFlag('stock_research_v2', settingsConfig);

    if (useOrchestrator && userId) {
      return await processEnrichmentViaOrchestrator(
        sanitizedSymbol, watchlistItem, userId, settingsConfig, correlationId
      );
    }

    // Legacy path: ChatGPTSession (flag off or no userId)

    // 2. Get enrichment prompt template
    let promptTemplate = DEFAULT_SYSTEM_PROMPTS[SYSTEM_PROMPT_KEYS.WATCHLIST_ENRICH];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: customPrompt } = await supabase
          .from('prompts')
          .select('content')
          .eq('user_id', user.id)
          .eq('key', SYSTEM_PROMPT_KEYS.WATCHLIST_ENRICH)
          .single();

        if (customPrompt?.content) {
          promptTemplate = customPrompt.content;
        }
      }
    } catch (e) {
      logger.debug('Using default enrichment prompt', { correlationId });
    }

    // 3. Prepare enrichment data
    const enrichmentData = [
      {
        symbol: watchlistItem.symbol,
        price: watchlistItem.price ?? null,
        ediff: watchlistItem.ediff ?? null,
        investment_thesis: watchlistItem.investment_thesis || null,
        notes: watchlistItem.notes || null
      }
    ];

    const asOfDate = new Date().toISOString().split('T')[0];
    const renderedPrompt = promptTemplate
      .replace('{WATCHLIST_ITEMS_JSON}', JSON.stringify(enrichmentData, null, 2))
      .replace('{AS_OF_DATE}', asOfDate);

    // 4. Check cancellation before ChatGPT call
    if (await isJobCancelled(correlationId)) {
      return { success: false, error: 'Job cancelled by user' };
    }

    // 5. Open ChatGPT tab
    const tabResult = await ChatGPTSession.ensureChatGPTTab({
      createIfNeeded: true,
      focusTab: true
    });

    if (tabResult.error) {
      return { success: false, error: 'Không thể mở ChatGPT. Vui lòng thử lại.' };
    }

    // 6. Send prompt to ChatGPT
    const enrichmentRunId = generateCorrelationId();
    const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, renderedPrompt.trim(), {
      createNewChat: true,
      runId: enrichmentRunId,
    });

    if (!sendResult.success) {
      return { success: false, error: 'Không thể gửi prompt đánh giá lên ChatGPT.' };
    }

    // 7. Persist prompt to chat_history
    const chatId = sendResult.data?.chatId || null;
    const chatUrl = sendResult.data?.chatUrl || null;
    await persistPromptSafe(enrichmentRunId, renderedPrompt, chatId, chatUrl, {
      source: 'WATCHLIST_ENRICH',
      symbol: sanitizedSymbol
    });

    // Update active session with the chatId so the queue monitor and UI know
    // exactly which ChatGPT conversation this job is using.
    if (chatId) {
      await setActiveSessionChatId(correlationId, chatId, chatUrl, tabResult.tabId);
    }

    // 8. Check cancellation before waiting for response
    if (await isJobCancelled(correlationId)) {
      return { success: false, error: 'Job cancelled by user' };
    }

    // 9. Wait for ChatGPT response
    // Pass expectedChatId so getOutput verifies the user hasn't navigated away
    const outputResult = await ChatGPTSession.getOutput(tabResult.tabId, {
      wait: true,
      timeoutMs: 15 * 60 * 1000,
      stableMs: 1500,
      expectedChatId: chatId  // Session guard
    });

    if (!outputResult.success || !outputResult.data?.result) {
      // Specific message for session mismatch (user navigated away)
      if (outputResult.error?.code === 'SESSION_MISMATCH') {
        return { success: false, error: 'Người dùng đã chuyển sang chat khác trong khi đánh giá. Vui lòng thử lại.' };
      }
      return { success: false, error: 'Hết thời gian chờ. ChatGPT chưa trả lời.' };
    }

    const responseText = outputResult.data.result;

    // 10. Parse enrichment response
    let enrichmentResponse;
    try {
      const parsed = parseJsonFromResponse(responseText);
      enrichmentResponse = extractEnrichmentItem(parsed, sanitizedSymbol);
      if (!enrichmentResponse) {
        throw new Error('Could not extract enrichment data from response');
      }
    } catch (parseError) {
      logger.error('Failed to parse enrichment response', {
        error: parseError.message,
        symbol: sanitizedSymbol,
        responsePreview: responseText.substring(0, 200),
        correlationId
      });
      return { success: false, error: 'ChatGPT trả lời không đúng định dạng JSON' };
    }

    if (!validateEnrichmentData(enrichmentResponse)) {
      return { success: false, error: 'Dữ liệu từ ChatGPT không hợp lệ' };
    }

    // 11. Build update data
    const updateData = {};
    const now = new Date().toISOString();
    if (enrichmentResponse.entry !== undefined && enrichmentResponse.entry !== null) {
      updateData.entry = Number(enrichmentResponse.entry);
      updateData.entry_updated_at = now;
    }
    if (enrichmentResponse.target !== undefined && enrichmentResponse.target !== null) {
      updateData.target = Number(enrichmentResponse.target);
      updateData.target_updated_at = now;
    }
    if (enrichmentResponse.stoploss !== undefined && enrichmentResponse.stoploss !== null) {
      updateData.stoploss = Number(enrichmentResponse.stoploss);
      updateData.stoploss_updated_at = now;
    }
    if (enrichmentResponse.investment_thesis !== undefined && enrichmentResponse.investment_thesis !== null) {
      updateData.investment_thesis = enrichmentResponse.investment_thesis;
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: 'ChatGPT không cung cấp thông tin cần cập nhật' };
    }

    // Calculate derived fields
    const effectiveEntry = updateData.entry ?? watchlistItem.entry ?? null;
    const effectiveTarget = updateData.target ?? watchlistItem.target ?? null;
    const effectivePrice = watchlistItem.price ?? null;
    updateData.ediff = round4(calcEdiff(effectivePrice, effectiveEntry));
    updateData.pprofit = round4(calcPprofit(effectiveTarget, effectiveEntry));
    updateData.last_ai_analysis_at = now;

    // 12. Update watchlist item in Supabase (background-only, UI-independent)
    logger.info('Updating watchlist item with enrichment data', {
      symbol: sanitizedSymbol,
      fields: Object.keys(updateData),
      correlationId
    });

    const updateResult = await supabaseWithRetry(
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
        operationName: 'watchlist.enrich-update',
        maxRetries: 2,
        correlationId
      }
    );

    if (!updateResult.data || updateResult.data.length === 0) {
      return { success: false, error: 'Không thể cập nhật watchlist' };
    }

    const updatedItem = updateResult.data[0];

    logger.info('Enrichment completed successfully', {
      symbol: sanitizedSymbol,
      updatedFields: Object.keys(updateData),
      correlationId
    });

    return { success: true, item: updatedItem };

  } catch (error) {
    logger.error('Enrichment processor exception', {
      error: error.message,
      symbol,
      correlationId,
      stack: error.stack
    });

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return { success: false, error: 'Không thể kết nối. Vui lòng kiểm tra mạng.' };
    }

    return { success: false, error: 'Lỗi khi đánh giá. Vui lòng thử lại.' };
  }
}

// ===== XST-803: Orchestrator Path =====

/**
 * Process enrichment via the unified stockResearchOrchestrator.
 * Maps orchestrator output (recommendation, targetPrice, stopLoss, thesis)
 * back to watchlist fields.
 *
 * @param {string} symbol - Uppercase stock symbol
 * @param {Object} watchlistItem - Current watchlist record
 * @param {string} userId - Authenticated user ID
 * @param {Object} settingsConfig - User settings config
 * @param {string} correlationId - Correlation ID for tracing
 * @returns {Promise<{success: boolean, item?: Object, error?: string}>}
 */
async function processEnrichmentViaOrchestrator(symbol, watchlistItem, userId, settingsConfig, correlationId) {
  logger.info('Using orchestrator for enrichment (stock_research_v2=true)', { symbol, correlationId });

  try {
    const result = await runStockResearch(
      symbol,
      { mode: 'watchlist-enrich', correlationId },
      userId,
      {
        settingsConfig,
        enqueue: promptQueueEnqueue,
        onProgress: (status) => {
          // Broadcast enrichment progress to UI
          try {
            chrome.runtime.sendMessage({
              v: 1,
              type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS,
              correlationId,
              timestamp: Date.now(),
              symbol,
              status: status.status,
              step: status.step,
              totalSteps: status.totalSteps,
              message: status.message,
            }).catch(() => {});
          } catch { /* no listeners */ }
        },
      }
    );

    if (!result.success) {
      logger.warn('Orchestrator enrichment failed', {
        symbol, errorCode: result.errorCode, correlationId,
      });
      return { success: false, error: result.errorMessage || 'Phân tích thất bại' };
    }

    // Map orchestrator output → watchlist fields
    const output = result.output || {};
    const updateData = {};
    const now = new Date().toISOString();

    if (output.entryPrice != null) {
      updateData.entry = Number(output.entryPrice);
      updateData.entry_updated_at = now;
    }
    if (output.targetPrice != null) {
      updateData.target = Number(output.targetPrice);
      updateData.target_updated_at = now;
    }
    if (output.stopLoss != null) {
      updateData.stoploss = Number(output.stopLoss);
      updateData.stoploss_updated_at = now;
    }
    // Map thesis array to investment_thesis string
    if (output.thesis?.length > 0) {
      updateData.investment_thesis = output.thesis.join('\n');
    }
    // Map recommendation to notes if useful
    if (output.recommendation) {
      const existing = watchlistItem.notes || '';
      const recNote = `[AI ${new Date().toLocaleDateString('vi-VN')}] ${output.recommendation}` +
        (output.confidence ? ` (${output.confidence}%)` : '');
      updateData.notes = existing ? `${recNote}\n${existing}` : recNote;
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: 'AI không cung cấp thông tin cần cập nhật' };
    }

    // Calculate derived fields
    const effectiveEntry = updateData.entry ?? watchlistItem.entry ?? null;
    const effectiveTarget = updateData.target ?? watchlistItem.target ?? null;
    const effectivePrice = watchlistItem.price ?? null;
    updateData.ediff = round4(calcEdiff(effectivePrice, effectiveEntry));
    updateData.pprofit = round4(calcPprofit(effectiveTarget, effectiveEntry));
    updateData.last_ai_analysis_at = now;

    // Update watchlist item in Supabase
    const updateResult = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .update(updateData)
          .eq('symbol', symbol)
          .select();
        if (response.error) throw response.error;
        return response;
      },
      { operationName: 'watchlist.orchestrator-enrich-update', maxRetries: 2, correlationId }
    );

    if (!updateResult.data || updateResult.data.length === 0) {
      return { success: false, error: 'Không thể cập nhật watchlist' };
    }

    logger.info('Orchestrator enrichment completed', {
      symbol,
      updatedFields: Object.keys(updateData),
      recommendation: output.recommendation,
      correlationId,
    });

    return { success: true, item: updateResult.data[0] };

  } catch (error) {
    logger.error('Orchestrator enrichment exception', {
      error: error.message,
      symbol,
      correlationId,
    });
    return { success: false, error: error.message || 'Lỗi phân tích qua orchestrator' };
  }
}

/**
 * Get userId safely from Supabase auth (no throw).
 * @returns {Promise<string|null>}
 */
async function getUserIdSafe() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Get user settings config for enrichment flag check.
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getUserSettingsConfigForEnrich(userId) {
  try {
    const { data } = await supabase
      .from('settings')
      .select('config')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.config || {};
  } catch {
    return {};
  }
}

// ===== Message Handlers =====

/**
 * WATCHLIST_AI_ENRICH_RUN — Unified queue-based handler
 * UI → Background: enqueue enrichment as background job, return immediately
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RUN, async (message) => {
  const { correlationId } = message;
  const { symbol } = message.data || {};

  logger.info('Enqueue enrichment request', { symbol, correlationId });

  try {
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return createErrorResponse(message, 'INVALID_INPUT', 'Mã cổ phiếu là bắt buộc');
    }

    const result = await enqueueBackgroundJob({
      type: 'WATCHLIST_ENRICH',
      payload: { symbol: symbol.trim().toUpperCase() },
      processor: processEnrichmentJob
    });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      correlationId: result.jobId,
      position: result.position,
      duplicate: result.duplicate || false,
      message: result.duplicate
        ? `${symbol.toUpperCase()} đã có trong hàng đợi`
        : `Đã thêm ${symbol.toUpperCase()} vào hàng đợi (vị trí ${result.position})`
    });
  } catch (error) {
    logger.error('Enqueue failed', { error: error.message, correlationId });
    return createErrorResponse(message, 'QUEUE_ERROR', error.message);
  }
});

/**
 * WATCHLIST_AI_ENRICH_CANCEL — Cancel a pending/running job
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCEL, async (message) => {
  const { correlationId: jobId } = message.data || {};
  const { correlationId } = message;

  const targetId = jobId || correlationId;
  const cancelled = await cancelJob(targetId);

  if (cancelled) {
    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCELLED, {
      success: true,
      correlationId: targetId,
      message: 'Đã hủy tác vụ đánh giá'
    });
  }

  return createErrorResponse(message, 'NOT_FOUND', 'Không tìm thấy tác vụ để hủy');
});

/**
 * WATCHLIST_AI_ENRICH_RESET — Force reset stuck queue
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RESET, async (message) => {
  await resetQueue();
  return createResponse(message, 'WATCHLIST_AI_ENRICH_RESET_DONE', {
    success: true,
    message: 'Đã reset hàng đợi'
  });
});

/**
 * WATCHLIST_ENRICH_SYMBOL — Legacy handler (backward compat)
 * Enqueues the job via unified queue and returns immediately with queue info
 */
registerHandler('WATCHLIST_ENRICH_SYMBOL', async (message) => {
  const { correlationId } = message;
  const { symbol } = message.data || {};

  logger.info('Legacy WATCHLIST_ENRICH_SYMBOL → delegating to unified queue', { symbol, correlationId });

  try {
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return createErrorResponse(message, 'INVALID_INPUT', 'Mã cổ phiếu là bắt buộc');
    }

    const result = await enqueueBackgroundJob({
      type: 'WATCHLIST_ENRICH',
      payload: { symbol: symbol.trim().toUpperCase() },
      processor: processEnrichmentJob
    });

    return createResponse(message, 'WATCHLIST_ENRICHED', {
      success: true,
      queued: true,
      correlationId: result.jobId,
      position: result.position,
      duplicate: result.duplicate || false,
      message: `Đã thêm ${symbol.toUpperCase()} vào hàng đợi đánh giá`
    });
  } catch (error) {
    logger.error('Legacy enqueue failed', { error: error.message, correlationId });
    return createErrorResponse(message, 'QUEUE_ERROR', error.message);
  }
});

// ===== Resume on SW startup =====
// Check for pending enrichment jobs from previous SW lifecycle
resumeOnStartup({
  WATCHLIST_ENRICH: processEnrichmentJob
}).catch(err => {
  logger.warn('Failed to resume queue on startup', { error: err.message });
});

logger.info('Watchlist Enrichment handlers registered (unified queue)');
