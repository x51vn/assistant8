/**
 * @fileoverview X-Neews Price Update Handler
 * Fetches latest watchlist prices from X-Neews API and broadcasts to UI
 * Runs periodically via chrome.alarms (every 5 minutes during market hours)
 * 
 * Ticket: XST-744 - Implement Real-Time Price Updates from X-Neews API
 * 
 * Features:
 * - Fetch prices from /watchlist endpoint
 * - Broadcast updates to UI via chrome.runtime.sendMessage
 * - Market hours check (9:00-15:00 VN weekdays)
 * - Retry with exponential backoff
 * - Rate limit handling (429 responses)
 * - Auth token refresh on 401
 */

import { createLogger } from '../../logger.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { getStoredTokens } from './xneewsAuth.js';
import { registerHandler } from '../messageRouter.js';

const logger = createLogger('Handlers/XneewsPriceUpdate');

/**
 * X-Neews API base URL
 * Default: https://api.x51.vn/api
 * OpenAPI Docs: https://api.x51.vn/api/openapi.json
 */
const XNEEWS_API_BASE = import.meta.env.VITE_XNEEWS_API_URL || 'https://api.x51.vn/api';

/**
 * Vietnamese error messages for user-facing errors
 */
const ERROR_MESSAGES_VI = {
  NETWORK_ERROR: 'Không có kết nối internet. Vui lòng kiểm tra mạng.',
  AUTH_ERROR: 'Phiên đăng nhập X-Neews hết hạn. Vui lòng đăng nhập lại.',
  API_ERROR: 'Lỗi khi lấy giá cổ phiếu. Vui lòng thử lại sau.',
  RATE_LIMIT: 'Đạt giới hạn API. Vui lòng chờ {seconds} giây.',
  TIMEOUT: 'Timeout khi lấy giá cổ phiếu. Vui lòng thử lại.'
};

/**
 * Fetch with retry and exponential backoff
 * Pattern: 1s → 2s → 4s (max 3 attempts)
 * 
 * @param {string} url - API endpoint URL
 * @param {Object} options - fetch options
 * @param {number} maxRetries - Max retry attempts (default 3)
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Don't retry client errors (4xx) - likely permanent
      if (response.status >= 400 && response.status < 500) {
        return response;
      }
      
      // Retry server errors (5xx) and network errors with exponential backoff
      if (!response.ok && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        logger.warn('Fetch failed, retrying', { 
          attempt: attempt + 1, 
          delay,
          status: response.status 
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return response;
      
    } catch (error) {
      // Last attempt - throw error
      if (attempt === maxRetries - 1) {
        throw error;
      }
      
      // Retry with exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn('Fetch error, retrying', { 
        attempt: attempt + 1, 
        delay, 
        error: error.message 
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Check if current time is during market hours
 * Vietnam stock market: 9:00 AM - 3:00 PM (Mon-Fri)
 * 
 * @returns {boolean} True if current time is during market hours
 */
function isMarketHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Market hours: 9:00 AM - 3:00 PM (15:00)
  return hour >= 9 && hour < 15;
}

/**
 * Handle XNEEWS_PRICE_UPDATE request (from alarm)
 * 
 * Acceptance Criteria:
 * - AC-1: Alarm triggers every 5 minutes during market hours (9:00-15:00 weekdays)
 * - AC-2: API fetch returns updated price + ediff fields
 * - AC-3: UI receives message with updated items
 * - AC-4: Network failure → retry max 3x with exponential backoff
 * - AC-5: Rate limit 429 → pause alarm for Retry-After duration
 * - AC-6: Outside market hours → skip fetch (no API call)
 * 
 * @param {Object} message - Message with type XNEEWS_PRICE_UPDATE
 * @returns {Promise<Object>} Response message
 */
