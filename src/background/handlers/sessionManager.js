/**
 * @fileoverview Session Management - Handles token expiration & graceful logout
 * 
 * PROBLEM: Supabase autoRefreshToken can fail silently when:
 * 1. User is offline
 * 2. Service Worker restarts and loses context
 * 3. Token is already expired before refresh attempt
 * 4. Network errors during refresh
 * 
 * SOLUTION:
 * 1. Monitor token expiration (check every 1 minute)
 * 2. Silently refresh token 2 minutes before expiry (background operation)
 * 3. Only show login required when token is truly expired and cannot refresh
 * 4. No premature warnings - just seamless refresh
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/SessionManager');

// ============================================================================
// SESSION MONITORING STATE
// ============================================================================

// Track when we last checked session expiration (avoid excessive checks)
let lastSessionCheckTime = 0;
const SESSION_CHECK_INTERVAL_MS = 60000; // Check every 1 minute

// ============================================================================
// SESSION CHECK HANDLER
// ============================================================================

/**
 * Handle SESSION_CHECK message
 * Proactively checks if session is about to expire
 * Broadcasts warnings to UI if needed
 * 
 * Call this from alarms or periodically to ensure session stays valid
 */
registerHandler(MESSAGE_TYPES.SESSION_CHECK, async (message) => {
  const correlationId = message.correlationId;
  logger.debug('Handling SESSION_CHECK', { correlationId });

  try {
    // Throttle checks to avoid excessive Supabase calls
    const now = Date.now();
    if (now - lastSessionCheckTime < SESSION_CHECK_INTERVAL_MS) {
      logger.debug('Session check throttled', { 
        correlationId,
        timeSinceLastCheck: now - lastSessionCheckTime 
      });
      return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
        status: 'throttled',
        nextCheckIn: SESSION_CHECK_INTERVAL_MS - (now - lastSessionCheckTime)
      });
    }

    lastSessionCheckTime = now;

    // Get current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      logger.warn('Failed to check session', { correlationId, error: error.message });
      return createErrorResponse(
        message,
        'SESSION_CHECK_ERROR',
        'Không thể kiểm tra phiên đăng nhập',
        { technicalError: error.message }
      );
    }

    // Case 1: No session - user needs to login
    if (!session) {
      logger.info('Session check: no session found', { correlationId });
      return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
        status: 'no_session',
        authenticated: false,
        action: 'LOGIN_REQUIRED'
      });
    }

    // Case 2: Session exists - check expiration
    const expiresAt = session.expires_at * 1000; // Convert to ms
    const now_ms = Date.now();
    const timeUntilExpiry = expiresAt - now_ms;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);

    logger.debug('Session check: session valid', {
      correlationId,
      userId: session.user.id,
      minutesUntilExpiry
    });

    // Case 2a: Token already expired
    if (timeUntilExpiry < 0) {
      logger.warn('Session expired', {
        correlationId,
        userId: session.user.id,
        expiredMins: Math.floor(-timeUntilExpiry / 60000)
      });

      // Attempt one final refresh
      const refreshResult = await attemptTokenRefresh(correlationId);
      if (refreshResult.success) {
        logger.info('Token refreshed in time', { correlationId });
        return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
          status: 'valid_refreshed',
          authenticated: true
        });
      }

      // Refresh failed - session is dead, only then broadcast logout
      broadcastSessionExpired(session.user);
      return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
        status: 'expired',
        authenticated: false,
        action: 'LOGIN_REQUIRED',
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      });
    }

    // Case 2b: Token expiring soon (within 2 minutes) - attempt silent refresh only
    // ✅ FIX: Only refresh silently, don't warn user until token is truly expired
    if (timeUntilExpiry < 2 * 60000) {
      logger.debug('Token expiring soon - attempting silent refresh', {
        correlationId,
        minutesUntilExpiry
      });

      // Attempt refresh
      const refreshResult = await attemptTokenRefresh(correlationId);
      if (refreshResult.success) {
        logger.info('Token refreshed silently', { correlationId });
        return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
          status: 'valid_refreshed',
          authenticated: true
        });
      }

      // ⚠️ FIX: Don't broadcast SESSION_ABOUT_TO_EXPIRE
      // Just keep session valid and let it expire naturally
      // Only show error when token truly expires and cannot refresh
      logger.warn('Silent refresh failed, waiting for natural expiry', {
        correlationId,
        minutesUntilExpiry
      });

      return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
        status: 'valid_but_expiring',
        authenticated: true,
        minutesUntilExpiry
      });
    }

    // Case 2c: Session valid with plenty of time
    logger.debug('Session check: session valid and fresh', {
      correlationId,
      minutesUntilExpiry
    });

    return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
      status: 'valid',
      authenticated: true,
      minutesUntilExpiry
    });

  } catch (error) {
    logger.error('Session check handler failed', {
      correlationId,
      error: error.message
    });

    return createErrorResponse(
      message,
      'SESSION_CHECK_ERROR',
      'Lỗi kiểm tra phiên. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

// ============================================================================
// FORCE SESSION REFRESH HANDLER
// ============================================================================

/**
 * Handle FORCE_SESSION_REFRESH message
 * Called when UI detects session might be stale
 * Forces an immediate refresh attempt
 */
registerHandler(MESSAGE_TYPES.FORCE_SESSION_REFRESH, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling FORCE_SESSION_REFRESH', { correlationId });

  try {
    // Get current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      logger.warn('No session to refresh', { correlationId, error });
      return createResponse(message, MESSAGE_TYPES.SESSION_REFRESH_STATUS, {
        success: false,
        reason: 'NO_SESSION'
      });
    }

    // Attempt refresh
    const result = await attemptTokenRefresh(correlationId);

    if (result.success) {
      logger.info('Session refreshed successfully', { correlationId });
      return createResponse(message, MESSAGE_TYPES.SESSION_REFRESH_STATUS, {
        success: true,
        user: {
          id: session.user.id,
          email: session.user.email
        }
      });
    }

    logger.warn('Session refresh failed', { correlationId, reason: result.reason });
    return createResponse(message, MESSAGE_TYPES.SESSION_REFRESH_STATUS, {
      success: false,
      reason: result.reason,
      message: 'Không thể làm mới phiên. Vui lòng đăng nhập lại.'
    });

  } catch (error) {
    logger.error('Force refresh handler failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      'REFRESH_ERROR',
      'Lỗi làm mới phiên',
      { technicalError: error.message }
    );
  }
});

