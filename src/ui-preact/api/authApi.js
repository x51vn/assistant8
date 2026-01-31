/**
 * Auth API - Background communication layer
 * X51LABS-151: User Section authentication integration
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Check authentication status
 * @returns {Promise<{authenticated: boolean, user: Object|null, error?: string}>}
 */
export async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    const loadError = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || loadError) {
      console.error('[AuthAPI] Auth check failed:', loadError);
      return { authenticated: false, user: null, error: loadError };
    }

    // ✅ FIX: Backend returns { authenticated, user }, use directly
    return {
      authenticated: response.authenticated || false,
      user: response.user || null
    };
  } catch (error) {
    console.error('[AuthAPI] Failed to check auth status:', error);
    return { authenticated: false, user: null, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{authenticated: boolean, user: Object|null, error?: string}>}
 */
export async function login(email, password) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { email, password }
    });

    const loginError = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || loginError) {
      console.error('[AuthAPI] Login failed:', loginError);
      return { authenticated: false, user: null, error: loginError };
    }

    // ✅ FIX: Backend returns { user }, need to derive authenticated
    const user = response.user || null;
    const authenticated = !!user;

    return {
      authenticated,
      user
    };
  } catch (error) {
    console.error('[AuthAPI] Login request failed:', error);
    return { authenticated: false, user: null, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

/**
 * Logout user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logout() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    const logoutError = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || logoutError) {
      console.error('[AuthAPI] Logout failed:', logoutError);
      return { success: false, error: logoutError || 'Đăng xuất thất bại' };
    }

    return { success: true };
  } catch (error) {
    console.error('[AuthAPI] Logout request failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

/**
 * Listen for authentication state changes from background
 * @param {Function} callback - Callback function receiving auth state updates
 * @returns {Function} Cleanup function to remove listener
 */
export function listenAuthStateChanges(callback) {
  const handleAuthChange = (message) => {
    if (message?.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
      const user = message.data?.user || null;
      const authenticated = !!user;
      callback({ authenticated, user });
    }
  };

  chrome.runtime.onMessage.addListener(handleAuthChange);

  // Return cleanup function
  return () => {
    chrome.runtime.onMessage.removeListener(handleAuthChange);
  };
}
