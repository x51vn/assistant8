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
