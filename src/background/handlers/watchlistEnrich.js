/**
 * @fileoverview Manual Watchlist Enrichment Handler
 * Handles per-symbol enrichment requested by user
 *
 * Architecture:
 * - User clicks "Đánh giá" button on watchlist item
 * - Handler prepares enrichment prompt for ChatGPT
 * - Waits for content script to capture ChatGPT response
 * - Parses response and updates Supabase
 * - Stateless handler (Service Worker can terminate anytime)
 *
 * Migration: From periodic automated enrichment to manual per-symbol enrichment
 * Ticket: XST-742
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { generateCorrelationId } from '../../logger.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { SYSTEM_PROMPT_KEYS } from '../../shared/systemPrompts.js';
import { DEFAULT_SYSTEM_PROMPTS } from '../../shared/systemPrompts.js';

const logger = createLogger('Handlers/WatchlistEnrich');

/**
 * Parse JSON from ChatGPT response
 * Extracts JSON object from response text
 */
function parseJsonFromResponse(responseText) {
  try {
    // Try direct JSON parse first
    return JSON.parse(responseText);
  } catch (e) {
    // Try extracting JSON from text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No valid JSON found in response');
  }
}

/**
 * Validate enrichment response has required fields
 */
function validateEnrichmentData(data) {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('entry' in data || 'target' in data || 'stoploss' in data || 'investment_thesis' in data)
  );
}

/**
 * Handle WATCHLIST_ENRICH_SYMBOL
 * Manually enrich a single watchlist item
 *
 * @param {Object} message - { symbol }
 * @returns {Object} Response with enrichment status
 */
