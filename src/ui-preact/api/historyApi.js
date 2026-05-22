/**
 * History API - Background communication layer for chat history
 * Routes history operations to background handlers
 * 
 * X51LABS-154: History Page Implementation
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from './runtimeGateway.js';

/**
 * Map background response error to user-friendly message
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
      return { code: 'ERROR', message: response.error };
    }
    if (response.error.message) {
      return { code: response.error.code || 'ERROR', message: response.error.message };
    }
  }
  
  return null;
}

/**
 * Fetch all chat history items for current user
 * @param {number} limit - Maximum items to fetch (default: 50)
 * @returns {Promise<{items: Array, error?: {code, message}}>}
 */
export async function fetchHistory(limit = 50) {
  try {
    const response = await sendRuntimeMessage(MESSAGE_TYPES.HISTORY_GET_ALL, {
      data: { limit }
    });

    const error = extractError(response);
    if (error) {
      console.error('[HistoryAPI] Fetch failed:', error);
      return { items: [], error };
    }

    // Response format: { history: [...] } at top-level (not nested)
    return {
      items: response.history || [],
      error: null
    };
  } catch (error) {
    console.error('[HistoryAPI] Failed to fetch history:', error);
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
 * Delete history item by ID
 * @param {string} id - History item ID (UUID)
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function deleteHistory(id) {
  try {
    if (!id) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ID là bắt buộc'
        }
      };
    }

    const response = await sendRuntimeMessage(MESSAGE_TYPES.HISTORY_DELETE, {
      data: { id }
    });

    const error = extractError(response);
    if (error) {
      console.error('[HistoryAPI] Delete failed:', error);
      return { success: false, error };
    }

    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('[HistoryAPI] Failed to delete history item:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể xóa mục này. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Clear all history items
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function clearAllHistory() {
  try {
    const response = await sendRuntimeMessage(MESSAGE_TYPES.HISTORY_CLEAR);

    const error = extractError(response);
    if (error) {
      console.error('[HistoryAPI] Clear failed:', error);
      return { success: false, error };
    }

    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('[HistoryAPI] Failed to clear history:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể xóa lịch sử. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Open a chat in ChatGPT by URL
 * @param {string} chatUrl - ChatGPT URL to open
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function openChat(chatUrl) {
  try {
    if (!chatUrl) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL chat là bắt buộc'
        }
      };
    }

    // Open URL in new tab
    await chrome.tabs.create({ url: chatUrl, active: true });
    
    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error('[HistoryAPI] Failed to open chat:', error);
    return {
      success: false,
      error: {
        code: 'BROWSER_ERROR',
        message: 'Không thể mở chat. Vui lòng thử lại.'
      }
    };
  }
}
