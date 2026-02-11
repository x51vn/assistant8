/**
 * watchlistApi.js - Watchlist API layer
 * Routes watchlist operations to X-Neews background handlers
 * 
 * Ticket: XST-742
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Map background response error to user-friendly message
 * Supports both error formats:
 * - New format: { errorCode: 'ERROR_CODE', errorMessage: 'message' }
 * - Vanilla format: { error: { message: 'message' } }
 * 
 * @param {Object} response - Response from background handler
 * @returns {Object|null} - Error object with code + message, or null if no error
 */
function extractError(response) {
  if (response.errorCode) {
    return {
      code: response.errorCode,
      message: response.errorMessage || 'Có lỗi xảy ra'
    };
  }
  
  if (response.error) {
    if (typeof response.error === 'string') {
      return {
        code: 'ERROR',
        message: response.error
      };
    }
    if (response.error.message) {
      return {
        code: response.error.code || 'ERROR',
        message: response.error.message
      };
    }
  }
  
  if (response.errorMessage) {
    return {
      code: 'ERROR',
      message: response.errorMessage
    };
  }
  
  return null;
}

/**
 * Fetch watchlist items with pagination
 * @param {number} page - Page number (1-based), default 1
 * @param {number} size - Page size, default 20
 * @returns {Promise<{items: Array, total: number, page: number, size: number, totalPages: number, error?: Object}>}
 */
export async function fetchWatchlist(page = 1, size = 20) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.XNEEWS_WATCHLIST_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        page,
        size
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Fetch failed:', error);
      return {
        items: [],
        total: 0,
        page: 1,
        size: 20,
        totalPages: 0,
        error
      };
    }

    return {
      items: response.items || [],
      total: response.total || 0,
      page: response.page || page,
      size: response.size || size,
      totalPages: response.totalPages || 0,
      error: null
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to fetch watchlist:', error);
    return {
      items: [],
      total: 0,
      page: 1,
      size: 20,
      totalPages: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Toggle highlight status for a watchlist item
 * @param {string} symbol - Stock symbol
 * @returns {Promise<{item?: Object, error?: Object}>}
 */
export async function toggleHighlight(symbol) {
  try {
    if (!symbol) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Toggle highlight failed:', error);
      return { error };
    }

    return {
      item: response.item || null,
      error: null
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to toggle highlight:', error);
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể thay đổi trạng thái highlight. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * checkXneewsAuth is deprecated - use Supabase auth instead
 * Auth state is managed via supabaseAuth handler
 */
export async function checkSupabaseAuth() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: 'SUPABASE_AUTH_CHECK',
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {}
    });

    return response.authenticated === true;
  } catch (error) {
    console.error('[WatchlistAPI] Failed to check auth:', error);
    return false;
  }
}

/**
 * Add new watchlist item
 * @param {Object} data - Watchlist item data
 * @param {string} data.symbol - Stock symbol (required)
 * @param {string} [data.investment_thesis] - Investment thesis
 * @param {string} [data.risk] - Risk level (Thấp/Trung bình/Cao)
 * @param {number} [data.entry] - Entry price
 * @param {number} [data.target] - Target price
 * @param {number} [data.stoploss] - Stop loss price
 * @param {string} [data.notes] - Additional notes
 * @returns {Promise<{item?: Object, error?: Object}>}
 */
export async function addWatchlistItem(data) {
  try {
    if (!data.symbol) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.XNEEWS_WATCHLIST_CREATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol: data.symbol,
        investment_thesis: data.investment_thesis || data.investmentThesis,
        risk: data.risk,
        entry: data.entry,
        target: data.target,
        stoploss: data.stoploss,
        notes: data.notes
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Add failed:', error);
      return { error };
    }

    return {
      item: response.item || null,
      error: null
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to add watchlist item:', error);
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể thêm mục watchlist. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Update existing watchlist item
 * @param {string} symbol - Stock symbol
 * @param {Object} updates - Fields to update
 * @returns {Promise<{item?: Object, error?: Object}>}
 */
export async function updateWatchlistItem(symbol, updates) {
  try {
    if (!symbol) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.XNEEWS_WATCHLIST_UPDATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol,
        updates: {
          investment_thesis: updates.investment_thesis || updates.investmentThesis,
          risk: updates.risk,
          entry: updates.entry,
          target: updates.target,
          stoploss: updates.stoploss,
          notes: updates.notes
        }
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Update failed:', error);
      return { error };
    }

    return {
      item: response.item || null,
      error: null
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to update watchlist item:', error);
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể cập nhật mục watchlist. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Delete watchlist item
 * @param {string} symbol - Stock symbol
 * @returns {Promise<{symbol?: string, error?: Object}>}
 */
export async function deleteWatchlistItem(symbol) {
  try {
    if (!symbol) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.XNEEWS_WATCHLIST_DELETE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        symbol
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Delete failed:', error);
      return { error };
    }

    return {
      symbol: response.symbol || symbol,
      error: null
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to delete watchlist item:', error);
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể xóa mục watchlist. Vui lòng thử lại.'
      }
    };
  }
}
