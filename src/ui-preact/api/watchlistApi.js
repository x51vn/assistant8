/**
 * watchlistApi.js - Watchlist API layer
 * Routes watchlist operations to Supabase backend via background handlers
 *
 * Ticket: XST-742
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from './runtimeGateway.js';

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
    const response = await sendRuntimeMessage(MESSAGE_TYPES.XNEEWS_WATCHLIST_GET, {
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

    const response = await sendRuntimeMessage(MESSAGE_TYPES.XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT, {
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
    const response = await sendRuntimeMessage(MESSAGE_TYPES.SUPABASE_AUTH_CHECK, { data: {} });

    return response.authenticated === true;
  } catch (error) {
    console.error('[WatchlistAPI] Failed to check auth:', error);
    return false;
  }
}

/**
 * Enqueue a watchlist item for AI enrichment via background queue
 * Returns immediately with queue position — does NOT block until ChatGPT responds.
 * Background will process the job and emit WATCHLIST_AI_ENRICH_DONE when complete.
 *
 * @param {string} symbol - Stock symbol to enrich
 * @returns {Promise<{success: boolean, correlationId?: string, position?: number, duplicate?: boolean, error?: Object}>}
 */
export async function enrichWatchlistItem(symbol) {
  try {
    if (!symbol) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await sendRuntimeMessage(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RUN, {
      data: { symbol }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Enrichment enqueue failed:', error);
      return { success: false, error };
    }

    return {
      success: response.success === true,
      correlationId: response.correlationId || null,
      position: response.position || 0,
      duplicate: response.duplicate || false,
      message: response.message || 'Đã thêm vào hàng đợi đánh giá'
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to enqueue enrichment:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể gửi yêu cầu đánh giá. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Enqueue a batch of watchlist items for AI enrichment.
 * Background splits into chunks of max 10, each chunk → ONE LLM prompt.
 * Returns immediately with batch info — processing happens async.
 *
 * @param {string[]} symbols - Array of stock symbols to enrich
 * @returns {Promise<{success: boolean, totalSymbols?: number, batches?: number, jobs?: Array, error?: Object}>}
 */
export async function enrichWatchlistBatch(symbols) {
  try {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Danh sách mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await sendRuntimeMessage(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_BATCH_RUN, {
      data: { symbols }
    });

    const error = extractError(response);
    if (error) {
      console.error('[WatchlistAPI] Batch enrichment enqueue failed:', error);
      return { success: false, error };
    }

    return {
      success: response.success === true,
      totalSymbols: response.totalSymbols || 0,
      batches: response.batches || 0,
      jobs: response.jobs || [],
      message: response.message || 'Đã thêm vào hàng đợi đánh giá batch'
    };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to enqueue batch enrichment:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể gửi yêu cầu đánh giá batch. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Cancel a pending enrichment job
 * @param {string} correlationId - Job correlationId to cancel
 * @returns {Promise<{success: boolean, error?: Object}>}
 */
export async function cancelEnrichment(correlationId) {
  try {
    const response = await sendRuntimeMessage(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCEL, {
      data: { correlationId }
    });

    const error = extractError(response);
    if (error) {
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('[WatchlistAPI] Failed to cancel enrichment:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể hủy tác vụ đánh giá.'
      }
    };
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

    const response = await sendRuntimeMessage(MESSAGE_TYPES.XNEEWS_WATCHLIST_CREATE, {
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

    const response = await sendRuntimeMessage(MESSAGE_TYPES.XNEEWS_WATCHLIST_UPDATE, {
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

    const response = await sendRuntimeMessage(MESSAGE_TYPES.XNEEWS_WATCHLIST_DELETE, {
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
