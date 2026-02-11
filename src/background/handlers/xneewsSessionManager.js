/**
 * @fileoverview X-Neews Session Management
 * Proactive token refresh with same reliability as Supabase
 * 
 * Unlike xneewsFetch which only refreshes on 401 errors,
 * this monitors token expiry and refreshes BEFORE they expire
 */

import { createLogger } from '../../logger.js';
import { getStoredTokens, saveTokens } from '../utils/xneewsFetch.js';
import { XNEEWS_API_BASE, XNEEWS_STORAGE_KEYS } from '../../shared/xneewsConfig.js';
import { fetchWithRetry } from '../utils/fetchWithRetry.js';

const logger = createLogger('Handlers/XneewsSessionManager');

let lastXneewsCheckTime = 0;
const XNEEWS_CHECK_INTERVAL_MS = 5 * 60000; // Check every 5 minutes

// ============================================================================
// INTERNAL X-NEEWS SESSION CHECK (Direct alarm invocation)
// ============================================================================

/**
 * INTERNAL: Perform X-Neews token check without needing message response
 * Called directly by alarms, guaranteed to execute regardless of UI state
 * 
 * @param {string} correlationId - For logging
 * @returns {Promise<Object>} Status result
 */
export async function _performXneewsCheck(correlationId) {
  const now = Date.now();
  
  // Skip if checked very recently (< 2 min to allow more frequent checks)
  if (now - lastXneewsCheckTime < 2 * 60000) {
    logger.debug('X-Neews check skipped (throttled)', { correlationId });
    return { status: 'throttled' };
  }
  
  lastXneewsCheckTime = now;
  
  try {
    const { accessToken, refreshToken, email } = await getStoredTokens();
    
    // No token - user needs to login
    if (!accessToken || !refreshToken) {
      logger.debug('No X-Neews tokens stored', { correlationId });
      return { status: 'not_authenticated', needsAuth: true };
    }
    
    // Try to get token expiry info (if stored)
    const expiryData = await chrome.storage.local.get([XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT]);
    const expiresAtMs = expiryData[XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT];
    
    if (!expiresAtMs) {
      // No expiry info - assume token is fresh (first check after old login)
      logger.debug('No token expiry info, assuming fresh', { correlationId, email });
      return { status: 'healthy_unknown_expiry', authenticated: true };
    }
    
    const timeUntilExpiry = expiresAtMs - now;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
    
    logger.debug('X-Neews token health check', {
      correlationId,
      minutesUntilExpiry,
      email
    });
    
    // Case 1: Token already expired
    if (timeUntilExpiry < 0) {
      logger.warn('X-Neews token expired, attempting refresh', { correlationId });
      const refreshResult = await _refreshXneewsToken(correlationId);
      
      if (refreshResult.success) {
        logger.info('X-Neews emergency refresh succeeded', { correlationId });
        return { status: 'emergency_refreshed', authenticated: true };
      }
      
      // Refresh failed - tokens dead
      logger.error('X-Neews refresh failed, clearing tokens', { correlationId });
      await _clearXneewsTokens();
      return { status: 'expired', authenticated: false, needsAuth: true };
    }
    
    // Case 2: Token expiring soon (< 5 minutes) - proactive refresh
    if (timeUntilExpiry < 5 * 60000) {
      logger.info('X-Neews token expiring soon, proactive refresh', {
        correlationId,
        minutesUntilExpiry
      });
      
      const refreshResult = await _refreshXneewsToken(correlationId);
      
      if (refreshResult.success) {
        logger.info('X-Neews proactive refresh succeeded', { correlationId });
        return { status: 'proactive_refreshed', authenticated: true };
      }
      
      logger.warn('X-Neews proactive refresh failed', {
        correlationId,
        minutesUntilExpiry
      });
      
      // Don't clear tokens yet - wait for natural expiry
      // User can still operate until actual 401 occurs
      return { status: 'refresh_pending', authenticated: true, minutesUntilExpiry };
    }
    
    // Case 3: Token healthy with plenty of time
    logger.debug('X-Neews token healthy', { correlationId, minutesUntilExpiry });
    return { status: 'healthy', authenticated: true, minutesUntilExpiry };
    
  } catch (error) {
    logger.error('X-Neews session check failed', {
      correlationId,
      error: error.message
    });
    return { status: 'error', error: error.message };
  }
}

// ============================================================================
// TOKEN REFRESH UTILITY
// ============================================================================

/**
 * Refresh X-Neews access token using refresh_token
 * @param {string} correlationId - For logging
 * @returns {Promise<{success: boolean, accessToken?: string}>}
 */
async function _refreshXneewsToken(correlationId) {
  try {
    const { refreshToken, email } = await getStoredTokens();
    
    if (!refreshToken) {
      logger.warn('No refresh token available', { correlationId });
      return { success: false };
    }
    
    logger.debug('Refreshing X-Neews token', { correlationId, email });
    
    const response = await fetchWithRetry(`${XNEEWS_API_BASE}/v1/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }, 2, 8000); // 2 retries, 8s timeout
    
    if (!response.ok) {
      if (response.status === 401) {
        // Refresh token also expired → must re-login
        logger.warn('Refresh token expired or invalid', { correlationId });
        await _clearXneewsTokens();
      }
      return { success: false };
    }
    
    const data = await response.json();
    const { access_token, refresh_token: newRefreshToken, expires_in } = data;
    
    if (!access_token) {
      logger.error('Refresh response missing access_token', { correlationId });
      return { success: false };
    }
    
    // Calculate expiry time (default 24h if not provided)
    const expiresAtMs = expires_in 
      ? Date.now() + (expires_in * 1000) 
      : Date.now() + (24 * 60 * 60 * 1000);
    
    // Save new tokens with expiry
    await saveTokens(access_token, newRefreshToken || refreshToken, null, email);
    await chrome.storage.local.set({
      [XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT]: expiresAtMs
    });
    
    logger.info('✅ X-Neews token refreshed', {
      correlationId,
      expiresInMinutes: Math.floor((expiresAtMs - Date.now()) / 60000)
    });
    
    return { success: true, accessToken: access_token };
    
  } catch (error) {
    logger.error('X-Neews token refresh failed', { correlationId, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Clear X-Neews tokens from storage
 */
async function _clearXneewsTokens() {
  const keysToRemove = [
    ...Object.values(XNEEWS_STORAGE_KEYS),
    XNEEWS_STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT
  ];
  
  await chrome.storage.local.remove(keysToRemove);
  logger.info('X-Neews tokens cleared');
}

logger.info('X-Neews session manager initialized');