registerHandler('WATCHLIST_ENRICH_SYMBOL', async (message) => {
  const { correlationId } = message;
  const { symbol } = message.data || {};

  logger.info('Starting manual enrichment', { symbol, correlationId });

  try {
    // 1. Validate symbol
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Enrichment failed: missing symbol', { correlationId });
      return createErrorResponse(
        message,
        'INVALID_INPUT',
        'Mã cổ phiếu là bắt buộc'
      );
    }

    const sanitizedSymbol = symbol.trim().toUpperCase();

    // 2. Fetch watchlist item from Supabase
    logger.info('Fetching watchlist item', { symbol: sanitizedSymbol, correlationId });
    const { data: watchlistItems, error: fetchError } = await supabase
      .from('watchlist')
      .select('*')
      .eq('symbol', sanitizedSymbol)
      .single();

    if (fetchError || !watchlistItems) {
      logger.error('Failed to fetch watchlist item', {
        symbol: sanitizedSymbol,
        error: fetchError?.message,
        correlationId
      });
      return createErrorResponse(
        message,
        'NOT_FOUND_ERROR',
        `Mã ${sanitizedSymbol} không tồn tại trong watchlist`
      );
    }

    // 3. Get enrichment prompt template
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
      // Fall back to default prompt
      logger.debug('Using default enrichment prompt', { correlationId });
    }

    // 4. Prepare enrichment data for ChatGPT
    const enrichmentData = [
      {
        symbol: watchlistItems.symbol,
        price: watchlistItems.price ?? null,
        ediff: watchlistItems.ediff ?? null,
        investment_thesis: watchlistItems.investment_thesis || null,
        notes: watchlistItems.notes || null
      }
    ];

    // 5. Render prompt with watchlist data
    const asOfDate = new Date().toISOString().split('T')[0];
    const renderedPrompt = promptTemplate
      .replace('{WATCHLIST_ITEMS_JSON}', JSON.stringify(enrichmentData, null, 2))
      .replace('{AS_OF_DATE}', asOfDate);

    // 6. Broadcast enrichment request to UI (content script will handle ChatGPT)
    const enrichmentRunId = generateCorrelationId();
    chrome.runtime.sendMessage({
      v: 1,
      type: 'SEND_PROMPT',
      correlationId: enrichmentRunId,
      timestamp: Date.now(),
      data: {
        prompt: renderedPrompt,
        context: {
          type: 'enrichment',
          symbol: sanitizedSymbol
        }
      }
    }).catch(err => {
      logger.warn('Failed to broadcast enrichment request', { error: err.message, correlationId });
    });

    logger.info('Enrichment prompt sent to ChatGPT', {
      symbol: sanitizedSymbol,
      runId: enrichmentRunId,
      correlationId
    });

    // 7. Wait for content script to capture ChatGPT response (15 min timeout)
    const response = await waitForEnrichmentResponse(enrichmentRunId, 15 * 60 * 1000);

    if (!response) {
      logger.warn('Enrichment timeout - no response from ChatGPT', {
        symbol: sanitizedSymbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'TIMEOUT_ERROR',
        'Hết thời gian chờ. ChatGPT chưa trả lời trong 15 phút.'
      );
    }

    // 8. Parse enrichment response
    logger.info('Parsing enrichment response', {
      symbol: sanitizedSymbol,
      responseLength: response.length,
      correlationId
    });

    let enrichmentResponse;
    try {
      enrichmentResponse = parseJsonFromResponse(response);
    } catch (parseError) {
      logger.error('Failed to parse enrichment response', {
        error: parseError.message,
        symbol: sanitizedSymbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'PARSE_ERROR',
        'ChatGPT trả lời không đúng định dạng JSON'
      );
    }

    if (!validateEnrichmentData(enrichmentResponse)) {
      logger.error('Invalid enrichment data from ChatGPT', {
        data: enrichmentResponse,
        symbol: sanitizedSymbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'VALIDATION_ERROR',
        'Dữ liệu từ ChatGPT không hợp lệ'
      );
    }

    // 9. Build update data from enrichment response
    const updateData = {};
    if (enrichmentResponse.entry !== undefined && enrichmentResponse.entry !== null) {
      updateData.entry = Number(enrichmentResponse.entry);
    }
    if (enrichmentResponse.target !== undefined && enrichmentResponse.target !== null) {
      updateData.target = Number(enrichmentResponse.target);
    }
    if (enrichmentResponse.stoploss !== undefined && enrichmentResponse.stoploss !== null) {
      updateData.stoploss = Number(enrichmentResponse.stoploss);
    }
    if (enrichmentResponse.investment_thesis !== undefined && enrichmentResponse.investment_thesis !== null) {
      updateData.investment_thesis = enrichmentResponse.investment_thesis;
    }

    if (Object.keys(updateData).length === 0) {
      logger.warn('No fields to update in enrichment response', {
        symbol: sanitizedSymbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'EMPTY_UPDATE',
        'ChatGPT không cung cấp thông tin cần cập nhật'
      );
    }

    // 10. Update watchlist item in Supabase
    logger.info('Updating watchlist item', {
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
      logger.error('Watchlist update failed', {
        symbol: sanitizedSymbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'UPDATE_ERROR',
        'Không thể cập nhật watchlist'
      );
    }

    const updatedItem = updateResult.data[0];

    logger.info('✅ Enrichment completed successfully', {
      symbol: sanitizedSymbol,
      updatedFields: Object.keys(updateData),
      correlationId
    });

    return createResponse(message, 'WATCHLIST_ENRICHED', {
      success: true,
      symbol: sanitizedSymbol,
      item: updatedItem,
      message: `Đã cập nhật thông tin đánh giá cho ${sanitizedSymbol}`
    });

  } catch (error) {
    logger.error('Enrichment handler exception', {
      error: error.message,
      symbol: symbol?.toUpperCase(),
      correlationId,
      stack: error.stack
    });

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return createErrorResponse(
        message,
        'NETWORK_ERROR',
        'Không thể kết nối. Vui lòng kiểm tra mạng.'
      );
    }

    return createErrorResponse(
      message,
      'UNKNOWN_ERROR',
      'Lỗi khi đánh giá. Vui lòng thử lại.'
    );
  }
});

/**
 * Wait for content script to capture enrichment response from ChatGPT
 * Listens for CONTENT_ENRICHMENT_RESPONSE message
 *
 * @param {string} runId - Request correlation ID
 * @param {number} timeoutMs - Timeout in milliseconds (default 15 min)
 * @returns {Promise<string|null>} Response text or null on timeout
 */
function waitForEnrichmentResponse(runId, timeoutMs = 900000) {
  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId;

    const handler = (message) => {
      if (resolved) return;

      if (
        message?.type === 'CONTENT_ENRICHMENT_RESPONSE' &&
        message?.data?.runId === runId &&
        typeof message?.data?.response === 'string'
      ) {
        resolved = true;
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(handler);
        logger.info('Enrichment response captured from content script', {
          runId,
          responseLength: message.data.response.length
        });
        resolve(message.data.response);
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.runtime.onMessage.removeListener(handler);
        logger.warn('Enrichment response timeout', { runId });
        resolve(null);
      }
    }, timeoutMs);
  });
}

logger.info('Manual Watchlist Enrichment handler registered');
