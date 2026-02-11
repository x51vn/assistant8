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
// INTERNAL SESSION CHECK (Direct alarm invocation)
// ============================================================================

/**
 * INTERNAL: Perform session check without needing message response
 * Called directly by alarms, guaranteed to execute regardless of UI state
 * Does NOT rely on chrome.runtime.sendMessage() delivery
 * 
 * @param {string} correlationId - For logging
 * @returns {Promise<Object>} Status result
 */
export async function _performSessionCheck(correlationId) {
  const now = Date.now();
  
  // Skip if checked very recently (< 30s to allow more frequent checks)
  if (now - lastSessionCheckTime < 30000) {
    logger.debug('Session check skipped (throttled)', { correlationId });
    return { status: 'throttled' };
  }
  
  lastSessionCheckTime = now;
  
  try {
    // Get current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      logger.warn('No session found during check', { correlationId, error: error?.message });
      return { status: 'no_session', authenticated: false };
    }

    // Session exists - check expiration
    const expiresAt = session.expires_at * 1000;
    const timeUntilExpiry = expiresAt - now;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
    
    logger.debug('Session health check', { 
      correlationId, 
      minutesUntilExpiry,
      userId: session.user?.id 
    });
    
    // Case 1: Token already expired
    if (timeUntilExpiry < 0) {
      logger.warn('Token expired, attempting emergency refresh', { correlationId });
      const refreshResult = await attemptTokenRefresh(correlationId);
      
      if (refreshResult.success) {
        logger.info('Emergency refresh succeeded', { correlationId });
        return { status: 'emergency_refreshed', authenticated: true };
      }
      
      // Refresh failed - session is dead
      logger.error('Emergency refresh failed - session expired', { correlationId });
      broadcastSessionExpired(session.user);
      return { status: 'expired', authenticated: false };
    }
    
    // Case 2: Token expiring soon (< 2 minutes) - proactive refresh
    if (timeUntilExpiry < 2 * 60000) {
      logger.info('Token expiring soon, proactive refresh', { 
        correlationId,
        minutesUntilExpiry 
      });
      
      const refreshResult = await attemptTokenRefresh(correlationId);
      if (refreshResult.success) {
        logger.info('Proactive refresh succeeded', { correlationId });
        return { status: 'proactive_refreshed', authenticated: true };
      }
      
      logger.warn('Proactive refresh failed, will retry next cycle', { 
        correlationId,
        minutesUntilExpiry 
      });
      return { status: 'refresh_pending', authenticated: true, minutesUntilExpiry };
    }
    
    // Case 3: Token healthy
    logger.debug('Session healthy', { correlationId, minutesUntilExpiry });
    return { status: 'healthy', authenticated: true, minutesUntilExpiry };

  } catch (error) {
    logger.error('Session check failed', { correlationId, error: error.message });
    return { status: 'error', error: error.message };
  }
}

// ============================================================================
// SESSION CHECK HANDLER (UI requests)
// ============================================================================

/**
 * Handle SESSION_CHECK message from UI
 * Delegates to internal _performSessionCheck and formats response
 */
registerHandler(MESSAGE_TYPES.SESSION_CHECK, async (message) => {
  const correlationId = message.correlationId;
  logger.debug('Handling SESSION_CHECK from UI', { correlationId });
  
  try {
    const result = await _performSessionCheck(correlationId);
    
    // Map internal status to UI-friendly format
    return createResponse(message, MESSAGE_TYPES.SESSION_STATUS, {
      ...result,
      action: result.authenticated ? null : 'LOGIN_REQUIRED'
    });
  } catch (error) {
    logger.error('Session check handler failed', { correlationId, error: error.message });
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
