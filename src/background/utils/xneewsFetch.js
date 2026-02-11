/**
 * @fileoverview X-Neews Authenticated Fetch with Auto Token Refresh
 * Wraps fetchWithRetry with automatic 401 → refresh → retry logic
 *
 * Flow:
 * 1. Get access token from chrome.storage.local
 * 2. Make API call with Bearer token
 * 3. On 401 → call /v1/auth/refresh-token with stored refresh_token
 * 4. Save new tokens → retry original request ONCE
 * 5. If refresh fails → clear tokens, return 401 response
 *
 * Used by: xneewsWatchlist, xneewsPriceUpdate, watchlistAiEnrichService
 */

import { createLogger } from '../../logger.js';
import { fetchWithRetry } from './fetchWithRetry.js';
import { XNEEWS_API_BASE, XNEEWS_STORAGE_KEYS } from '../../shared/xneewsConfig.js';

const logger = createLogger('Utils/XneewsFetch');

/**
 * Get X-Neews tokens from chrome.storage.local
 * @returns {Promise<{accessToken: string|null, refreshToken: string|null, userId: string|null, email: string|null}>}
 */
export async function getStoredTokens() {
  const result = await chrome.storage.local.get([
    XNEEWS_STORAGE_KEYS.ACCESS_TOKEN,
    XNEEWS_STORAGE_KEYS.REFRESH_TOKEN,
    XNEEWS_STORAGE_KEYS.USER_ID,
    XNEEWS_STORAGE_KEYS.USER_EMAIL
  ]);

  return {
    accessToken: result[XNEEWS_STORAGE_KEYS.ACCESS_TOKEN] || null,
    refreshToken: result[XNEEWS_STORAGE_KEYS.REFRESH_TOKEN] || null,
    userId: result[XNEEWS_STORAGE_KEYS.USER_ID] || null,
    email: result[XNEEWS_STORAGE_KEYS.USER_EMAIL] || null
  };
}

/**
 * Save X-Neews tokens to chrome.storage.local
 * @param {string} accessToken
 * @param {string} refreshToken
 * @param {string} [userId]
 * @param {string} [email]
 */
export async function saveTokens(accessToken, refreshToken, userId, email) {
  const data = {
    [XNEEWS_STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
    [XNEEWS_STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
    [XNEEWS_STORAGE_KEYS.LAST_LOGIN]: new Date().toISOString()
  };
  if (userId) data[XNEEWS_STORAGE_KEYS.USER_ID] = userId;
  if (email) data[XNEEWS_STORAGE_KEYS.USER_EMAIL] = email;

  await chrome.storage.local.set(data);
  logger.debug('Tokens saved', { email });
}

/**
 * Clear all X-Neews tokens from chrome.storage.local
 */
export async function clearTokens() {
  await chrome.storage.local.remove(Object.values(XNEEWS_STORAGE_KEYS));
  logger.debug('Tokens cleared');
}

/**
 * Attempt to refresh the access token using the stored refresh token
 * @returns {Promise<{success: boolean, accessToken?: string}>}
 */
async function refreshAccessToken() {
  const { refreshToken, email } = await getStoredTokens();
  if (!refreshToken) {
    logger.warn('No refresh token available');
    return { success: false };
  }

  try {
    logger.debug('Attempting token refresh', { hasRefreshToken: !!refreshToken });

    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/v1/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }, 2, 8000); // 2 retries, 8s timeout

    if (!response.ok) {
      logger.warn('Token refresh failed', {
        status: response.status,
        statusText: response.statusText
      });

      if (response.status === 401) {
        // Refresh token also expired → must re-login
        logger.warn('Refresh token expired, clearing tokens');
        await clearTokens();
      }

      // Try to read error body for debugging
      try {
        const errorData = await response.text();
        logger.error('Refresh token error body', {
          status: response.status,
          body: errorData.substring(0, 500)
        });
      } catch (e) {
        // Ignore if can't read body
      }

      return { success: false };
    }

    const data = await response.json();

    // ⚠️ DEFENSIVE PARSING: Handle various response formats
    // OpenAPI spec says: { access_token, refresh_token, token_type }
    // But server may return nested or wrapped responses
    let access_token, newRefreshToken, expires_in;

    // Case 1: Direct response (correct per spec)
    if (typeof data.access_token === 'string') {
      access_token = data.access_token;
      newRefreshToken = data.refresh_token;
      expires_in = data.expires_in;
    }
    // Case 2: Nested in 'data' field
    else if (data.data && typeof data.data.access_token === 'string') {
      access_token = data.data.access_token;
      newRefreshToken = data.data.refresh_token;
      expires_in = data.data.expires_in;
    }
    // Case 3: Log unexpected format
    else {
      logger.error('Refresh response has unexpected format', {
        responseKeys: Object.keys(data),
        sampleData: JSON.stringify(data).substring(0, 200)
      });
      return { success: false };
    }

    if (!access_token || typeof access_token !== 'string') {
      logger.error('Refresh response missing or invalid access_token', {
        hasAccessToken: !!access_token,
        typeOfAccessToken: typeof access_token
      });
      return { success: false };
    }

    // Save new tokens
    await saveTokens(access_token, newRefreshToken || refreshToken, null, email);

    // ✅ CRITICAL FIX: Save token expiry time after refresh
    // Without this, xneewsSessionManager thinks token is still expired
    const expiresAtMs = expires_in
      ? Date.now() + (expires_in * 1000)
      : Date.now() + (24 * 60 * 60 * 1000); // Default 24h if not provided
    await chrome.storage.local.set({
      [XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT]: expiresAtMs
    });

    logger.info('Token refreshed successfully', {
      expiresInMinutes: Math.floor((expiresAtMs - Date.now()) / 60000)
    });
    return { success: true, accessToken: access_token };
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    return { success: false };
  }
}

/**
 * Make an authenticated X-Neews API call with auto token refresh on 401
 *
 * @param {string} url - Full API URL
 * @param {Object} options - fetch options (without Authorization header)
 * @returns {Promise<Response>} Fetch response (guaranteed to not be a refreshable 401)
 */
export async function xneewsFetch(url, options = {}) {
  // 1. Get current token
  const { accessToken } = await getStoredTokens();
  if (!accessToken) {
    // No token at all → return a fake 401 response
    return new Response(JSON.stringify({ detail: 'No access token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Make request with current token
  const authOptions = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  const response = await fetchWithRetry(url, authOptions);

  // 3. If not 401, return as-is
  if (response.status !== 401) {
    return response;
  }

  // 4. Token expired → attempt refresh
  logger.info('Access token expired, attempting refresh', { url: url.split('?')[0] });
  const refreshResult = await refreshAccessToken();

  if (!refreshResult.success) {
    // Refresh failed → return the original 401 response
    return response;
  }

  // 5. Retry with new token
  const retryOptions = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${refreshResult.accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  logger.info('Retrying request with refreshed token', { url: url.split('?')[0] });
  return fetchWithRetry(url, retryOptions);
}
