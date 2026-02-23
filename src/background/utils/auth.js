/**
 * @fileoverview Authentication Helper Utility
 * Validates user authentication and extracts user_id for handlers
 * 
 * Purpose: Enforce authentication checks in all Supabase CRUD handlers
 * Ticket: GPT-005
 */

import { supabase } from '../../supabaseConfig.js';
import { createErrorResponse } from '../../shared/messageSchema.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { logger } from '../../logger.js';
import { supabaseWithRetry } from './supabaseRetry.js';

/**
 * Require authentication and return user ID
 * 
 * This function should be called at the start of every handler that accesses
 * user-specific data in Supabase. It enforces authentication and provides
 * fail-fast behavior with user-friendly error messages.
 * 
 * Flow:
 * 1. Call supabase.auth.getUser() to check session (WITH RETRY)
 * 2. If user exists → return user.id (string UUID)
 * 3. If no user → throw formatted error response
 * 4. If error occurs → throw formatted error response
 * 
 * @param {Object} message - Original message from UI (for correlationId)
 * @param {string} message.correlationId - Request correlation ID for tracing
 * @returns {Promise<string>} User ID (UUID string)
 * @throws {Object} Error response object (via createErrorResponse)
 * 
 * @example
 * // In a handler
 * registerHandler(MESSAGE_TYPES.PORTFOLIO_GET, async (message) => {
 *   try {
 *     const userId = await requireAuth(message);
 *     
 *     const { data, error } = await supabase
 *       .from('portfolio')
 *       .select('*')
 *       .eq('user_id', userId);
 *     
 *     // ... rest of handler
 *   } catch (error) {
 *     // If error has errorCode, it's from requireAuth
 *     if (error.errorCode) {
 *       return error; // Already formatted
 *     }
 *     // ... handle other errors
 *   }
 * });
 */
