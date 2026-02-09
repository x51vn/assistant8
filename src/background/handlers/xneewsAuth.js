/**
 * @fileoverview X-Neews Authentication Handler
 * Manages user authentication with x-neews API (separate from Supabase)
 * Tokens stored securely in chrome.storage.local
 * 
 * Architecture:
 * - Stateless handler pattern (Service Worker can terminate anytime)
 * - Tokens stored via chrome.storage.local (not localStorage)
 * - Background = Middleware: UI → Background → X-Neews API
 * 
 * API Reference: docs/AUTHENTICATION_AND_WATCHLIST_API.md
 * Ticket: XST-739
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/XneewsAuth');

/**
 * Configuration for X-Neews API
 * Base URL should be loaded from environment or settings
 * For now, using fallback - can be overridden via VITE_ env vars
 * OpenAPI Docs: https://api.x51.vn/api/openapi.json
 */
const XNEEWS_API_BASE = import.meta.env.VITE_XNEEWS_API_URL || 'https://api.x51.vn/api';

/**
 * Chrome storage keys for X-Neews tokens
 */
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'xneews_access_token',
  REFRESH_TOKEN: 'xneews_refresh_token',
  USER_ID: 'xneews_user_id',
  USER_EMAIL: 'xneews_user_email',
  LAST_LOGIN: 'xneews_last_login'
};

/**
 * Vietnamese error messages for X-Neews errors
 */
const ERROR_MESSAGES_VI = {
  NETWORK_ERROR: 'Không có kết nối internet. Vui lòng kiểm tra mạng.',
  API_ERROR: 'Lỗi kết nối API. Vui lòng thử lại.',
  AUTH_ERROR: 'Lỗi xác thực. Vui lòng thử lại.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_REQUIRED: 'Email là bắt buộc.',
  PASSWORD_REQUIRED: 'Mật khẩu là bắt buộc.',
  PASSWORD_WEAK: 'Mật khẩu không đạt yêu cầu (tối thiểu 8 ký tự, 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt).',
  EMAIL_ALREADY_REGISTERED: 'Email này đã được đăng ký.',
  TOKEN_EXPIRED: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
  TOKEN_INVALID: 'Token không hợp lệ.',
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ.'
};

/**
 * Helper: Get tokens from chrome.storage.local
 * @returns {Promise<{accessToken: string, refreshToken: string, userId: string, email: string}>}
 */
async function getStoredTokens() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.USER_ID,
    STORAGE_KEYS.USER_EMAIL
  ]);

  return {
    accessToken: result[STORAGE_KEYS.ACCESS_TOKEN] || null,
    refreshToken: result[STORAGE_KEYS.REFRESH_TOKEN] || null,
    userId: result[STORAGE_KEYS.USER_ID] || null,
    email: result[STORAGE_KEYS.USER_EMAIL] || null
  };
}

/**
 * Helper: Save tokens to chrome.storage.local
 * @param {string} accessToken
 * @param {string} refreshToken
 * @param {string} userId
 * @param {string} email
 */
async function saveTokens(accessToken, refreshToken, userId, email) {
  const data = {
    [STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
    [STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
    [STORAGE_KEYS.USER_ID]: userId,
    [STORAGE_KEYS.USER_EMAIL]: email,
    [STORAGE_KEYS.LAST_LOGIN]: new Date().toISOString()
  };

  await chrome.storage.local.set(data);
  logger.debug('Tokens saved to chrome.storage.local', { email });
}

/**
 * Helper: Clear tokens from chrome.storage.local
 */
async function clearTokens() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.USER_ID,
    STORAGE_KEYS.USER_EMAIL,
    STORAGE_KEYS.LAST_LOGIN
  ]);
  logger.debug('Tokens cleared from chrome.storage.local');
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
          const delay = Math.pow(2, attempt) * 1000; // exponential backoff
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
 * Handle XNEEWS_AUTH_REGISTER
 * Create new user account
 * 
 * @param {Object} message - { email, password, name, language, timezone }
 * @returns {Object} Response with tokens
 */
registerHandler(MESSAGE_TYPES.XNEEWS_AUTH_REGISTER, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_AUTH_REGISTER', { correlationId });

  try {
    const { email, password, name, language = 'en', timezone = 'Asia/Ho_Chi_Minh' } = message.data || {};

    // Validation
    if (!email || typeof email !== 'string' || !email.trim()) {
      logger.warn('Register failed: missing email', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.EMAIL_REQUIRED);
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      logger.warn('Register failed: missing password', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.PASSWORD_REQUIRED);
    }

    // Call X-Neews register endpoint
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        name: name || '',
        language,
        timezone
      })
    });

    const data = await response.json();

    // Handle errors
    if (!response.ok) {
      const errorMsg = data?.detail || data?.message || 'Register failed';

      // Map specific errors
      if (response.status === 400 && errorMsg.includes('already')) {
        return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.EMAIL_ALREADY_REGISTERED);
      }

      if (response.status === 422) {
        logger.warn('Validation error on register', { correlationId, errorMsg });
        return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.VALIDATION_ERROR);
      }

      logger.error('Register failed', { correlationId, status: response.status, errorMsg });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.API_ERROR);
    }

    // Register successful
    const { access_token, refresh_token } = data;

    if (!access_token || !refresh_token) {
      logger.error('Register response missing tokens', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Save tokens
    await saveTokens(access_token, refresh_token, email.trim(), email.trim());

    logger.info('Register successful', { correlationId, email: email.trim() });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_AUTH_SUCCESS, {
      accessToken: access_token,
      refreshToken: refresh_token,
      email: email.trim(),
      message: 'Đăng ký thành công'
    });
  } catch (error) {
    logger.error('Register handler error', { correlationId, error: error.message });

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.API_ERROR);
  }
});

