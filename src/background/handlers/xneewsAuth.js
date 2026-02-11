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
import { XNEEWS_API_BASE, XNEEWS_ERROR_MESSAGES, XNEEWS_STORAGE_KEYS } from '../../shared/xneewsConfig.js';
import { fetchWithRetry } from '../utils/fetchWithRetry.js';
import { getStoredTokens, saveTokens, clearTokens } from '../utils/xneewsFetch.js';

const logger = createLogger('Handlers/XneewsAuth');

// Alias for backward compat within this file
const ERROR_MESSAGES_VI = XNEEWS_ERROR_MESSAGES;

// getStoredTokens, saveTokens, clearTokens, fetchWithRetry — imported from shared utils

/**
 * Parse token response with defensive handling for various formats
 * Server may return direct { access_token, refresh_token } or nested variants
 * @param {Object} data - Response data from auth endpoints
 * @param {string} operation - Operation name for logging (register/login/refresh)
 * @returns {{ access_token: string, refresh_token: string, expires_in?: number } | null}
 */
function parseTokenResponse(data, operation = 'auth') {
  // Case 1: Direct response (correct per OpenAPI spec)
  if (typeof data.access_token === 'string' && typeof data.refresh_token === 'string') {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in
    };
  }

  // Case 2: Nested in 'data' field
  if (data.data && typeof data.data.access_token === 'string' && typeof data.data.refresh_token === 'string') {
    logger.warn(`${operation} response is nested in 'data' field (API mismatch)`, {
      expectedFormat: 'flat',
      receivedFormat: 'nested'
    });
    return {
      access_token: data.data.access_token,
      refresh_token: data.data.refresh_token,
      expires_in: data.data.expires_in
    };
  }

  // Case 3: Unexpected format
  logger.error(`${operation} response has unexpected format`, {
    responseKeys: Object.keys(data),
    hasAccessToken: !!data.access_token,
    typeOfAccessToken: typeof data.access_token,
    sampleData: JSON.stringify(data).substring(0, 200)
  });
  return null;
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
    const tokens = parseTokenResponse(data, 'register');

    if (!tokens) {
      logger.error('Register response missing or invalid tokens', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    const { access_token, refresh_token, expires_in } = tokens;

    // Save tokens
    await saveTokens(access_token, refresh_token, email.trim(), email.trim());
    
    // Save token expiry (default 24h if not provided by API)
    const expiresAtMs = expires_in 
      ? Date.now() + (expires_in * 1000) 
      : Date.now() + (24 * 60 * 60 * 1000);
    await chrome.storage.local.set({
      [XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT]: expiresAtMs
    });

    logger.info('Register successful', { 
      correlationId, 
      email: email.trim(),
      expiresInMinutes: Math.floor((expiresAtMs - Date.now()) / 60000)
    });

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
    const tokens = parseTokenResponse(data, 'login');

    if (!tokens) {
      logger.error('Login response missing or invalid tokens', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    const { access_token, refresh_token, expires_in } = tokens;

    // Save tokens
    await saveTokens(access_token, refresh_token, email.trim(), email.trim());
    
    // Save token expiry (default 24h if not provided by API)
    const expiresAtMs = expires_in 
      ? Date.now() + (expires_in * 1000) 
      : Date.now() + (24 * 60 * 60 * 1000);
    await chrome.storage.local.set({
      [XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT]: expiresAtMs
    });

    logger.info('Login successful', { 
      correlationId, 
      email: email.trim(),
      expiresInMinutes: Math.floor((expiresAtMs - Date.now()) / 60000)
    });

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
    const tokens = parseTokenResponse(data, 'refresh');

    if (!tokens) {
      logger.error('Refresh response missing or invalid tokens', { correlationId });
      return createErrorResponse(message, 'AUTH_ERROR', ERROR_MESSAGES_VI.AUTH_ERROR);
    }

    const { access_token, refresh_token: newRefreshToken, expires_in } = tokens;

    // Save new tokens
    await saveTokens(access_token, newRefreshToken || refreshToken, email, email);
    
    // Save token expiry (default 24h if not provided by API)
    const expiresAtMs = expires_in 
      ? Date.now() + (expires_in * 1000) 
      : Date.now() + (24 * 60 * 60 * 1000);
    await chrome.storage.local.set({
      [XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT]: expiresAtMs
    });

    logger.info('Token refresh successful', { 
      correlationId, 
      email,
      expiresInMinutes: Math.floor((expiresAtMs - Date.now()) / 60000)
    });

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

// Re-export from shared utils for backward compatibility
export { getStoredTokens, saveTokens, clearTokens } from '../utils/xneewsFetch.js';
