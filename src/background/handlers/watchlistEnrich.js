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
import { safeBroadcast } from '../../shared/safeBroadcast.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { SYSTEM_PROMPT_KEYS } from '../../shared/systemPrompts.js';
import { DEFAULT_SYSTEM_PROMPTS } from '../../shared/systemPrompts.js';
import { LLMProviderFactory } from '../../shared/llm/LLMProviderFactory.js';
import { getProviderForFeature, FEATURE_TYPES } from '../../shared/llm/llmProviderRouting.js';
import { persistPromptSafe } from './_persistPromptHelper.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { calcEdiff, calcPprofit, round4 } from '../../shared/watchlistCalc.js';
import { parseJsonResponse, isNoiseOnlyResponse, extractFinancialFieldsFromProse } from '../../shared/llm/parseJsonResponse.js';

/** Rate-limit window: 1 AI analysis per symbol per hour */
const AI_ANALYSIS_COOLDOWN_MS = 60 * 60 * 1000;
/** Max symbols per batch prompt */
const BATCH_SIZE = 10;
import { runStockResearch } from '../services/stock/stockResearchOrchestrator.js';
import {
  enqueueBackgroundJob,
  cancelJob,
  getQueueInfo,
  resetQueue,
  resumeOnStartup,
  isJobCancelled,
} from '../services/promptQueue.js';

const logger = createLogger('Handlers/WatchlistEnrich');

/**
 * Parse JSON from LLM response — delegates to the shared 12-strategy extractor.
 * Throws if no parseable JSON is found (callers rely on throw for error handling).
 *
 * @param {string} responseText
 * @returns {Object} parsed JSON object
 * @throws {Error} if extraction fails after all strategies
 */
function parseJsonFromResponse(responseText) {
  const result = parseJsonResponse(responseText);
  if (!result.success) {
    throw new Error(`JSON extraction failed: ${result.error}`);
  }
  if (result.partial) {
    logger.warn('parseJsonFromResponse: used field-regex fallback (partial data)', {
      strategy: result.strategy,
      keys: Object.keys(result.data || {}),
    });
  } else {
    logger.debug('parseJsonFromResponse: success', { strategy: result.strategy });
  }
  return result.data;
}

/**
 * Check if response text contains parseable JSON content
 */