/**
 * Handle XNEEWS_AUTH_LOGIN
 * Authenticate user with email/password
 * 
 * @param {Object} message - { email, password }
 * @returns {Object} Response with tokens and user info
 */
registerHandler(MESSAGE_TYPES.XNEEWS_AUTH_LOGIN, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_AUTH_LOGIN', { correlationId });

  try {
    const { email, password } = message.data || {};

    // Validation
    if (!email || typeof email !== 'string' || !email.trim()) {
      logger.warn('Login failed: missing email', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.EMAIL_REQUIRED);
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      logger.warn('Login failed: missing password', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.PASSWORD_REQUIRED);
    }

    // Call X-Neews login endpoint
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password
      })
    });

    const data = await response.json();

    // Handle errors
    if (!response.ok) {
      const errorMsg = data?.detail || data?.message || 'Login failed';

      if (response.status === 401 || errorMsg.includes('credentials')) {
        return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.INVALID_CREDENTIALS);
      }

      if (response.status === 423) {
        return createErrorResponse(message, 'AUTH_ERROR', 'Tài khoản bị khóa. Vui lòng kiểm tra email để mở khóa.');
      }

      logger.error('Login failed', { correlationId, status: response.status, errorMsg });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.API_ERROR);
    }

    // Login successful
    const { access_token, refresh_token } = data;

    if (!access_token || !refresh_token) {
      logger.error('Login response missing tokens', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Save tokens
    await saveTokens(access_token, refresh_token, email.trim(), email.trim());

    logger.info('Login successful', { correlationId, email: email.trim() });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_AUTH_SUCCESS, {
      accessToken: access_token,
      refreshToken: refresh_token,
      email: email.trim(),
      message: 'Đăng nhập thành công'
    });
  } catch (error) {
    logger.error('Login handler error', { correlationId, error: error.message });

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.API_ERROR);
  }
});

/**
 * Handle XNEEWS_AUTH_REFRESH
 * Refresh access token using refresh token
 * 
 * @param {Object} message - No payload required, uses stored refresh_token
 * @returns {Object} Response with new tokens
 */
registerHandler(MESSAGE_TYPES.XNEEWS_AUTH_REFRESH, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_AUTH_REFRESH', { correlationId });

  try {
    // Get stored tokens
    const { refreshToken, email } = await getStoredTokens();

    if (!refreshToken) {
      logger.warn('Refresh failed: no refresh token stored', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', 'Vui lòng đăng nhập lại.');
    }

    // Call X-Neews refresh endpoint
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/v1/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await response.json();

    // Handle errors
    if (!response.ok) {
      const errorMsg = data?.detail || data?.message || 'Refresh failed';

      if (response.status === 401) {
        await clearTokens();
        return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.TOKEN_EXPIRED);
      }

      logger.error('Refresh failed', { correlationId, status: response.status, errorMsg });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.API_ERROR);
    }

    // Refresh successful
    const { access_token, refresh_token: newRefreshToken } = data;

    if (!access_token) {
      logger.error('Refresh response missing tokens', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    // Save new tokens
    await saveTokens(access_token, newRefreshToken || refreshToken, email, email);

    logger.info('Token refresh successful', { correlationId, email });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_AUTH_SUCCESS, {
      accessToken: access_token,
      refreshToken: newRefreshToken || refreshToken,
      email,
      message: 'Token làm mới thành công'
    });
  } catch (error) {
    logger.error('Refresh handler error', { correlationId, error: error.message });

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.API_ERROR);
  }
});

/**
 * Handle XNEEWS_AUTH_LOGOUT
 * Clear stored tokens
 * 
 * @param {Object} message - No payload required
 * @returns {Object} Response with success status
 */
registerHandler(MESSAGE_TYPES.XNEEWS_AUTH_LOGOUT, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_AUTH_LOGOUT', { correlationId });

  try {
    // Clear tokens from storage
    await clearTokens();

    logger.info('Logout successful', { correlationId });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_AUTH_LOGGED_OUT, {
      success: true,
      message: 'Đăng xuất thành công'
    });
  } catch (error) {
    logger.error('Logout handler error', { correlationId, error: error.message });

    return createErrorResponse(message, 'AUTH_ERROR', 'Không thể đăng xuất. Vui lòng thử lại.');
  }
});

/**
 * Export token getters for other handlers (e.g., watchlist handler)
 */
export { getStoredTokens, saveTokens, clearTokens };
