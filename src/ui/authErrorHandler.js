/**
 * Auth Error Handler Utility
 * 
 * Detects AUTH_REQUIRED/AUTH_EXPIRED errors and triggers automatic logout
 * Ensures UI automatically shows login screen when session becomes invalid
 */

import { logout, checkAuthStatus } from './auth.js';
import { logger } from '../logger.js';

const log = logger.child('AuthErrorHandler');

/**
 * Check if error response is an auth error
 * @param {Object} response - Error response from handler
 * @returns {boolean}
 */
export function isAuthError(response) {
  return response?.errorCode === 'AUTH_REQUIRED' || response?.errorCode === 'AUTH_EXPIRED';
}

/**
 * Handle auth error by logging out user
 * This ensures UI automatically shows login screen when session becomes invalid
 * 
 * @param {Object} response - Error response from handler
 * @param {string} context - Context for logging (e.g., "portfolio", "history")
 * @returns {Promise<void>}
 */
export async function handleAuthError(response, context = 'unknown') {
  try {
    log.info('Auth error detected, logging out user', {
      errorCode: response?.errorCode,
      context,
      errorMessage: response?.errorMessage
    });
    
    // Call logout to trigger SIGNED_OUT broadcast
    const result = await logout();
    
    if (!result.success) {
      log.warn('Logout failed during auth error handling', {
        context,
        error: result.error
      });
    } else {
      log.info('User logged out due to auth error', {
        context
      });
    }
  } catch (error) {
    log.error('Failed to handle auth error', {
      context,
      error: error.message
    });
  }
}

/**
 * Wrap handler call with auto-logout on auth error
 * 
 * Usage:
 * const response = await withAuthErrorHandler(
 *   chrome.runtime.sendMessage(msg),
 *   'portfolio'
 * );
 * 
 * @param {Promise} handlerPromise - Promise from chrome.runtime.sendMessage
 * @param {string} context - Context for logging
 * @returns {Promise<Object>} Response or error response
 */
export async function withAuthErrorHandler(handlerPromise, context = 'unknown') {
  try {
    const response = await handlerPromise;
    
    // Detect auth error and auto-logout
    if (isAuthError(response)) {
      await handleAuthError(response, context);
      return response;
    }
    
    return response;
  } catch (error) {
    log.error('Handler call failed', {
      context,
      error: error.message
    });
    throw error;
  }
}