function hasJsonContent(text) {
  if (!text) return false;
  return /[{\[]/.test(text);
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

    // 0. Get userId early — needed for explicit user_id filter AND enrichment paths
    //    Also force a session refresh to avoid SW-restart race condition:
    //    getUser() might succeed with a stale in-memory token while the
    //    actual DB request would use an expired JWT, causing RLS to return 0 rows.
    const userId = await getUserIdSafe();
    if (!userId) {
      logger.warn('Enrichment job: no authenticated user', { symbol: sanitizedSymbol, correlationId });
      return { success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' };
    }

    // Ensure access token is fresh before making any DB requests (prevents
    // PGRST116 "no rows" that are actually silent RLS auth failures)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          logger.warn('Session refresh failed before DB query', { correlationId, error: refreshErr.message });
          return { success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' };
        }
      }
    } catch (sessionErr) {
      logger.debug('Session check skipped', { correlationId, error: sessionErr.message });
    }

    // 1. Fetch watchlist item from Supabase with explicit user_id filter
    //    Use limit(1).maybeSingle() so that "0 rows" → {data:null, error:null}
    //    and "multiple rows" (duplicates) → returns first row without PGRST116.
    const { data: watchlistItem, error: fetchError } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('symbol', sanitizedSymbol)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      logger.error('Failed to fetch watchlist item', {
        symbol: sanitizedSymbol,
        errorCode: fetchError.code,
        errorMessage: fetchError.message,
        correlationId
      });
      const isAuthError = fetchError.code === 'PGRST301' ||
        fetchError.status === 401 ||
        String(fetchError.message).toLowerCase().includes('jwt') ||
        String(fetchError.message).toLowerCase().includes('unauthorized');
      if (isAuthError) {
        return { success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' };
      }
      return { success: false, error: `Không thể đọc watchlist: ${fetchError.message}` };
    }

    if (!watchlistItem) {
      logger.warn('Watchlist item not found', { symbol: sanitizedSymbol, userId, correlationId });
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

    // XST-803: Route to orchestrator (stock_research_v2=true) or default direct path.
    // Orchestrator: multi-step pipeline via runStockResearch(), maps entryPrice/targetPrice/stopLoss/recommendation.
    // Default: single LLMProvider.sendPrompt() with WATCHLIST_ENRICH prompt, parses JSON response directly.
    const settingsConfig = await getUserSettingsConfigForEnrich(userId);
    const useOrchestrator = getFeatureFlag('stock_research_v2', settingsConfig);

    if (useOrchestrator) {
      return await processEnrichmentViaOrchestrator(
        sanitizedSymbol, watchlistItem, userId, settingsConfig, correlationId
      );
    }

    // Default path: single LLMProvider call (stock_research_v2=false)

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

    // 4. Check cancellation before sending
    if (await isJobCancelled(correlationId)) {
      return { success: false, error: 'Job cancelled by user' };
    }

    // 5. Resolve provider and send prompt
    // Provider (ChatGPT / Gemini / Claude) resolved from user settings via feature routing.
    // Tab lifecycle is managed internally by the provider.
    //
    // IMPORTANT: Pass passthrough enqueue (fn => fn()) instead of promptQueueEnqueue.
    // This job is ALREADY running inside the p-queue (via enqueueBackgroundJob).
    // If we passed the real enqueue, the provider would try to queue.add() a nested
    // task, but concurrency=1 means that nested task waits for THIS job to finish
    // first — creating a DEADLOCK.
    const enrichmentRunId = generateCorrelationId();
    const providerRouting = getProviderForFeature(FEATURE_TYPES.WATCHLIST_ENRICH, settingsConfig);
    const provider = LLMProviderFactory.create(providerRouting, { enqueue: fn => fn() });

    logger.info('Sending enrichment prompt via LLM provider', {
      symbol: sanitizedSymbol,
      provider: providerRouting.provider,
      correlationId
    });

    let responseText;
    let chatId = null;
    let chatUrl = null;
    try {
      const result = await provider.sendPrompt(renderedPrompt.trim(), {
        createNewChat: true,
        runId: enrichmentRunId,
      });
      responseText = result.text;
      chatId = result.chatId || null;
      chatUrl = result.chatUrl || null;
    } catch (sendErr) {
      return { success: false, error: `Không thể gửi prompt đánh giá: ${sendErr.message}` };
    }

    // 5b. Auto-retry: if response is pure web-search noise (no JSON at all),
    //     send a follow-up prompt in the SAME chat asking for JSON output.
    //     ChatGPT sometimes returns only source cards without actual analysis.
    const MAX_NOISE_RETRIES = 2;
    for (let retryIdx = 0; retryIdx < MAX_NOISE_RETRIES && isNoiseOnlyResponse(responseText); retryIdx++) {
      logger.warn('Response is noise-only (web-search cards), retrying with JSON reminder', {
        symbol: sanitizedSymbol,
        retryIdx: retryIdx + 1,
        responsePreview: responseText?.substring(0, 200),
        correlationId
      });

      if (await isJobCancelled(correlationId)) {
        return { success: false, error: 'Job cancelled by user' };
      }

      try {
        const retryPrompt = retryIdx === 0
          ? `Vui lòng trả lời lại dưới dạng JSON theo format đã yêu cầu cho mã ${sanitizedSymbol}. Chỉ trả về JSON object, không kèm text.`
          : `Hãy phân tích cổ phiếu ${sanitizedSymbol} và trả kết quả dưới dạng JSON với các trường: entry, target, stoploss, investment_thesis. Chỉ trả về JSON.`;

        const retryResult = await provider.sendPrompt(retryPrompt, {
          createNewChat: false,  // Continue same conversation
          runId: enrichmentRunId,
        });
        responseText = retryResult.text;
        chatId = retryResult.chatId || chatId;
        chatUrl = retryResult.chatUrl || chatUrl;
      } catch (retryErr) {
        logger.warn('Noise-retry prompt failed', {
          symbol: sanitizedSymbol,
          error: retryErr.message,
          correlationId
        });
        break; // Stop retrying, proceed to parse whatever we have
      }
    }

    // 6. Persist prompt to chat_history
    await persistPromptSafe(enrichmentRunId, renderedPrompt, chatId, chatUrl, {
      source: 'WATCHLIST_ENRICH',
      symbol: sanitizedSymbol
    });

    // 7. Check cancellation after response received
    if (await isJobCancelled(correlationId)) {
      return { success: false, error: 'Job cancelled by user' };
    }

    // 7b. Final noise check — if still no content after retries, return clear error
    if (isNoiseOnlyResponse(responseText)) {
      logger.error('Response still noise-only after retries', {
        symbol: sanitizedSymbol,
        responsePreview: responseText?.substring(0, 300),
        correlationId
      });
      return {
        success: false,
        error: `AI chỉ trả về kết quả tìm kiếm web, không có nội dung phân tích cho ${sanitizedSymbol}. Vui lòng thử lại.`
      };
    }

    // 8. Parse enrichment response
    let enrichmentResponse;
    try {
      const parsed = parseJsonFromResponse(responseText);

      // Handle arrays — extractEnrichmentItem expects an object
      const dataObj = Array.isArray(parsed)
        ? (parsed.find(it => it.symbol?.toUpperCase() === sanitizedSymbol) || parsed[0] || {})
        : parsed;

      enrichmentResponse = extractEnrichmentItem(dataObj, sanitizedSymbol);
      if (!enrichmentResponse) {
        throw new Error('Could not extract enrichment data from response');
      }
    } catch (parseError) {
      // Last resort: try extracting financial fields from prose/broken text
      const proseResult = extractFinancialFieldsFromProse(responseText);
      if (proseResult.ok && validateEnrichmentData(proseResult.data)) {
        logger.warn('JSON parse failed but extracted financial fields from prose', {
          symbol: sanitizedSymbol,
          fields: Object.keys(proseResult.data),
          correlationId
        });
        enrichmentResponse = proseResult.data;
      } else {
        logger.error('Failed to parse enrichment response', {
          error: parseError.message,
          symbol: sanitizedSymbol,
          responsePreview: responseText.substring(0, 500),
          proseAttempt: proseResult.ok ? 'partial but invalid' : 'no fields found',
          correlationId
        });
        return {
          success: false,
          error: `AI trả lời không đúng định dạng JSON. Chi tiết: ${parseError.message.substring(0, 120)}`
        };
      }
    }

    if (!validateEnrichmentData(enrichmentResponse)) {
      return { success: false, error: 'Dữ liệu từ ChatGPT không hợp lệ' };
    }

    // 9. Build update data
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

    // 10. Update watchlist item in Supabase (background-only, UI-independent)
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
          .eq('user_id', userId)
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
        // Passthrough enqueue — already inside p-queue (see default path comment)
        enqueue: fn => fn(),
        onProgress: (status) => {
          // Broadcast enrichment progress to UI
          safeBroadcast({
            v: 1,
            type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS,
            correlationId,
            timestamp: Date.now(),
            symbol,
            status: status.status,
            step: status.step,
            totalSteps: status.totalSteps,
            message: status.message,
          });
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
          .eq('user_id', userId)
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

// ===== Batch Processor Function (used by queue worker) =====

/**
 * Process a batch enrichment job — multiple symbols in ONE LLM prompt.
 * This dramatically reduces LLM roundtrips vs. per-symbol enrichment.
 *
 * @param {Object} job - { correlationId, payload: { symbols: string[] }, attempt }
 * @returns {Promise<{success: boolean, results?: Object[], error?: string}>}
 */
export async function processBatchEnrichmentJob(job) {
  const { correlationId, payload } = job;
  const symbols = payload?.symbols || [];

  logger.info('Processing batch enrichment job', {
    symbols,
    count: symbols.length,
    correlationId,
    attempt: job.attempt
  });

  if (!symbols.length) {
    return { success: false, error: 'Danh sách mã cổ phiếu trống' };
  }

  try {
    // 0. Auth
    const userId = await getUserIdSafe();
    if (!userId) {
      return { success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' };
    }

    // Ensure access token is fresh
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          return { success: false, error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' };
        }
      }
    } catch (sessionErr) {
      logger.debug('Session check skipped', { correlationId, error: sessionErr.message });
    }

    // 1. Fetch ALL watchlist items for these symbols in one query
    const { data: watchlistItems, error: fetchError } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .in('symbol', symbols);

    if (fetchError) {
      logger.error('Failed to fetch watchlist items for batch', {
        symbols,
        errorMessage: fetchError.message,
        correlationId
      });
      return { success: false, error: `Không thể đọc watchlist: ${fetchError.message}` };
    }

    if (!watchlistItems || watchlistItems.length === 0) {
      return { success: false, error: 'Không tìm thấy mã cổ phiếu nào trong watchlist' };
    }

    // 2. Filter rate-limited symbols & build enrichment data
    const now = Date.now();
    const eligibleItems = [];
    const skippedSymbols = [];

    for (const item of watchlistItems) {
      if (item.last_ai_analysis_at) {
        const elapsed = now - new Date(item.last_ai_analysis_at).getTime();
        if (elapsed < AI_ANALYSIS_COOLDOWN_MS) {
          const minutesLeft = Math.ceil((AI_ANALYSIS_COOLDOWN_MS - elapsed) / 60000);
          skippedSymbols.push({ symbol: item.symbol, minutesLeft });
          // Broadcast skip status for this symbol
          broadcastBatchSymbolStatus(correlationId, item.symbol, 'skipped',
            `${item.symbol} đã phân tích gần đây, đợi ${minutesLeft} phút`);
          continue;
        }
      }
      eligibleItems.push(item);
    }

    if (eligibleItems.length === 0) {
      return {
        success: true,
        results: [],
        skipped: skippedSymbols,
        error: 'Tất cả mã đều được phân tích gần đây. Vui lòng đợi.'
      };
    }

    // Broadcast running status for eligible symbols
    for (const item of eligibleItems) {
      broadcastBatchSymbolStatus(correlationId, item.symbol, 'running',
        `Đang phân tích batch (${eligibleItems.length} mã)...`);
    }

    // 3. Check feature flags
    const settingsConfig = await getUserSettingsConfigForEnrich(userId);
    const useOrchestrator = getFeatureFlag('stock_research_v2', settingsConfig);

    // Orchestrator path doesn't support batch — fall back to sequential
    if (useOrchestrator) {
      logger.info('Orchestrator mode: falling back to sequential for batch', { correlationId });
      const results = [];
      for (const item of eligibleItems) {
        if (await isJobCancelled(correlationId)) {
          return { success: false, error: 'Job cancelled by user' };
        }
        broadcastBatchSymbolStatus(correlationId, item.symbol, 'running',
          `Đang phân tích ${item.symbol} qua orchestrator...`);
        const result = await processEnrichmentViaOrchestrator(
          item.symbol, item, userId, settingsConfig, correlationId
        );
        if (result.success) {
          results.push(result.item);
          broadcastBatchSymbolDone(correlationId, item.symbol, result.item);
        } else {
          broadcastBatchSymbolStatus(correlationId, item.symbol, 'failed', result.error);
        }
      }
      return { success: true, results, skipped: skippedSymbols };
    }

    // 4. Get enrichment prompt template
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
      logger.debug('Using default enrichment prompt for batch', { correlationId });
    }

    // 5. Prepare batch enrichment data (all eligible items)
    const enrichmentData = eligibleItems.map(item => ({
      symbol: item.symbol,
      price: item.price ?? null,
      ediff: item.ediff ?? null,
      investment_thesis: item.investment_thesis || null,
      notes: item.notes || null
    }));

    const asOfDate = new Date().toISOString().split('T')[0];
    const renderedPrompt = promptTemplate
      .replace('{WATCHLIST_ITEMS_JSON}', JSON.stringify(enrichmentData, null, 2))
      .replace('{AS_OF_DATE}', asOfDate);

    // 6. Check cancellation before sending
    if (await isJobCancelled(correlationId)) {
      return { success: false, error: 'Job cancelled by user' };
    }

    // 7. Resolve provider and send prompt
    const enrichmentRunId = generateCorrelationId();
    const providerRouting = getProviderForFeature(FEATURE_TYPES.WATCHLIST_ENRICH, settingsConfig);
    const provider = LLMProviderFactory.create(providerRouting, { enqueue: fn => fn() });

    logger.info('Sending batch enrichment prompt via LLM provider', {
      symbols: eligibleItems.map(i => i.symbol),
      count: eligibleItems.length,
      provider: providerRouting.provider,
      correlationId
    });

    let responseText;
    let chatId = null;
    let chatUrl = null;
    try {
      const result = await provider.sendPrompt(renderedPrompt.trim(), {
        createNewChat: true,
        runId: enrichmentRunId,
      });
      responseText = result.text;
      chatId = result.chatId || null;
      chatUrl = result.chatUrl || null;
    } catch (sendErr) {
      // Mark all symbols as failed
      for (const item of eligibleItems) {
        broadcastBatchSymbolStatus(correlationId, item.symbol, 'failed',
          `Không thể gửi prompt: ${sendErr.message}`);
      }
      return { success: false, error: `Không thể gửi prompt đánh giá batch: ${sendErr.message}` };
    }

    // 7b. Auto-retry if noise-only response
    const MAX_NOISE_RETRIES = 2;
    for (let retryIdx = 0; retryIdx < MAX_NOISE_RETRIES && isNoiseOnlyResponse(responseText); retryIdx++) {
      logger.warn('Batch response is noise-only, retrying', { retryIdx: retryIdx + 1, correlationId });
      if (await isJobCancelled(correlationId)) {
        return { success: false, error: 'Job cancelled by user' };
      }
      try {
        const symbolList = eligibleItems.map(i => i.symbol).join(', ');
        const retryPrompt = retryIdx === 0
          ? `Vui lòng trả lời lại dưới dạng JSON theo format đã yêu cầu cho các mã: ${symbolList}. Chỉ trả về JSON object với mảng items.`
          : `Hãy phân tích các cổ phiếu ${symbolList} và trả kết quả dưới dạng JSON với items array, mỗi item có: symbol, entry, target, stoploss, investment_thesis. Chỉ trả về JSON.`;
        const retryResult = await provider.sendPrompt(retryPrompt, {
          createNewChat: false,
          runId: enrichmentRunId,
        });
        responseText = retryResult.text;
        chatId = retryResult.chatId || chatId;
        chatUrl = retryResult.chatUrl || chatUrl;
      } catch (retryErr) {
        logger.warn('Batch noise-retry failed', { error: retryErr.message, correlationId });
        break;
      }
    }

    // 8. Persist prompt to chat_history
    await persistPromptSafe(enrichmentRunId, renderedPrompt, chatId, chatUrl, {
      source: 'WATCHLIST_ENRICH_BATCH',
      symbols: eligibleItems.map(i => i.symbol)
    });

    // 9. Check cancellation after response
    if (await isJobCancelled(correlationId)) {
      return { success: false, error: 'Job cancelled by user' };
    }

    // 9b. Final noise check
    if (isNoiseOnlyResponse(responseText)) {
      for (const item of eligibleItems) {
        broadcastBatchSymbolStatus(correlationId, item.symbol, 'failed',
          'AI chỉ trả về kết quả tìm kiếm web');
      }
      return { success: false, error: 'AI chỉ trả về kết quả tìm kiếm web, không có nội dung phân tích.' };
    }

    // 10. Parse batch response
    let parsedItems = [];
    try {
      const parsed = parseJsonFromResponse(responseText);

      // Handle response formats:
      // Format 1: { as_of: "...", items: [...] }
      // Format 2: Array of items directly
      // Format 3: Single item (fallback for single-symbol batch)
      if (parsed.items && Array.isArray(parsed.items)) {
        parsedItems = parsed.items;
      } else if (Array.isArray(parsed)) {
        parsedItems = parsed;
      } else if ('entry' in parsed || 'target' in parsed || 'stoploss' in parsed) {
        parsedItems = [parsed];
      } else {
        throw new Error('Unexpected response format: no items array found');
      }
    } catch (parseError) {
      // Last resort: try extracting financial fields from prose
      const proseResult = extractFinancialFieldsFromProse(responseText);
      if (proseResult.ok && validateEnrichmentData(proseResult.data)) {
        parsedItems = [proseResult.data];
        logger.warn('Batch JSON parse failed but extracted fields from prose', {
          fields: Object.keys(proseResult.data),
          correlationId
        });
      } else {
        logger.error('Failed to parse batch enrichment response', {
          error: parseError.message,
          responsePreview: responseText.substring(0, 500),
          correlationId
        });
        for (const item of eligibleItems) {
          broadcastBatchSymbolStatus(correlationId, item.symbol, 'failed',
            'AI trả lời không đúng định dạng JSON');
        }
        return { success: false, error: `AI trả lời không đúng định dạng JSON: ${parseError.message.substring(0, 120)}` };
      }
    }

    // 11. Map parsed items back to watchlist items and update Supabase
    const results = [];
    const nowIso = new Date().toISOString();
    const itemMap = new Map(eligibleItems.map(i => [i.symbol.toUpperCase(), i]));

    for (const parsedItem of parsedItems) {
      const sym = parsedItem.symbol?.toUpperCase();
      if (!sym) continue;
      const watchlistItem = itemMap.get(sym);
      if (!watchlistItem) {
        logger.warn('Parsed symbol not found in eligible items', { symbol: sym, correlationId });
        continue;
      }

      // Extract enrichment from parsed item
      const enrichmentResponse = extractEnrichmentItem(parsedItem, sym);
      if (!enrichmentResponse || !validateEnrichmentData(enrichmentResponse)) {
        logger.warn('Invalid enrichment data for symbol in batch', { symbol: sym, correlationId });
        broadcastBatchSymbolStatus(correlationId, sym, 'failed',
          `Dữ liệu AI cho ${sym} không hợp lệ`);
        continue;
      }

      // Build update data
      const updateData = {};
      if (enrichmentResponse.entry != null) {
        updateData.entry = Number(enrichmentResponse.entry);
        updateData.entry_updated_at = nowIso;
      }
      if (enrichmentResponse.target != null) {
        updateData.target = Number(enrichmentResponse.target);
        updateData.target_updated_at = nowIso;
      }
      if (enrichmentResponse.stoploss != null) {
        updateData.stoploss = Number(enrichmentResponse.stoploss);
        updateData.stoploss_updated_at = nowIso;
      }
      if (enrichmentResponse.investment_thesis != null) {
        updateData.investment_thesis = enrichmentResponse.investment_thesis;
      }

      if (Object.keys(updateData).length === 0) {
        broadcastBatchSymbolStatus(correlationId, sym, 'failed',
          `AI không cung cấp thông tin cho ${sym}`);
        continue;
      }

      // Calculate derived fields
      const effectiveEntry = updateData.entry ?? watchlistItem.entry ?? null;
      const effectiveTarget = updateData.target ?? watchlistItem.target ?? null;
      const effectivePrice = watchlistItem.price ?? null;
      updateData.ediff = round4(calcEdiff(effectivePrice, effectiveEntry));
      updateData.pprofit = round4(calcPprofit(effectiveTarget, effectiveEntry));
      updateData.last_ai_analysis_at = nowIso;

      // Update Supabase
      try {
        const updateResult = await supabaseWithRetry(
          async () => {
            const response = await supabase
              .from('watchlist')
              .update(updateData)
              .eq('user_id', userId)
              .eq('symbol', sym)
              .select();
            if (response.error) throw response.error;
            return response;
          },
          { operationName: `watchlist.batch-enrich-update-${sym}`, maxRetries: 2, correlationId }
        );

        if (updateResult.data && updateResult.data.length > 0) {
          const updatedItem = updateResult.data[0];
          results.push(updatedItem);
          broadcastBatchSymbolDone(correlationId, sym, updatedItem);
          logger.info('Batch enrichment updated symbol', {
            symbol: sym,
            fields: Object.keys(updateData),
            correlationId
          });
        } else {
          broadcastBatchSymbolStatus(correlationId, sym, 'failed', 'Không thể cập nhật watchlist');
        }
      } catch (updateErr) {
        logger.error('Batch enrichment update failed for symbol', {
          symbol: sym,
          error: updateErr.message,
          correlationId
        });
        broadcastBatchSymbolStatus(correlationId, sym, 'failed', updateErr.message);
      }

      // Remove from map to track missing symbols
      itemMap.delete(sym);
    }

    // Report symbols that were in input but not in LLM response
    for (const [missingSym] of itemMap) {
      broadcastBatchSymbolStatus(correlationId, missingSym, 'failed',
        `AI không trả lời cho mã ${missingSym}`);
    }

    logger.info('Batch enrichment completed', {
      totalRequested: eligibleItems.length,
      totalUpdated: results.length,
      skipped: skippedSymbols.length,
      correlationId
    });

    return { success: true, results, skipped: skippedSymbols };

  } catch (error) {
    logger.error('Batch enrichment processor exception', {
      error: error.message,
      symbols,
      correlationId,
      stack: error.stack
    });
    return { success: false, error: 'Lỗi khi đánh giá batch. Vui lòng thử lại.' };
  }
}

// ===== Batch Broadcasting Helpers =====

/**
 * Broadcast status for a single symbol within a batch job.
 * Uses same message types as single-enrichment for UI compatibility.
 */
function broadcastBatchSymbolStatus(correlationId, symbol, status, message) {
  safeBroadcast({
    v: 1,
    type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS,
    correlationId,
    timestamp: Date.now(),
    symbol,
    status,
    message,
  });
}

/**
 * Broadcast done for a single symbol within a batch job.
 * Reuses WATCHLIST_AI_ENRICH_DONE for backward compat with WatchlistPage.
 */
function broadcastBatchSymbolDone(correlationId, symbol, item) {
  safeBroadcast({
    v: 1,
    type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_DONE,
    correlationId,
    timestamp: Date.now(),
    symbol,
    item,
    status: 'done',
  });
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
 * WATCHLIST_AI_ENRICH_BATCH_RUN — Batch enrichment handler
 * UI → Background: enqueue batch of symbols (max BATCH_SIZE per LLM prompt)
 * Splits into chunks of BATCH_SIZE, each chunk becomes ONE background job → ONE LLM call
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_BATCH_RUN, async (message) => {
  const { correlationId } = message;
  const { symbols } = message.data || {};

  logger.info('Enqueue batch enrichment request', { symbols, correlationId });

  try {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return createErrorResponse(message, 'INVALID_INPUT', 'Danh sách mã cổ phiếu là bắt buộc');
    }

    // Sanitize & deduplicate
    const cleanSymbols = [...new Set(
      symbols
        .filter(s => typeof s === 'string' && s.trim())
        .map(s => s.trim().toUpperCase())
    )];

    if (cleanSymbols.length === 0) {
      return createErrorResponse(message, 'INVALID_INPUT', 'Không có mã cổ phiếu hợp lệ');
    }

    // Split into chunks of BATCH_SIZE
    const chunks = [];
    for (let i = 0; i < cleanSymbols.length; i += BATCH_SIZE) {
      chunks.push(cleanSymbols.slice(i, i + BATCH_SIZE));
    }

    // Enqueue each chunk as a separate background job
    const jobResults = [];
    for (const chunk of chunks) {
      const result = await enqueueBackgroundJob({
        type: 'WATCHLIST_ENRICH_BATCH',
        payload: { symbols: chunk },
        processor: processBatchEnrichmentJob
      });
      jobResults.push({
        jobId: result.jobId,
        position: result.position,
        symbols: chunk,
        duplicate: result.duplicate || false
      });
    }

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      totalSymbols: cleanSymbols.length,
      batches: jobResults.length,
      jobs: jobResults,
      message: `Đã tạo ${jobResults.length} batch (${cleanSymbols.length} mã, tối đa ${BATCH_SIZE} mã/batch)`
    });
  } catch (error) {
    logger.error('Batch enqueue failed', { error: error.message, correlationId });
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
  WATCHLIST_ENRICH: processEnrichmentJob,
  WATCHLIST_ENRICH_BATCH: processBatchEnrichmentJob
}).catch(err => {
  logger.warn('Failed to resume queue on startup', { error: err.message });
});

logger.info('Watchlist Enrichment handlers registered (unified queue)');
