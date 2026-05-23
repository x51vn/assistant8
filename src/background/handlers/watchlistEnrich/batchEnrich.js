import { createLogger, generateCorrelationId } from '../../../logger.js';
import { supabase } from '../../../supabaseConfig.js';
import { supabaseWithRetry } from '../../utils/supabaseRetry.js';
import { MESSAGE_TYPES } from '../../../shared/messageSchema.js';
import { SYSTEM_PROMPT_KEYS, DEFAULT_SYSTEM_PROMPTS } from '../../../shared/systemPrompts.js';
import { LLMProviderFactory } from '../../../shared/llm/LLMProviderFactory.js';
import { getProviderForFeature, FEATURE_TYPES } from '../../../shared/llm/llmProviderRouting.js';
import { persistPromptSafe } from '../_persistPromptHelper.js';
import { getFeatureFlag } from '../../../shared/featureFlags.js';
import { calcEdiff, calcPprofit, round4 } from '../../../shared/watchlistCalc.js';
import { isNoiseOnlyResponse, extractFinancialFieldsFromProse } from '../../../shared/llm/parseJsonResponse.js';
import { isJobCancelled } from '../../services/promptQueue.js';
import { parseJsonFromResponse, extractEnrichmentItem, validateEnrichmentData } from './parseHelpers.js';
import { AI_ANALYSIS_COOLDOWN_MS, getUserIdSafe, getUserSettingsConfigForEnrich, processEnrichmentViaOrchestrator } from './singleEnrich.js';

const logger = createLogger('Handlers/WatchlistEnrich');

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
export function broadcastBatchSymbolStatus(correlationId, symbol, status, message) {
  try {
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS,
      correlationId,
      timestamp: Date.now(),
      symbol,
      status,
      message,
    }).catch(() => {});
  } catch { /* no listeners */ }
}

/**
 * Broadcast done for a single symbol within a batch job.
 * Reuses WATCHLIST_AI_ENRICH_DONE for backward compat with WatchlistPage.
 */
export function broadcastBatchSymbolDone(correlationId, symbol, item) {
  try {
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_DONE,
      correlationId,
      timestamp: Date.now(),
      symbol,
      item,
      status: 'done',
    }).catch(() => {});
  } catch { /* no listeners */ }
}