export async function requireAuth(message) {
  const { correlationId = null } = message || {};
  
  try {
    logger.debug('Checking authentication', { correlationId });
    
    // Get current user from Supabase session WITH RETRY
    // This handles transient errors like network issues
    const result = await supabaseWithRetry(
      async () => {
        const authResult = await supabase.auth.getUser();
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
    
    // Extract user from result
    const { data: { user }, error } = result;
    
    // Handle authentication errors
    // Note: With retry logic, we shouldn't get here unless it's a client error (4xx)
    if (error) {
      logger.warn('Auth check failed after retries', {
        correlationId,
        errorCode: error.code,
        errorStatus: error.status,
        errorMessage: error.message
      });
      
      // Check if it's "Auth session missing" (no token)
      if (error.message?.includes('Auth session missing') || error.status === 400) {
        throw createErrorResponse(
          message,
          ERROR_CODES.AUTH_REQUIRED,
          getUserFriendlyMessage(ERROR_CODES.AUTH_REQUIRED),
          { technicalError: error.message }
        );
      }
      
      // Token expired or invalid (should trigger re-login)
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_EXPIRED,
        getUserFriendlyMessage(ERROR_CODES.AUTH_EXPIRED),
        { technicalError: error.message }
      );
    }
    
    // No user in session
    if (!user) {
      logger.warn('No authenticated user', { correlationId });
      
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_REQUIRED,
        getUserFriendlyMessage(ERROR_CODES.AUTH_REQUIRED),
        { technicalError: 'No user in session' }
      );
    }
    
    // No user ID (shouldn't happen, but defensive check)
    if (!user.id) {
      logger.error('User exists but no ID', {
        correlationId,
        userEmail: user.email
      });
      
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        getUserFriendlyMessage(ERROR_CODES.AUTH_ERROR),
        { technicalError: 'User ID missing from session' }
      );
    }
    
    // Success - return user ID
    logger.debug('Authentication successful', {
      correlationId,
      userId: user.id
    });
    
    return user.id;
    
  } catch (error) {
    // If error is already a formatted response (has errorCode), re-throw
    if (error.errorCode) {
      throw error;
    }
    
    // Safely extract error message
    const errorMessage = error?.message || error?.error?.message || String(error) || 'Unknown error';
    const errorStatus = error?.status || error?.statusCode;
    const errorCode = error?.code;
    
    // Handle Supabase auth-specific errors
    if (errorMessage.includes('Auth session missing')) {
      logger.warn('No auth session found', { correlationId });
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_REQUIRED,
        getUserFriendlyMessage(ERROR_CODES.AUTH_REQUIRED),
        { technicalError: errorMessage }
      );
    }
    
    // JWT or session expiration errors → AUTH_EXPIRED (trigger re-login)
    if (errorCode === 'invalid_jwt' || errorCode === 'session_expired' || errorCode === 'jwt_error' ||
        errorMessage.includes('JWT') || errorMessage.includes('Session expired')) {
      logger.warn('Auth token expired or invalid', { correlationId, errorCode, errorMessage });
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_EXPIRED,
        getUserFriendlyMessage(ERROR_CODES.AUTH_EXPIRED),
        { technicalError: errorMessage }
      );
    }

    // Invalid API key (configuration error)
    if (errorMessage.includes('Invalid API key') || errorStatus === 401) {
      logger.error('Invalid Supabase credentials', { 
        correlationId,
        errorMessage,
        hint: 'Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
      });
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_ERROR,
        'Lỗi cấu hình Supabase. Vui lòng kiểm tra API key.',
        { 
          technicalError: errorMessage,
          hint: 'Invalid Supabase credentials. Check .env file.'
        }
      );
    }
    
    if (errorStatus === 400 || errorCode === '400') {
      logger.warn('Auth session invalid (400 error)', { correlationId });
      throw createErrorResponse(
        message,
        ERROR_CODES.AUTH_REQUIRED,
        getUserFriendlyMessage(ERROR_CODES.AUTH_REQUIRED),
        { technicalError: errorMessage }
      );
    }
    
    // Unexpected error during auth check
    logger.error('Unexpected auth error', {
      correlationId,
      errorMessage,
      errorStatus,
      errorCode,
      errorType: typeof error,
      errorKeys: error ? Object.keys(error) : [],
      errorStack: error?.stack
    });
    
    throw createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      getUserFriendlyMessage(ERROR_CODES.AUTH_ERROR),
      { 
        technicalError: errorMessage,
        errorStatus,
        errorCode
      }
    );
  }
}

/**
 * Get current user ID without throwing
 * Returns null if not authenticated
 * 
 * Use this for optional auth checks or logging contexts
 * For mandatory auth, use requireAuth() instead
 * 
 * @returns {Promise<string|null>} User ID or null
 * 
 * @example
 * const userId = await getCurrentUserId();
 * logger.info('Operation performed', { userId: userId || 'anonymous' });
 */
export async function getCurrentUserId() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user.id;
  } catch (error) {
    logger.error('Failed to get current user ID', {
      errorMessage: error.message
    });
    return null;
  }
}

/**
 * Check if user is authenticated without side effects
 * Returns boolean instead of throwing
 * 
 * Use this for conditional logic, not for enforcing auth
 * For mandatory auth, use requireAuth() instead
 * 
 * @returns {Promise<boolean>} True if authenticated
 * 
 * @example
 * const isAuth = await isAuthenticated();
 * if (isAuth) {
 *   // Show user-specific UI
 * } else {
 *   // Show login prompt
 * }
 */
export async function isAuthenticated() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && !!user;
  } catch (error) {
    return false;
  }
}

/**
 * Get current user object (for detailed info)
 * Returns null if not authenticated
 * 
 * Use this when you need full user details (email, metadata, etc.)
 * For most handlers, requireAuth() returning just user.id is sufficient
 * 
 * @returns {Promise<Object|null>} User object or null
 * 
 * @example
 * const user = await getCurrentUser();
 * if (user) {
 *   logger.info('User email', { email: user.email });
 * }
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user;
  } catch (error) {
    logger.error('Failed to get current user', {
      errorMessage: error.message
    });
    return null;
  }
}
