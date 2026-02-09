/**
 * @fileoverview X-Neews Watchlist Handler
 * Manages watchlist CRUD operations via x-neews API
 * 
 * Architecture:
 * - Stateless handler pattern (Service Worker can terminate anytime)
 * - Uses X-Neews auth tokens from chrome.storage.local
 * - Background = Middleware: UI → Background → X-Neews API
 * 
 * API Reference: docs/AUTHENTICATION_AND_WATCHLIST_API.md (lines 250-600)
 * Ticket: XST-741
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/XneewsWatchlist');

/**
 * Configuration for X-Neews API
 * Base URL loaded from environment or settings
 * OpenAPI Docs: https://api.x51.vn/api/openapi.json
 */
const XNEEWS_API_BASE = import.meta.env.VITE_XNEEWS_API_URL || 'https://api.x51.vn/api';

/**
 * Chrome storage keys for X-Neews tokens
 * @see src/background/handlers/xneewsAuth.js
 */
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'xneews_access_token',
  REFRESH_TOKEN: 'xneews_refresh_token',
  USER_ID: 'xneews_user_id',
  USER_EMAIL: 'xneews_user_email'
};

/**
 * Vietnamese error messages for watchlist errors
 */
const ERROR_MESSAGES_VI = {
  NETWORK_ERROR: 'Không có kết nối internet. Vui lòng kiểm tra mạng.',
  API_ERROR: 'Lỗi kết nối API. Vui lòng thử lại.',
  AUTH_ERROR: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
  NOT_FOUND: 'Không tìm thấy mục watchlist.',
  INVALID_INPUT: 'Dữ liệu không hợp lệ.',
  SYMBOL_REQUIRED: 'Mã chứng khoán là bắt buộc.',
  CREATE_FAILED: 'Không thể tạo mục watchlist. Vui lòng thử lại.',
  UPDATE_FAILED: 'Không thể cập nhật mục watchlist. Vui lòng thử lại.',
  DELETE_FAILED: 'Không thể xóa mục watchlist. Vui lòng thử lại.',
  TOGGLE_FAILED: 'Không thể thay đổi trạng thái highlight. Vui lòng thử lại.',
  SERVER_ERROR: 'Lỗi máy chủ. Vui lòng thử lại sau.'
};

/**
 * Helper: Get X-Neews tokens from chrome.storage.local
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function getStoredTokens() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN
  ]);

  return {
    accessToken: result[STORAGE_KEYS.ACCESS_TOKEN] || null,
    refreshToken: result[STORAGE_KEYS.REFRESH_TOKEN] || null
  };
}

/**
 * Helper: Fetch with retry and exponential backoff
 * @param {string} url
 * @param {Object} options - fetch options
 * @param {number} maxRetries - default 3
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: 10000 // 10 second timeout
      });

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on network/server errors (5xx, timeout)
      if (!response.ok) {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // exponential backoff: 1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      return response;
    } catch (error) {
      // Network error - retry with backoff
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      logger.error('Fetch failed after retries', {
        url,
        error: error.message,
        attempts: maxRetries
      });

      throw error;
    }
  }
}

/**
 * Helper: Map API error to Vietnamese user-friendly message
 * @param {Response} response
 * @param {Object} data - Parsed JSON response
 * @returns {string} Vietnamese error message
 */
function mapErrorToVietnamese(response, data) {
  const status = response.status;
  const errorDetail = data?.detail || '';

  if (status === 401) {
    return ERROR_MESSAGES_VI.AUTH_ERROR;
  } else if (status === 404) {
    return ERROR_MESSAGES_VI.NOT_FOUND;
  } else if (status === 400 || status === 422) {
    return ERROR_MESSAGES_VI.INVALID_INPUT;
  } else if (status >= 500) {
    return ERROR_MESSAGES_VI.SERVER_ERROR;
  }

  return ERROR_MESSAGES_VI.API_ERROR;
}

