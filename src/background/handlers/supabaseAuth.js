/**
 * @fileoverview Supabase Authentication Handlers
 * Orchestrates user authentication via Supabase Auth
 * Handlers are stateless - service worker can terminate anytime
 * 
 * Architecture: Background = Middleware for auth operations
 * - UI sends auth messages → Background calls Supabase → Returns result
 * - Session token persists via chromeStorageAdapter (chrome.storage.local)
 * - Broadcast auth state changes to all UI instances
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES, ERROR_MESSAGES_VN } from '../../shared/errorCodes.js';
import { flushChatHistoryOutbox } from '../services/chatHistoryService.js';
import { invalidatePromptCache } from './contextMenu.js';

const logger = createLogger('Handlers/SupabaseAuth');

/**
 * Handle SUPABASE_AUTH_LOGIN
 * Authenticate user with email/password
 * 
 * @param {Object} message - { email, password }
 * @returns {Object} Response with user data (no session token)
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_LOGIN', { correlationId });
  
  try {
    const { email, password } = message.data || {};
    
    // Validate input
    if (!email || typeof email !== 'string' || !email.trim()) {
      logger.warn('Login failed: missing email', { correlationId });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Email là bắt buộc',
        { field: 'email' }
      );
    }
    
    if (!password || typeof password !== 'string' || !password.trim()) {
      logger.warn('Login failed: missing password', { correlationId });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Mật khẩu là bắt buộc',
        { field: 'password' }
      );
    }
    
    // Call Supabase auth with retry
    const result = await supabaseWithRetry(
      async () => {
        const authResult = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        
        // Check for auth errors
        if (authResult.error) {
          throw authResult.error; // Will be caught and classified by retry logic
        }
        
        return authResult;
      },
      { 
        operationName: 'supabase.auth.signInWithPassword',
        maxRetries: 2, // Auth ops retry less
        correlationId
      }
    );
    
    // supabaseWithRetry throws on error, so if we get here, it's success
    const user = result.data.user;
    
    if (!user) {
      logger.error('Login successful but no user returned', { correlationId });
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_ERROR]
      );
    }
    logger.info('Login successful', { 
      correlationId, 
      userId: user.id,
      email: user.email 
    });
    
    // Invalidate context menu prompt cache so fresh prompts are loaded
    invalidatePromptCache();
    
    // ✅ FIX: No manual broadcast needed - Supabase onAuthStateChange 
    // listener (setupAuthStateListener) already broadcasts SIGNED_IN event
    // Duplicate broadcast causes UI to flash/blink twice on login
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_SUCCESS, {
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
    
  } catch (error) {
    logger.error('Login handler failed', { correlationId, error: error.message });
    
    // Check if it's already a formatted error response
    if (error.errorCode) {
      return error;
    }
    
    // Safely extract error message
    const errorMessage = error?.message || error?.error?.message || String(error) || 'Unknown error';
    
    // Map Supabase auth errors
    if (errorMessage.includes('Invalid login credentials')) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        'Email hoặc mật khẩu không đúng',
        { technicalError: errorMessage }
      );
    }
    
    if (errorMessage.includes('Invalid API key')) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Lỗi cấu hình Supabase. Vui lòng kiểm tra API key trong file .env',
        { 
          technicalError: errorMessage,
          hint: 'Get correct VITE_SUPABASE_ANON_KEY from https://app.supabase.com/project/_/settings/api'
        }
      );
    }
    
    if (errorMessage.includes('Email not confirmed')) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_EMAIL_NOT_CONFIRMED,
        'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.',
        { technicalError: errorMessage }
      );
    }
    
    // Network/unexpected errors
    if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        ERROR_MESSAGES_VN[ERROR_CODES.NETWORK_ERROR],
        { technicalError: errorMessage }
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      ERROR_MESSAGES_VN[ERROR_CODES.AUTH_ERROR],
      { technicalError: errorMessage }
    );
  }
});

/**
 * Handle SUPABASE_AUTH_LOGOUT
 * Sign out current user
 * 
 * @param {Object} message - No payload required
 * @returns {Object} Response with success flag
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_LOGOUT', { correlationId });
  
  try {
    // Call Supabase signOut
    await supabaseWithRetry(
      async () => {
        const result = await supabase.auth.signOut();
        if (result.error) throw result.error;
        return result;
      },
      {
        operationName: 'supabase.auth.signOut',
        maxRetries: 1, // Don't retry logout much
        correlationId
      }
    );
    
    // If we get here, logout succeeded
    
    logger.info('Logout successful', { correlationId });
    
    // Invalidate context menu prompt cache
    invalidatePromptCache();
    
    // ✅ FIX: No manual broadcast needed - Supabase onAuthStateChange 
    // listener (setupAuthStateListener) already broadcasts SIGNED_OUT event
    // Duplicate broadcast causes UI to flash/blink twice on logout
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_LOGGED_OUT, {
      success: true
    });
    
  } catch (error) {
    logger.error('Logout handler failed', { correlationId, error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      'Không thể đăng xuất. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle SUPABASE_AUTH_CHECK
 * Check current authentication status
 * 
 * @param {Object} message - No payload required
 * @returns {Object} Response with { authenticated, user }
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_CHECK, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_CHECK', { correlationId });
  
  try {
    // Get current user session
    const result = await supabaseWithRetry(
      async () => {
        const authResult = await supabase.auth.getUser();
        // Note: getUser() returns { data: { user }, error }
        // If error, throw it so retry logic handles it
        if (authResult.error) {
          throw authResult.error;
        }
        return authResult;
      },
      {
        operationName: 'supabase.auth.getUser',
        maxRetries: 2,
        correlationId
      }
    );
    
    // Check if user exists
    const user = result.data.user;
    if (!user) {
      logger.info('Auth check: no user', { correlationId });
      return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_STATUS, {
        authenticated: false,
        user: null
      });
    }
    
    // Authenticated
    logger.info('Auth check: authenticated', { 
      correlationId,
      userId: user.id,
      email: user.email
    });
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_STATUS, {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
    
  } catch (error) {
    logger.error('Auth check failed', { correlationId, error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    // On error, assume not authenticated (fail-safe)
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_STATUS, {
      authenticated: false,
      user: null,
      error: error.message
    });
  }
});

// ============================================================================
// PASSWORD MANAGEMENT HANDLERS (XST-754, XST-751)
// ============================================================================

/**
 * Handle SUPABASE_AUTH_CHANGE_PASSWORD [XST-754]
 * Change password for currently authenticated user
 * 
 * Flow: verify current password → update to new password
 * 
 * @param {Object} message - { currentPassword, newPassword }
 * @returns {Object} Response with success flag
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_CHANGE_PASSWORD, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_CHANGE_PASSWORD', { correlationId });
  
  try {
    const { currentPassword, newPassword } = message.data || {};
    
    // Validate inputs
    if (!currentPassword || typeof currentPassword !== 'string') {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Mật khẩu hiện tại là bắt buộc',
        { field: 'currentPassword' }
      );
    }
    
    if (!newPassword || typeof newPassword !== 'string') {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Mật khẩu mới là bắt buộc',
        { field: 'newPassword' }
      );
    }
    
    // Password policy: 8+ chars, upper, lower, digit, special
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_PASSWORD_WEAK,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_PASSWORD_WEAK]
      );
    }
    
    // Check new ≠ current
    if (currentPassword === newPassword) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_PASSWORD_SAME,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_PASSWORD_SAME]
      );
    }
    
    // Step 1: Get current user email
    const userResult = await supabaseWithRetry(
      async () => {
        const result = await supabase.auth.getUser();
        if (result.error) throw result.error;
        return result;
      },
      { operationName: 'supabase.auth.getUser', maxRetries: 2, correlationId }
    );
    
    const email = userResult.data.user?.email;
    if (!email) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_REQUIRED,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_REQUIRED]
      );
    }
    
    // Step 2: Verify current password by re-signing in
    try {
      await supabaseWithRetry(
        async () => {
          const result = await supabase.auth.signInWithPassword({
            email,
            password: currentPassword
          });
          if (result.error) throw result.error;
          return result;
        },
        { operationName: 'verifyCurrentPassword', maxRetries: 1, correlationId }
      );
    } catch (verifyError) {
      logger.warn('Current password verification failed', { correlationId, error: verifyError.message });
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        'Mật khẩu hiện tại không đúng',
        { field: 'currentPassword' }
      );
    }
    
    // Step 3: Update password
    await supabaseWithRetry(
      async () => {
        const result = await supabase.auth.updateUser({ password: newPassword });
        if (result.error) throw result.error;
        return result;
      },
      { operationName: 'supabase.auth.updateUser', maxRetries: 2, correlationId }
    );
    
    logger.info('Password changed successfully', { correlationId });
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_PASSWORD_CHANGED, {
      success: true
    });
    
  } catch (error) {
    logger.error('Change password failed', { correlationId, error: error.message });
    
    if (error.errorCode) return error;
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      'Không thể đổi mật khẩu. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle SUPABASE_AUTH_RESET_PASSWORD_REQUEST [XST-751]
 * Send password reset email
 * 
 * @param {Object} message - { email }
 * @returns {Object} Response with success flag (always true for security)
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_RESET_PASSWORD_REQUEST, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_RESET_PASSWORD_REQUEST', { correlationId });
  
  try {
    const { email } = message.data || {};
    
    if (!email || typeof email !== 'string' || !email.trim()) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Email là bắt buộc',
        { field: 'email' }
      );
    }
    
    // Send reset email - always return success for security (don't reveal if email exists)
    try {
      await supabaseWithRetry(
        async () => {
          const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${chrome.runtime.getURL('settings.html')}#reset-password`
          });
          if (result.error) throw result.error;
          return result;
        },
        { operationName: 'supabase.auth.resetPasswordForEmail', maxRetries: 2, correlationId }
      );
    } catch (resetError) {
      // Log but don't reveal to user (security: don't disclose if email exists)
      logger.warn('Reset password email may have failed', { correlationId, error: resetError.message });
    }
    
    // Always return success for security
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_RESET_PASSWORD_SENT, {
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được email đặt lại mật khẩu.'
    });
    
  } catch (error) {
    logger.error('Reset password request failed', { correlationId, error: error.message });
    
    if (error.errorCode) return error;
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

// ============================================================================
// REGISTRATION HANDLER (XST-752, XST-756)
// ============================================================================

/**
 * Handle SUPABASE_AUTH_REGISTER [XST-752]
 * Register new user with email/password
 * 
 * @param {Object} message - { email, password, name }
 * @returns {Object} Response with user data and verification status
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_REGISTER, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_REGISTER', { correlationId });
  
  try {
    const { email, password, name } = message.data || {};
    
    // Validate email
    if (!email || typeof email !== 'string' || !email.trim()) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Email là bắt buộc',
        { field: 'email' }
      );
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Email không hợp lệ',
        { field: 'email' }
      );
    }
    
    // Validate password
    if (!password || typeof password !== 'string') {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Mật khẩu là bắt buộc',
        { field: 'password' }
      );
    }
    
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_PASSWORD_WEAK,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_PASSWORD_WEAK]
      );
    }
    
    // Register user
    const result = await supabaseWithRetry(
      async () => {
        const authResult = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name?.trim() || '',
            },
            emailRedirectTo: `${chrome.runtime.getURL('settings.html')}#email-confirmed`
          }
        });
        if (authResult.error) throw authResult.error;
        return authResult;
      },
      { operationName: 'supabase.auth.signUp', maxRetries: 2, correlationId }
    );
    
    const user = result.data.user;
    const needsEmailVerification = !user?.email_confirmed_at;
    
    logger.info('Registration successful', { 
      correlationId, 
      userId: user?.id,
      needsEmailVerification
    });
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_REGISTERED, {
      success: true,
      user: user ? {
        id: user.id,
        email: user.email,
        created_at: user.created_at
      } : null,
      needsEmailVerification
    });
    
  } catch (error) {
    logger.error('Registration failed', { correlationId, error: error.message });
    
    if (error.errorCode) return error;
    
    const errorMessage = error?.message || String(error);
    
    if (errorMessage.includes('User already registered')) {
      return createErrorResponse(
        message,
        ERROR_CODES.DUPLICATE_ENTRY,
        'Email này đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng email khác.',
        { technicalError: errorMessage }
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      'Không thể đăng ký. Vui lòng thử lại.',
      { technicalError: errorMessage }
    );
  }
});

/**
 * Handle SUPABASE_AUTH_RESEND_CONFIRMATION [XST-752]
 * Resend email confirmation
 * 
 * @param {Object} message - { email }
 * @returns {Object} Response with success flag
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_RESEND_CONFIRMATION, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_RESEND_CONFIRMATION', { correlationId });
  
  try {
    const { email } = message.data || {};
    
    if (!email || typeof email !== 'string' || !email.trim()) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Email là bắt buộc',
        { field: 'email' }
      );
    }
    
    await supabaseWithRetry(
      async () => {
        const result = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: {
            emailRedirectTo: `${chrome.runtime.getURL('settings.html')}#email-confirmed`
          }
        });
        if (result.error) throw result.error;
        return result;
      },
      { operationName: 'supabase.auth.resend', maxRetries: 2, correlationId }
    );
    
    logger.info('Confirmation email resent', { correlationId });
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_CONFIRMATION_RESENT, {
      success: true,
      message: 'Email xác nhận đã được gửi lại. Vui lòng kiểm tra hộp thư.'
    });
    
  } catch (error) {
    logger.error('Resend confirmation failed', { correlationId, error: error.message });
    
    if (error.errorCode) return error;
    
    const errorMessage = error?.message || String(error);
    
    if (errorMessage.includes('rate') || errorMessage.includes('limit')) {
      return createErrorResponse(
        message,
        ERROR_CODES.RATE_LIMITED,
        'Vui lòng đợi trước khi gửi lại email xác nhận.',
        { technicalError: errorMessage }
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      'Không thể gửi lại email xác nhận. Vui lòng thử lại.',
      { technicalError: errorMessage }
    );
  }
});

// ============================================================================
// GOOGLE OAUTH HANDLER (XST-753)
// ============================================================================

/**
 * Handle SUPABASE_AUTH_GOOGLE_LOGIN [XST-753]
 * Authenticate with Google OAuth via chrome.identity
 * 
 * Flow: chrome.identity.launchWebAuthFlow → extract token → signInWithIdToken
 * 
 * @param {Object} message - No payload required
 * @returns {Object} Response with user data
 */
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_GOOGLE_LOGIN, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling SUPABASE_AUTH_GOOGLE_LOGIN', { correlationId });
  
  try {
    // Step 1: Get Supabase project URL for OAuth
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Cấu hình Supabase chưa hoàn chỉnh.',
        { hint: 'Missing VITE_SUPABASE_URL in .env' }
      );
    }
    
    // Step 2: Build OAuth URL
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `${supabaseUrl}/auth/v1/authorize?` + new URLSearchParams({
      provider: 'google',
      redirect_to: redirectUrl,
      // Skip Supabase's PKCE for chrome.identity flow
      skip_http_redirect: 'false'
    }).toString();
    
    logger.info('Launching Google OAuth flow', { correlationId, redirectUrl });
    
    // Step 3: Launch WebAuthFlow
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true
        },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!callbackUrl) {
            reject(new Error('OAuth flow returned no URL'));
          } else {
            resolve(callbackUrl);
          }
        }
      );
    });
    
    // Step 4: Extract tokens from callback URL
    const hashParams = new URLSearchParams(
      responseUrl.includes('#') ? responseUrl.split('#')[1] : ''
    );
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    
    if (!accessToken) {
      logger.error('No access token in OAuth callback', { correlationId });
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Không nhận được token từ Google. Vui lòng thử lại.'
      );
    }
    
    // Step 5: Set session in Supabase
    const sessionResult = await supabaseWithRetry(
      async () => {
        const result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (result.error) throw result.error;
        return result;
      },
      { operationName: 'supabase.auth.setSession', maxRetries: 2, correlationId }
    );
    
    const user = sessionResult.data.user;
    
    if (!user) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Đăng nhập Google thất bại. Vui lòng thử lại.'
      );
    }
    
    logger.info('Google OAuth login successful', { 
      correlationId, 
      userId: user.id,
      email: user.email 
    });
    
    invalidatePromptCache();
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_GOOGLE_SUCCESS, {
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        updated_at: user.updated_at,
        user_metadata: user.user_metadata
      }
    });
    
  } catch (error) {
    logger.error('Google OAuth login failed', { correlationId, error: error.message });
    
    if (error.errorCode) return error;
    
    const errorMessage = error?.message || String(error);
    
    // User cancelled
    if (errorMessage.includes('canceled') || errorMessage.includes('cancelled') || errorMessage.includes('user closed')) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Đăng nhập bị hủy bởi người dùng.',
        { technicalError: errorMessage }
      );
    }
    
    // Popup blocked
    if (errorMessage.includes('popup') || errorMessage.includes('blocked')) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Popup bị chặn. Vui lòng cho phép popup và thử lại.',
        { technicalError: errorMessage }
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      'Đăng nhập bằng Google thất bại. Vui lòng thử lại.',
      { technicalError: errorMessage }
    );
  }
});

