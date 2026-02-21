/**
 * Auth API - Background communication layer
 * X51LABS-151: User Section authentication integration
 * XST-754: Change Password
 * XST-751: Password Reset
 * XST-752: Registration & Email Verification
 * XST-753: Google OAuth
 * XST-755: Account Deletion
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
    // Handle normal auth state changes (login/logout)
    if (message?.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
      const user = message.data?.user || null;
      const authenticated = !!user;
      callback({ authenticated, user });
    }
    
    // ✅ FIX: Handle SESSION_EXPIRED from sessionManager
    // This fires when token expires and cannot be refreshed
    if (message?.type === MESSAGE_TYPES.SESSION_EXPIRED) {
      console.log('[AuthAPI] Session expired - logging out user');
      callback({ authenticated: false, user: null, sessionExpired: true });
    }
  };

  chrome.runtime.onMessage.addListener(handleAuthChange);

  // Return cleanup function
  return () => {
    chrome.runtime.onMessage.removeListener(handleAuthChange);
  };
}

// ============================================================================
// Change Password (XST-754)
// ============================================================================

/**
 * Change password for currently authenticated user
 * @param {string} currentPassword - Current password for verification
 * @param {string} newPassword - New password (8+ chars, upper, lower, digit, special)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function changePassword(currentPassword, newPassword) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_CHANGE_PASSWORD,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { currentPassword, newPassword }
    });

    const error = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || error) {
      console.error('[AuthAPI] Change password failed:', error);
      return { success: false, error: error || 'Đổi mật khẩu thất bại' };
    }

    return { success: true };
  } catch (error) {
    console.error('[AuthAPI] Change password request failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

// ============================================================================
// Password Reset (XST-751)
// ============================================================================

/**
 * Request password reset email
 * @param {string} email - Email address to send reset link
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function resetPasswordRequest(email) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_RESET_PASSWORD_REQUEST,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { email }
    });

    const error = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || error) {
      console.error('[AuthAPI] Reset password request failed:', error);
      return { success: false, error: error || 'Gửi email thất bại' };
    }

    return { success: true, message: response.message };
  } catch (error) {
    console.error('[AuthAPI] Reset password request failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

// ============================================================================
// Registration (XST-752)
// ============================================================================

/**
 * Register new user account
 * @param {string} email - Email address
 * @param {string} password - Password (8+ chars with complexity requirements)
 * @param {string} [name] - Optional display name
 * @returns {Promise<{success: boolean, user?: Object, needsEmailVerification?: boolean, error?: string}>}
 */
export async function register(email, password, name) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_REGISTER,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { email, password, name }
    });

    const error = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || error) {
      console.error('[AuthAPI] Registration failed:', error);
      return { success: false, error: error || 'Đăng ký thất bại' };
    }

    return {
      success: true,
      user: response.user || null,
      needsEmailVerification: response.needsEmailVerification || false
    };
  } catch (error) {
    console.error('[AuthAPI] Registration request failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

/**
 * Resend email confirmation
 * @param {string} email - Email to resend confirmation to
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function resendConfirmation(email) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_RESEND_CONFIRMATION,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { email }
    });

    const error = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || error) {
      console.error('[AuthAPI] Resend confirmation failed:', error);
      return { success: false, error: error || 'Gửi lại email thất bại' };
    }

    return { success: true, message: response.message };
  } catch (error) {
    console.error('[AuthAPI] Resend confirmation request failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

// ============================================================================
// Google OAuth (XST-753)
// ============================================================================

/**
 * Sign in with Google OAuth
 * @returns {Promise<{authenticated: boolean, user?: Object, error?: string}>}
 */
export async function signInWithGoogle() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_GOOGLE_LOGIN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    const error = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || error) {
      console.error('[AuthAPI] Google login failed:', error);
      return { authenticated: false, user: null, error: error || 'Đăng nhập Google thất bại' };
    }

    const user = response.user || null;
    return { authenticated: !!user, user };
  } catch (error) {
    console.error('[AuthAPI] Google login request failed:', error);
    return { authenticated: false, user: null, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

// ============================================================================
// Account Deletion (XST-755)
// ============================================================================

/**
 * Request account deletion with confirmation
 * @param {string} confirmText - Must be exactly "XÓA TÀI KHOẢN"
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAccount(confirmText) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.ACCOUNT_DELETE_REQUEST,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { confirmText }
    });

    const error = response.error?.message || response.errorMessage;
    if (response.error || response.errorCode || error) {
      console.error('[AuthAPI] Account deletion failed:', error);
      return { success: false, error: error || 'Xóa tài khoản thất bại' };
    }

    return { success: true };
  } catch (error) {
    console.error('[AuthAPI] Account deletion request failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}