/**
 * Handle XNEEWS_WATCHLIST_GET
 * Fetch all watchlist items with pagination
 * 
 * @param {Object} message - { page, size }
 * @returns {Object} Response with watchlist data
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_GET, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_GET', { correlationId });

  try {
    const { page = 1, size = 20 } = message.data || {};
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedSize = Math.min(100, Math.max(1, Number(size) || 20));

    // Get auth token
    const { accessToken } = await getStoredTokens();
    if (!accessToken) {
      logger.warn('Watchlist GET failed: no access token', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Build URL with query params
    const url = new URL(`${XNEEWS_API_BASE}/watchlist/`);
    url.searchParams.set('page', normalizedPage.toString());
    url.searchParams.set('size', normalizedSize.toString());

    // Call X-Neews watchlist endpoint
    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    // Handle errors
    if (!response.ok) {
      logger.error('Watchlist GET failed', {
        status: response.status,
        data,
        correlationId
      });

      const errorMsg = mapErrorToVietnamese(response, data);
      return createErrorResponse(message, 'API_ERROR', errorMsg);
    }

    // Success - return watchlist data
    logger.info('Watchlist GET successful', {
      total: data.total,
      page: data.page,
      size: data.size,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_DATA, {
      success: true,
      items: data.data || [],
      total: data.total || 0,
      page: data.page || page,
      size: data.size || size,
      totalPages: data.total_pages || 0
    });

  } catch (error) {
    logger.error('Watchlist GET exception', {
      error: error.message,
      correlationId
    });

    // Network error
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.API_ERROR);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_CREATE
 * Create or upsert watchlist item
 * 
 * @param {Object} message - { symbol, investment_thesis, risk, entry, target, stoploss, notes, highlighted }
 * @returns {Object} Response with created item
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_CREATE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_CREATE', { correlationId });

  try {
    const data = message.data || {};
    const {
      symbol,
      investmentThesis, investment_thesis,
      risk,
      entry,
      target,
      stoploss,
      notes,
      highlighted
    } = data;

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist CREATE failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    // Get auth token
    const { accessToken } = await getStoredTokens();
    if (!accessToken) {
      logger.warn('Watchlist CREATE failed: no access token', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Build request body - support both camelCase and snake_case
    const requestBody = {
      symbol: symbol.trim().toUpperCase()
    };

    // Optional fields
    const thesis = investmentThesis || investment_thesis;
    if (thesis) requestBody.investment_thesis = thesis;
    if (risk) requestBody.risk = risk;
    if (entry !== undefined && entry !== null) requestBody.entry = Number(entry);
    if (target !== undefined && target !== null) requestBody.target = Number(target);
    if (stoploss !== undefined && stoploss !== null) requestBody.stoploss = Number(stoploss);
    if (notes) requestBody.notes = notes;
    if (highlighted !== undefined) requestBody.highlighted = Boolean(highlighted);

    // Call X-Neews create endpoint
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/watchlist/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    // Handle errors
    if (!response.ok) {
      logger.error('Watchlist CREATE failed', {
        status: response.status,
        data: responseData,
        correlationId
      });

      const errorMsg = mapErrorToVietnamese(response, responseData);
      return createErrorResponse(message, 'API_ERROR', errorMsg);
    }

    // Success
    logger.info('Watchlist CREATE successful', {
      symbol: responseData.symbol,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_CREATED, {
      success: true,
      item: responseData
    });

  } catch (error) {
    logger.error('Watchlist CREATE exception', {
      error: error.message,
      correlationId
    });

    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.CREATE_FAILED);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_UPDATE
 * Update existing watchlist item by symbol
 * 
 * @param {Object} message - { symbol, updates: { investment_thesis, risk, entry, target, stoploss, notes, highlighted } }
 * @returns {Object} Response with updated item
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_UPDATE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_UPDATE', { correlationId });

  try {
    const { symbol, updates } = message.data || {};

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist UPDATE failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    if (!updates || typeof updates !== 'object') {
      logger.warn('Watchlist UPDATE failed: missing updates', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.INVALID_INPUT);
    }

    // Get auth token
    const { accessToken } = await getStoredTokens();
    if (!accessToken) {
      logger.warn('Watchlist UPDATE failed: no access token', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Build request body - support both camelCase and snake_case
    const requestBody = {};

    // Optional update fields
    if (updates.investmentThesis !== undefined) requestBody.investment_thesis = updates.investmentThesis;
    if (updates.investment_thesis !== undefined) requestBody.investment_thesis = updates.investment_thesis;
    if (updates.risk !== undefined) requestBody.risk = updates.risk;
    if (updates.entry !== undefined && updates.entry !== null) requestBody.entry = Number(updates.entry);
    if (updates.target !== undefined && updates.target !== null) requestBody.target = Number(updates.target);
    if (updates.stoploss !== undefined && updates.stoploss !== null) requestBody.stoploss = Number(updates.stoploss);
    if (updates.notes !== undefined) requestBody.notes = updates.notes;
    if (updates.highlighted !== undefined) requestBody.highlighted = Boolean(updates.highlighted);

    // Call X-Neews update endpoint
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    // Handle errors
    if (!response.ok) {
      logger.error('Watchlist UPDATE failed', {
        status: response.status,
        symbol,
        data: responseData,
        correlationId
      });

      const errorMsg = mapErrorToVietnamese(response, responseData);
      return createErrorResponse(message, 'API_ERROR', errorMsg);
    }

    // Success
    logger.info('Watchlist UPDATE successful', {
      symbol: responseData.symbol,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_UPDATED, {
      success: true,
      item: responseData
    });

  } catch (error) {
    logger.error('Watchlist UPDATE exception', {
      error: error.message,
      correlationId
    });

    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.UPDATE_FAILED);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_DELETE
 * Delete watchlist item by symbol
 * 
 * @param {Object} message - { symbol }
 * @returns {Object} Response with success status
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_DELETE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_DELETE', { correlationId });

  try {
    const { symbol } = message.data || {};

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist DELETE failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    // Get auth token
    const { accessToken } = await getStoredTokens();
    if (!accessToken) {
      logger.warn('Watchlist DELETE failed: no access token', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Call X-Neews delete endpoint
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const responseData = await response.json();

    // Handle errors
    if (!response.ok) {
      logger.error('Watchlist DELETE failed', {
        status: response.status,
        symbol,
        data: responseData,
        correlationId
      });

      const errorMsg = mapErrorToVietnamese(response, responseData);
      return createErrorResponse(message, 'API_ERROR', errorMsg);
    }

    // Success
    logger.info('Watchlist DELETE successful', {
      symbol,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_DELETED, {
      success: true,
      symbol: symbol.trim().toUpperCase(),
      message: responseData.message || `Đã xóa ${symbol} khỏi watchlist`
    });

  } catch (error) {
    logger.error('Watchlist DELETE exception', {
      error: error.message,
      correlationId
    });

    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.DELETE_FAILED);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT
 * Toggle highlight status for watchlist item
 * 
 * @param {Object} message - { symbol }
 * @returns {Object} Response with updated item
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT', { correlationId });

  try {
    const { symbol } = message.data || {};

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist TOGGLE_HIGHLIGHT failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    // Get auth token
    const { accessToken } = await getStoredTokens();
    if (!accessToken) {
      logger.warn('Watchlist TOGGLE_HIGHLIGHT failed: no access token', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Call X-Neews toggle-highlight endpoint
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}/toggle-highlight`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const responseData = await response.json();

    // Handle errors
    if (!response.ok) {
      logger.error('Watchlist TOGGLE_HIGHLIGHT failed', {
        status: response.status,
        symbol,
        data: responseData,
        correlationId
      });

      const errorMsg = mapErrorToVietnamese(response, responseData);
      return createErrorResponse(message, 'API_ERROR', errorMsg);
    }

    // Success
    logger.info('Watchlist TOGGLE_HIGHLIGHT successful', {
      symbol: responseData.symbol,
      highlighted: responseData.highlighted,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_HIGHLIGHT_TOGGLED, {
      success: true,
      item: responseData,
      highlighted: responseData.highlighted
    });

  } catch (error) {
    logger.error('Watchlist TOGGLE_HIGHLIGHT exception', {
      error: error.message,
      correlationId
    });

    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.TOGGLE_FAILED);
  }
});

logger.info('X-Neews Watchlist handler registered');
