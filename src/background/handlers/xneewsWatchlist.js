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
import { XNEEWS_API_BASE, XNEEWS_ERROR_MESSAGES, mapErrorToVietnamese } from '../../shared/xneewsConfig.js';
import { xneewsFetch, getStoredTokens } from '../utils/xneewsFetch.js';

const logger = createLogger('Handlers/XneewsWatchlist');

// Alias for conciseness
const ERROR_MESSAGES_VI = XNEEWS_ERROR_MESSAGES;

// getStoredTokens, fetchWithRetry, mapErrorToVietnamese — imported from shared utils

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

    // Build URL with query params
    const url = new URL(`${XNEEWS_API_BASE}/watchlist/`);
    url.searchParams.set('page', normalizedPage.toString());
    url.searchParams.set('size', normalizedSize.toString());

    // Call X-Neews watchlist endpoint (auto-refresh on 401)
    const response = await xneewsFetch(url.toString(), {
      method: 'GET'
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

    // Call X-Neews create endpoint (auto-refresh on 401)
    const response = await xneewsFetch(`${XNEEWS_API_BASE}/watchlist/`, {
      method: 'POST',
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

    // Build request body - support both camelCase and snake_case
    const requestBody = {};
    if (updates.investmentThesis !== undefined) requestBody.investment_thesis = updates.investmentThesis;
    if (updates.investment_thesis !== undefined) requestBody.investment_thesis = updates.investment_thesis;
    if (updates.risk !== undefined) requestBody.risk = updates.risk;
    if (updates.entry !== undefined && updates.entry !== null) requestBody.entry = Number(updates.entry);
    if (updates.target !== undefined && updates.target !== null) requestBody.target = Number(updates.target);
    if (updates.stoploss !== undefined && updates.stoploss !== null) requestBody.stoploss = Number(updates.stoploss);
    if (updates.notes !== undefined) requestBody.notes = updates.notes;
    if (updates.highlighted !== undefined) requestBody.highlighted = Boolean(updates.highlighted);

    // Call X-Neews update endpoint (auto-refresh on 401)
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await xneewsFetch(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}`, {
      method: 'PUT',
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

    // Call X-Neews delete endpoint (auto-refresh on 401)
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await xneewsFetch(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}`, {
      method: 'DELETE'
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

    // Call X-Neews toggle-highlight endpoint (auto-refresh on 401)
    const symbolParam = encodeURIComponent(symbol.trim().toUpperCase());
    const response = await xneewsFetch(`${XNEEWS_API_BASE}/watchlist/symbol/${symbolParam}/toggle-highlight`, {
      method: 'POST'
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