// ============================================================================
// ACCOUNT DELETION HANDLER (XST-755)
// ============================================================================

/**
 * Handle ACCOUNT_DELETE_REQUEST [XST-755]
 * Delete user account and all associated data (GDPR Art. 17)
 * 
 * Flow: verify auth → call Edge Function → clear local storage
 * 
 * @param {Object} message - { confirmText } (must be "XÓA TÀI KHOẢN")
 * @returns {Object} Response with success flag
 */
registerHandler(MESSAGE_TYPES.ACCOUNT_DELETE_REQUEST, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ACCOUNT_DELETE_REQUEST', { correlationId });
  
  try {
    const { confirmText } = message.data || {};
    
    // Verify confirmation text
    if (confirmText !== 'XÓA TÀI KHOẢN') {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Vui lòng nhập chính xác "XÓA TÀI KHOẢN" để xác nhận.',
        { field: 'confirmText' }
      );
    }
    
    // Get current user
    const userResult = await supabaseWithRetry(
      async () => {
        const result = await supabase.auth.getUser();
        if (result.error) throw result.error;
        return result;
      },
      { operationName: 'supabase.auth.getUser', maxRetries: 2, correlationId }
    );
    
    const userId = userResult.data.user?.id;
    if (!userId) {
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_REQUIRED,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_REQUIRED]
      );
    }
    
    logger.info('Calling delete-account Edge Function', { correlationId, userId });
    
    // Call Edge Function for account deletion (needs admin privileges)
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { userId, confirmText }
    });
    
    if (error) {
      logger.error('Edge Function delete-account failed', { correlationId, error: error.message });
      return createErrorResponse(
        message,
        ERROR_CODES.AUTH_ACCOUNT_DELETE_FAILED,
        ERROR_MESSAGES_VN[ERROR_CODES.AUTH_ACCOUNT_DELETE_FAILED],
        { technicalError: error.message }
      );
    }
    
    // Clear local storage
    try {
      await chrome.storage.local.clear();
      logger.info('Chrome storage cleared after account deletion', { correlationId });
    } catch (storageError) {
      logger.warn('Failed to clear chrome storage', { correlationId, error: storageError.message });
    }
    
    logger.info('Account deleted successfully', { correlationId, userId });
    
    // Invalidate cache
    invalidatePromptCache();
    
    return createResponse(message, MESSAGE_TYPES.ACCOUNT_DELETED, {
      success: true
    });
    
  } catch (error) {
    logger.error('Account deletion failed', { correlationId, error: error.message });
    
    if (error.errorCode) return error;
    
    return createErrorResponse(
      message,
      ERROR_CODES.AUTH_ACCOUNT_DELETE_FAILED,
      ERROR_MESSAGES_VN[ERROR_CODES.AUTH_ACCOUNT_DELETE_FAILED],
      { technicalError: error.message }
    );
  }
});

