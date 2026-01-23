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

/**
 * Require authentication and return user ID
 * 
 * This function should be called at the start of every handler that accesses
 * user-specific data in Supabase. It enforces authentication and provides
 * fail-fast behavior with user-friendly error messages.
 * 
 * Flow:
 * 1. Call supabase.auth.getUser() to check session
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
    
    // Get current user from Supabase session
    const { data: { user }, error } = await supabase.auth.getUser();
    
    // Handle authentication errors
    if (error) {
      logger.warn('Auth check failed', {
        correlationId,
        errorCode: error.code,
        errorMessage: error.message
      });
      
      // Token expired or invalid
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
    
    // Unexpected error during auth check
    logger.error('Unexpected auth error', {
      correlationId,
      errorMessage: error.message,
      errorStack: error.stack
    });
    
    throw createErrorResponse(
      message,
      ERROR_CODES.AUTH_ERROR,
      getUserFriendlyMessage(ERROR_CODES.AUTH_ERROR),
      { technicalError: error.message }
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
