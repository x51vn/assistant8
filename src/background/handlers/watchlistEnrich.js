/**
 * @fileoverview Manual Watchlist Enrichment Handler
 * Handles per-symbol enrichment requested by user
 *
 * Architecture (follows same pattern as prompt.js / PortfolioPage):
 * 1. User clicks "Đánh giá" button on watchlist item
 * 2. Handler prepares enrichment prompt
 * 3. Opens ChatGPT tab and sends prompt (via ChatGPTSession)
 * 4. Waits for ChatGPT response (via ChatGPTSession.getOutput)
 * 5. Content script auto-captures response → saved to chat_history
 * 6. Parses response JSON → extracts entry/target/stoploss/thesis
 * 7. Updates watchlist item in Supabase
 *
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
import * as ChatGPTSession from '../../chatgptSession.js';
import { persistPromptSafe } from './_persistPromptHelper.js';

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
    // Try extracting JSON object from surrounding text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
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
 * Handle WATCHLIST_ENRICH_SYMBOL
 * Manually enrich a single watchlist item
 *
 * Flow: Prepare prompt → Open ChatGPT → Send prompt → Wait response → Parse → Update Supabase
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
    const { data: watchlistItem, error: fetchError } = await supabase
      .from('watchlist')
      .select('*')
      .eq('symbol', sanitizedSymbol)
      .single();

    if (fetchError || !watchlistItem) {
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
      logger.debug('Using default enrichment prompt', { correlationId });
    }

    // 4. Prepare enrichment data for ChatGPT
    const enrichmentData = [
      {
        symbol: watchlistItem.symbol,
        price: watchlistItem.price ?? null,
        ediff: watchlistItem.ediff ?? null,
        investment_thesis: watchlistItem.investment_thesis || null,
        notes: watchlistItem.notes || null
      }
    ];

    // 5. Render prompt with watchlist data
    const asOfDate = new Date().toISOString().split('T')[0];
    const renderedPrompt = promptTemplate
      .replace('{WATCHLIST_ITEMS_JSON}', JSON.stringify(enrichmentData, null, 2))
      .replace('{AS_OF_DATE}', asOfDate);

    // 6. Open ChatGPT tab (same as prompt.js handler)
    logger.info('Opening ChatGPT tab for enrichment', { symbol: sanitizedSymbol, correlationId });
    const tabResult = await ChatGPTSession.ensureChatGPTTab({
      createIfNeeded: true,
      focusTab: true
    });

    if (tabResult.error) {
      logger.error('Failed to open ChatGPT tab', { error: tabResult.error, correlationId });
      return createErrorResponse(
        message,
        'CHATGPT_ERROR',
        'Không thể mở ChatGPT. Vui lòng thử lại.'
      );
    }

    // 7. Send prompt to ChatGPT (same as prompt.js handler)
    const enrichmentRunId = generateCorrelationId();
    logger.info('Sending enrichment prompt to ChatGPT', {
      symbol: sanitizedSymbol,
      runId: enrichmentRunId,
      tabId: tabResult.tabId,
      promptLength: renderedPrompt.length,
      correlationId
    });

    const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, renderedPrompt.trim(), {
      createNewChat: true,
      runId: enrichmentRunId, // Enables content script auto-capture → chat_history
    });

    if (!sendResult.success) {
      const errorMsg = sendResult.error || 'Failed to send prompt';
      logger.error('Failed to send enrichment prompt', { error: errorMsg, correlationId });
      return createErrorResponse(
        message,
        'SEND_ERROR',
        'Không thể gửi prompt đánh giá lên ChatGPT.'
      );
    }

    // 8. Persist prompt to chat_history (response auto-saved by content script via CONTENT_RESPONSE_CAPTURED)
    const chatId = sendResult.data?.chatId || null;
    const chatUrl = sendResult.data?.chatUrl || null;
    await persistPromptSafe(enrichmentRunId, renderedPrompt, chatId, chatUrl, {
      source: 'WATCHLIST_ENRICH',
      symbol: sanitizedSymbol
    });

    logger.info('Enrichment prompt sent, waiting for ChatGPT response', {
      symbol: sanitizedSymbol,
      runId: enrichmentRunId,
      chatId,
      correlationId
    });

    // 9. Wait for ChatGPT response (same as ChatGPTSession.getOutput)
    const outputResult = await ChatGPTSession.getOutput(tabResult.tabId, {
      wait: true,
      timeoutMs: 15 * 60 * 1000, // 15 minutes
      stableMs: 1500
    });

    if (!outputResult.success || !outputResult.data?.result) {
      logger.warn('Enrichment: no response from ChatGPT', {
        symbol: sanitizedSymbol,
        outputStatus: outputResult.data?.status,
        correlationId
      });
      return createErrorResponse(
        message,
        'TIMEOUT_ERROR',
        'Hết thời gian chờ. ChatGPT chưa trả lời.'
      );
    }

    const responseText = outputResult.data.result;

    // 10. Parse enrichment response
    logger.info('Parsing enrichment response', {
      symbol: sanitizedSymbol,
      responseLength: responseText.length,
      correlationId
    });

    let enrichmentResponse;
    try {
      const parsed = parseJsonFromResponse(responseText);
      // Extract item from response (handles both flat and { items: [...] } formats)
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

    // 11. Build update data from enrichment response
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

    // 12. Update watchlist item in Supabase
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

    logger.info('Enrichment completed successfully', {
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

logger.info('Manual Watchlist Enrichment handler registered');