// ============================================================================
// SESSION REFRESH UTILITY
// ============================================================================

/**
 * Attempt to refresh Supabase session token
 * @param {string} correlationId - For logging
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function attemptTokenRefresh(correlationId) {
  try {
    logger.debug('Attempting token refresh', { correlationId });

    // Use supabase's internal refresh method
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      logger.warn('Token refresh failed', {
        correlationId,
        error: error.message
      });
      return { success: false, reason: error.message };
    }

    if (!data.session) {
      logger.warn('Refresh returned no session', { correlationId });
      return { success: false, reason: 'NO_SESSION_IN_RESPONSE' };
    }

    logger.info('✅ Token refreshed successfully', {
      correlationId,
      userId: data.session.user?.id,
      newExpiryTime: new Date(data.session.expires_at * 1000).toISOString()
    });

    return { success: true };

  } catch (error) {
    logger.error('Token refresh error', {
      correlationId,
      error: error.message
    });
    return { success: false, reason: error.message };
  }
}

// ============================================================================
// BROADCAST UTILITIES
// ============================================================================

/**
 * Broadcast SESSION_ABOUT_TO_EXPIRE to UI
 * Gives user warning before automatic logout
 */
function broadcastSessionAboutToExpire(user, minutesRemaining) {
  try {
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SESSION_ABOUT_TO_EXPIRE,
      correlationId: `session-warning-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        user: {
          id: user.id,
          email: user.email
        },
        minutesRemaining,
        action: 'WARN_USER'
      }
    }).catch(err => {
      if (!err?.message?.includes('Receiving end does not exist')) {
        logger.warn('Failed to broadcast session expiry warning', { error: err?.message });
      }
    });
  } catch (error) {
    logger.warn('Broadcast session expiry warning error', { error: error.message });
  }
}

/**
 * Broadcast SESSION_EXPIRED to UI
 * Indicates user must login again
 */
function broadcastSessionExpired(user) {
  try {
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SESSION_EXPIRED,
      correlationId: `session-expired-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        user: {
          id: user.id,
          email: user.email
        },
        action: 'LOGIN_REQUIRED'
      }
    }).catch(err => {
      if (!err?.message?.includes('Receiving end does not exist')) {
        logger.warn('Failed to broadcast session expired', { error: err?.message });
      }
    });
  } catch (error) {
    logger.warn('Broadcast session expired error', { error: error.message });
  }
}

logger.info('Session manager handlers registered');
