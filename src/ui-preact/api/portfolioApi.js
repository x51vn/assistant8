/**
 * Portfolio API - Background communication layer
 * Routes portfolio operations to background handlers
 * 
 * X51LABS-153: Setup - Create portfolioState signals + portfolioApi message router
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
 * Fetch all portfolio items for current user
 * @returns {Promise<{items: Array, error?: {code, message}}>}
 */
export async function fetchPortfolio() {
  try {
    const response = await sendRuntimeMessage(MESSAGE_TYPES.PORTFOLIO_GET);

    const error = extractError(response);
    if (error) {
      console.error('[PortfolioAPI] Fetch failed:', error);
      return { items: [], error };
    }

    return {
      items: response.items || [],
      error: null
    };
  } catch (error) {
    console.error('[PortfolioAPI] Failed to fetch portfolio:', error);
    return {
      items: [],
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Add new stock to portfolio
 * @param {Object} data - { symbol: string, quantity: number, avgPrice: number }
 * @returns {Promise<{item?: Object, error?: {code, message}}>}
 */
export async function addPortfolio(data) {
  try {
    if (!data.symbol) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Mã cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await sendRuntimeMessage(MESSAGE_TYPES.PORTFOLIO_ADD, { data });

    const error = extractError(response);
    if (error) {
      console.error('[PortfolioAPI] Add failed:', error);
      return { error };
    }

    return {
      item: response.item || response,
      error: null
    };
  } catch (error) {
    console.error('[PortfolioAPI] Failed to add portfolio item:', error);
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể thêm cổ phiếu. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Update existing stock in portfolio
 * @param {string} id - Portfolio item ID (UUID)
 * @param {Object} updates - Fields to update (symbol, quantity, avg_price, etc.)
 * @returns {Promise<{item?: Object, error?: {code, message}}>}
 */
export async function updatePortfolio(id, updates) {
  try {
    if (!id) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ID cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await sendRuntimeMessage(MESSAGE_TYPES.PORTFOLIO_UPDATE, {
      data: { id, updates },
    });

    const error = extractError(response);
    if (error) {
      console.error('[PortfolioAPI] Update failed:', error);
      return { error };
    }

    return {
      item: response.item || response,
      error: null
    };
  } catch (error) {
    console.error('[PortfolioAPI] Failed to update portfolio item:', error);
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể cập nhật cổ phiếu. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Delete stock from portfolio
 * @param {string} id - Portfolio item ID (UUID)
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function deletePortfolio(id) {
  try {
    if (!id) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ID cổ phiếu là bắt buộc'
        }
      };
    }

    const response = await sendRuntimeMessage(MESSAGE_TYPES.PORTFOLIO_REMOVE, {
      data: { id },
    });

    const error = extractError(response);
    if (error) {
      console.error('[PortfolioAPI] Delete failed:', error);
      return { success: false, error };
    }

    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('[PortfolioAPI] Failed to delete portfolio item:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể xóa cổ phiếu. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Update prices for all stocks (bulk operation)
 * Calls background handler to fetch prices from SSI API and update portfolio
 * @returns {Promise<{updated: number, prices?: Object, error?: {code, message}}>}
 */
export async function updatePrices() {
  try {
    const response = await sendRuntimeMessage(MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES);

    const error = extractError(response);
    if (error) {
      console.error('[PortfolioAPI] Update prices failed:', error);
      return { updated: 0, error };
    }

    return {
      updated: response.updated || 0,
      prices: response.prices || {},
      error: null
    };
  } catch (error) {
    console.error('[PortfolioAPI] Failed to update prices:', error);
    return {
      updated: 0,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể cập nhật giá. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Helper: Check if API response has an error
 * @param {Object} response
 * @returns {boolean}
 */
export function hasError(response) {
  return !!extractError(response);
}
