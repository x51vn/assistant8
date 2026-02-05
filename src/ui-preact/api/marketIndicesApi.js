/**
 * Market Indices API - Background communication layer
 * Routes market indices operations to background handlers
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Map background response error to user-friendly message
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
 * Fetch current market indices (VNI, VN30, HNX, UPCOM)
 * @returns {Promise<{indices: Array, error?: {code, message}}>}
 */
export async function fetchMarketIndices() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.MARKET_INDICES_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    const error = extractError(response);
    if (error) {
      console.error('[MarketIndicesAPI] Fetch failed:', error);
      return { indices: [], error };
    }

    return {
      indices: response.indices || [],
      error: null
    };
  } catch (error) {
    console.error('[MarketIndicesAPI] Failed to fetch indices:', error);
    return {
      indices: [],
      error: {
        code: 'NETWORK_ERROR',
        message: 'Unable to fetch market indices. Please check your internet connection.'
      }
    };
  }
}