/**
 * Setup auth state change listener
 * Listen for Supabase auth events and broadcast to UI
 */
function setupAuthStateListener() {
  logger.info('Setting up auth state listener');
  
  supabase.auth.onAuthStateChange((event, session) => {
    logger.info('Auth state changed', { event, userId: session?.user?.id });
    
    // Broadcast token refresh events
    if (event === 'TOKEN_REFRESHED' && session) {
      chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.AUTH_TOKEN_REFRESHED,
        correlationId: `auth-token-refreshed-${Date.now()}`,
        timestamp: Date.now(),
        data: { 
          user: {
            id: session.user.id,
            email: session.user.email
          }
        }
      }).catch(err => {
        logger.warn('Failed to broadcast token refresh', { error: err.message });
      });
    }
    
    // Broadcast sign out events
    if (event === 'SIGNED_OUT') {
      chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
        correlationId: `auth-signed-out-${Date.now()}`,
        timestamp: Date.now(),
        data: { 
          user: null,
          authenticated: false
        }
      }).catch(err => {
        logger.warn('Failed to broadcast sign out', { error: err.message });
      });
    }
    
    // Broadcast sign in events
    if (event === 'SIGNED_IN' && session) {
      chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
        correlationId: `auth-signed-in-${Date.now()}`,
        timestamp: Date.now(),
        data: { 
          user: {
            id: session.user.id,
            email: session.user.email
          },
          authenticated: true
        }
      }).catch(err => {
        logger.warn('Failed to broadcast sign in', { error: err.message });
      });

      // Option A: user just signed in -> flush any queued chat_history items.
      flushChatHistoryOutbox({ reason: 'signed_in' }).catch(err => {
        logger.warn('Failed to flush chat_history outbox after sign-in', { error: err?.message || String(err) });
      });
    }
  });
}

// Initialize auth state listener when module loads
setupAuthStateListener();

logger.info('Supabase auth handlers registered');