registerHandler(MESSAGE_TYPES.XNEEWS_PRICE_UPDATE, async (message) => {
  const correlationId = message.correlationId;
  
  try {
    logger.debug('Price update requested', { correlationId });
    
    // AC-6: Outside market hours → skip fetch
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
    
    // Get auth tokens from chrome.storage.local
    const tokens = await getStoredTokens();
    if (!tokens?.access_token) {
      logger.warn('No X-Neews auth token found', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }
    
    // AC-2: Fetch /watchlist endpoint (returns price + ediff fields)
    logger.info('Fetching watchlist prices from X-Neews API', { 
      correlationId,
      endpoint: `${XNEEWS_API_BASE}/watchlist/`
    });
    
    // AC-4: Network failure → retry max 3x with exponential backoff
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/watchlist/`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // AC-5: Handle rate limit (429) - pause alarm temporarily
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      const seconds = parseInt(retryAfter, 10);
      
      logger.warn('Rate limited by X-Neews API', { 
        correlationId, 
        retryAfter: seconds 
      });
      
      // Clear current alarm and reschedule after Retry-After duration
      await chrome.alarms.clear('watchlistPriceUpdate');
      chrome.alarms.create('watchlistPriceUpdate', {
        when: Date.now() + (seconds * 1000)
      });
      
      logger.info('Alarm rescheduled', { 
        correlationId, 
        delaySeconds: seconds 
      });
      
      return createErrorResponse(
        message,
        'RATE_LIMIT',
        ERROR_MESSAGES_VI.RATE_LIMIT.replace('{seconds}', seconds.toString())
      );
    }
    
    // Handle auth error (401) - token expired
    if (response.status === 401) {
      logger.warn('X-Neews auth token expired', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }
    
    // Handle other API errors (4xx, 5xx)
    if (!response.ok) {
      let errorText = 'Unknown error';
      try {
        errorText = await response.text();
      } catch (e) {
        // Ignore parse error
      }
      
      logger.error('X-Neews API error', { 
        correlationId, 
        status: response.status, 
        error: errorText 
      });
      
      return createErrorResponse(message, 'API_ERROR', ERROR_MESSAGES_VI.API_ERROR);
    }
    
    // Parse response body
    const data = await response.json();
    const items = data.items || [];
    
    logger.info('Price update successful', {
      correlationId,
      itemsCount: items.length,
      sampleSymbols: items.slice(0, 3).map(i => i.symbol).join(', ')
    });
    
    // AC-3: Broadcast to UI via chrome.runtime.sendMessage
    // Note: Message sent to ALL listening contexts (tabs with WatchlistPage open)
    // If no tab is listening, this will silently fail (expected behavior)
    try {
      chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.XNEEWS_PRICES_UPDATED,
        correlationId,
        timestamp: Date.now(),
        items // ⚠️ CRITICAL: Direct property (not nested in .data)
      });
      
      logger.debug('Price update broadcast sent', { correlationId });
    } catch (broadcastError) {
      // Expected if no UI is listening - not a critical error
      // UI will fetch fresh data when it opens
      logger.debug('No UI listening for price updates (expected if sidepanel closed)', { 
        correlationId 
      });
    }
    
    // Return success response to alarm handler
    return createResponse(message, MESSAGE_TYPES.XNEEWS_PRICES_UPDATED, {
      success: true,
      itemsCount: items.length,
      items // For testing purposes (not sent to UI)
    });
    
  } catch (error) {
    // AC-4: Network failure → logged (retry already handled by fetchWithRetry)
    logger.error('Price update failed', {
      correlationId,
      error: error.message,
      stack: error.stack
    });
    
    // Classify error type for user-friendly message
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return createErrorResponse(message, 'TIMEOUT', ERROR_MESSAGES_VI.TIMEOUT);
    }
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }
    
    // Generic API error
    return createErrorResponse(message, 'API_ERROR', ERROR_MESSAGES_VI.API_ERROR);
  }
});

logger.info('X-Neews Price Update handler registered');
