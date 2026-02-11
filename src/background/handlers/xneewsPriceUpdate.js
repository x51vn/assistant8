/**
 * @fileoverview Watchlist Price Update Handler (migrated from x51.vn)
 * Fetches latest watchlist prices from Supabase and broadcasts to UI
 * Runs periodically via chrome.alarms (every 5 minutes during market hours)
 *
 * Migration: x51.vn → Supabase (2026-02-11)
 * Ticket: XST-744
 *
 * Features:
 * - Fetch prices from Supabase watchlist table
 * - Broadcast updates to UI via chrome.runtime.sendMessage
 * - Market hours check (9:00-15:00 VN weekdays)
 * - Retry with exponential backoff via supabaseWithRetry
 */

import { createLogger } from '../../logger.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { registerHandler } from '../messageRouter.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { isMarketHours } from '../utils/marketHours.js';

const logger = createLogger('Handlers/PriceUpdate');

/**
 * Handle XNEEWS_PRICE_UPDATE request (from alarm)
 *
 * Fetches watchlist prices from Supabase and broadcasts to UI
 *
 * @param {Object} message - Message with type XNEEWS_PRICE_UPDATE
 * @returns {Promise<Object>} Response message
 */
registerHandler(MESSAGE_TYPES.XNEEWS_PRICE_UPDATE, async (message) => {
  const correlationId = message.correlationId;

  try {
    logger.debug('Price update requested', { correlationId });

    // Check market hours
    if (!isMarketHours()) {
      const now = new Date();
      logger.info('Skipping price update (market closed)', {
        correlationId,
        hour: now.getHours(),
        day: now.getDay()
      });

      return createResponse(message, MESSAGE_TYPES.XNEEWS_PRICES_UPDATED, {
        success: true,
        skipped: true,
        reason: 'market_closed'
      });
    }

    // Fetch prices from Supabase with retry
    const result = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .select('symbol, price, ediff')
          .not('price', 'is', null);

        if (response.error) throw response.error;
        return response;
      },
      {
        operationName: 'watchlist.fetch-prices',
        maxRetries: 2,
        correlationId
      }
    );

    const items = result.data || [];

    logger.info('Price update successful', {
      correlationId,
      itemsCount: items.length,
      sampleSymbols: items.slice(0, 3).map(i => i.symbol).join(', ')
    });

    // Broadcast to UI via chrome.runtime.sendMessage
    // Note: Message sent to ALL listening contexts (tabs with WatchlistPage open)
    try {
      chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.XNEEWS_PRICES_UPDATED,
        correlationId,
        timestamp: Date.now(),
        items // Direct property for UI consumption
      });

      logger.debug('Price update broadcast sent', { correlationId });
    } catch (broadcastError) {
      // Expected if no UI is listening - not a critical error
      logger.debug('No UI listening for price updates (sidepanel may be closed)', {
        correlationId
      });
    }

    // Return success response
    return createResponse(message, MESSAGE_TYPES.XNEEWS_PRICES_UPDATED, {
      success: true,
      itemsCount: items.length,
      items
    });

  } catch (error) {
    logger.error('Price update failed', {
      correlationId,
      error: error.message,
      stack: error.stack
    });

    // Classify error type
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return createErrorResponse(
        message,
        'TIMEOUT',
        'Hết thời gian chờ. Vui lòng thử lại.'
      );
    }

    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      return createErrorResponse(
        message,
        'NETWORK_ERROR',
        'Không thể kết nối. Vui lòng kiểm tra mạng.'
      );
    }

    // Generic error
    return createErrorResponse(
      message,
      'API_ERROR',
      'Lỗi khi cập nhật giá. Vui lòng thử lại.'
    );
  }
});

logger.info('Watchlist Price Update handler registered');
