/**
 * @fileoverview Supabase Retry Utility
 * Handles transient errors with exponential backoff for Supabase operations
 * 
 * Implementation: docs/ARCHITECTURE.md section "Retry Pattern with Exponential Backoff"
 * Ticket: GPT-004
 */

import { MAX_RETRIES, RETRY_DELAY_BASE_MS } from '../../shared/appConstants.js';
import { isRetryableError } from '../../shared/errorCodes.js';
import { logger } from '../../logger.js';

/**
 * Wraps a Supabase operation with retry logic for transient errors
 * 
 * Retry Policy:
 * - Retry network errors (fetch failures, timeouts)
 * - Retry 5xx server errors (Supabase/Postgres transient issues)
 * - NO retry for 4xx client errors (bad request, auth, not found)
 * - Exponential backoff: delay = RETRY_DELAY_BASE_MS * (2^attemptNumber)
 * 
 * @param {Function} operation - Async function that performs Supabase operation
 * @param {Object} options - Configuration options
 * @param {string} [options.operationName] - Operation name for logging
 * @param {string} [options.correlationId] - Request correlation ID for tracing
 * @param {number} [options.maxRetries=MAX_RETRIES] - Maximum retry attempts
 * @returns {Promise<*>} Result of successful operation
 * @throws {Error} Last error after all retries exhausted
 * 
 * @example
 * const data = await supabaseWithRetry(
 *   async () => {
 *     const { data, error } = await supabase
 *       .from('portfolio')
 *       .select('*');
 *     if (error) throw error;
 *     return data;
 *   },
 *   { 
 *     operationName: 'getPortfolio',
 *     correlationId: message.correlationId 
 *   }
 * );
 */
export async function supabaseWithRetry(operation, options = {}) {
  const {
    operationName = 'supabaseOperation',
    correlationId = null,
    maxRetries = MAX_RETRIES
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Execute the operation
      const result = await operation();
      
      // Log success if retried
      if (attempt > 0) {
        logger.info(
          `${operationName} succeeded after ${attempt} retry(ies)`,
          { correlationId, attempt }
        );
      }
      
      return result;

    } catch (error) {
      lastError = error;
      
      // Determine if error is retryable
      const shouldRetry = determineIfRetryable(error);
      const isLastAttempt = attempt === maxRetries - 1;

      // Log the error
      const logContext = {
        operationName,
        correlationId,
        attempt: attempt + 1,
        maxRetries,
        errorCode: error.code,
        errorStatus: error.status,
        errorMessage: error.message,
        willRetry: shouldRetry && !isLastAttempt
      };

      if (shouldRetry && !isLastAttempt) {
        logger.warn(`${operationName} failed, will retry`, logContext);
      } else {
        logger.error(`${operationName} failed`, logContext);
      }

      // Check retry conditions
      if (!shouldRetry) {
        // Client error (4xx) or specific non-retryable error
        throw error;
      }

      if (isLastAttempt) {
        // Exhausted all retries
        throw error;
      }

      // Calculate exponential backoff delay
      const delayMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
      
      logger.debug(`Waiting ${delayMs}ms before retry ${attempt + 1}/${maxRetries}`, {
        correlationId,
        delayMs
      });

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but throw last error as fallback
  throw lastError;
}

/**
 * Convenience wrapper for common Supabase query pattern
 * Automatically checks for error and throws
 * 
 * @param {Function} queryFn - Async function that returns Supabase query result {data, error}
 * @param {Object} options - Same as supabaseWithRetry options
 * @returns {Promise<*>} Query data
 * @throws {Error} Supabase error or last retry error
 * 
 * @example
 * const portfolio = await supabaseQuery(
 *   () => supabase.from('portfolio').select('*'),
 *   { operationName: 'getPortfolio', correlationId: '123' }
 * );
 */
export async function supabaseQuery(queryFn, options = {}) {
  return supabaseWithRetry(
    async () => {
      const { data, error } = await queryFn();
      if (error) {
        throw error;
      }
      return data;
    },
    options
  );
}

/**
 * Helper to determine if an error occurred during a Supabase operation
 * Used for error type checking in handlers
 * 
 * @param {*} error - Error object to check
 * @returns {boolean} True if error is from Supabase/Postgres
 */
export function isSupabaseError(error) {
  return !!(
    error &&
    (
      error.code || // Postgres error codes
      error.message?.includes('supabase') ||
      error.message?.includes('postgres') ||
      error.hint || // Postgres hint field
      error.details // Postgres details field
    )
  );
}

/**
 * Determine if an error should be retried
 * Checks both error object properties and error codes
 * 
 * @param {*} error - Error object to check
 * @returns {boolean} True if error is transient and should be retried
 */
function determineIfRetryable(error) {
  if (!error) return false;

  // Network errors (fetch failures, timeouts)
  if (
    error.message?.toLowerCase().includes('network') ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('timeout') ||
    error.message?.toLowerCase().includes('connection')
  ) {
    return true;
  }

  // Auth session errors - NO RETRY (user needs to login)
  if (
    error.message?.includes('Auth session missing') ||
    error.message?.includes('session_not_found') ||
    error.message?.includes('Invalid login credentials') ||
    error.message?.includes('Email not confirmed')
  ) {
    return false;
  }

  // HTTP status codes
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    
    // Client errors (4xx) - NO RETRY
    if (status >= 400 && status < 500) {
      return false;
    }
    
    // Server errors (5xx) - RETRY
    if (status >= 500) {
      return true;
    }
  }

  // Postgres error codes (PGRST prefix from PostgREST)
  if (error.code) {
    // PGRST116 = Not Found - NO RETRY
    if (error.code === 'PGRST116') {
      return false;
    }

    // PGRST205 = Table not in schema cache - NO RETRY (table doesn't exist)
    if (error.code === 'PGRST205') {
      return false;
    }

    // PGRST301 = Auth error - NO RETRY
    if (error.code === 'PGRST301') {
      return false;
    }

    // Other Postgres errors might be transient (locks, connections)
    return true;
  }

  // Check if error code is in retryable list (from errorCodes.js)
  if (typeof error === 'string') {
    return isRetryableError(error);
  }

  // Default: don't retry unknown errors
  return false;
}

