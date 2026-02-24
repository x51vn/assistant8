/**
 * @fileoverview Type definitions and standardized response formats
 * Centralized type system for better maintainability
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether the operation succeeded
 * @property {*} [data] - Response data if successful
 * @property {ErrorDetail} [error] - Error details if failed
 */

/**
 * @typedef {Object} ErrorDetail
 * @property {string} code - Error code for programmatic handling
 * @property {string} message - Human-readable error message
 * @property {string} [context] - Additional context about where/why error occurred
 * @property {*} [details] - Additional error details
 */

/**
 * @typedef {Object} ChatSession
 * @property {string|null} chatId - ChatGPT conversation ID
 * @property {string|null} chatUrl - Full URL to the chat
 */

/**
 * @typedef {Object} SendInputOptions
 * @property {boolean} [createNewChat=true] - Whether to create a new chat session
 * @property {string} [runId] - Optional run identifier for tracking
 * @property {boolean} [reviewOnly=false] - If true, only fill prompt without sending
 */

/**
 * @typedef {Object} GetOutputOptions
 * @property {boolean} [wait=true] - Whether to wait for response completion
 * @property {number} [timeoutMs=900000] - Max time to wait in milliseconds
 * @property {number} [stableMs=1500] - How long response must be stable before considering complete
 */

/**
 * @typedef {Object} TabResult
 * @property {number} tabId - Chrome tab ID
 * @property {boolean} isNew - Whether this is a newly created tab
 * @property {ErrorDetail} [error] - Error if tab couldn't be ensured
 */

/**
 * @typedef {Object} WaitForContentScriptOptions
 * @property {number} [maxRetries=10] - Maximum number of retry attempts
 * @property {number} [retryDelay=500] - Delay between retries in milliseconds
 */

/**
 * Standard error codes used throughout the application
 */
/**
 * Standard error codes used throughout the application
 * Use these codes for programmatic error handling
 * @const {Object.<string, string>}
 */
export const ERROR_CODES = {
  // Communication errors
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  CONTENT_SCRIPT_NOT_READY: 'CONTENT_SCRIPT_NOT_READY',
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  
  // Operation errors
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  INPUT_SEND_FAILED: 'INPUT_SEND_FAILED',
  OUTPUT_FETCH_FAILED: 'OUTPUT_FETCH_FAILED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',  // getOutput called while user navigated to different session
  TIMEOUT: 'TIMEOUT',
  OPERATION_FAILED: 'OPERATION_FAILED',
  
  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  EMPTY_PROMPT: 'EMPTY_PROMPT',
  INVALID_TAB_ID: 'INVALID_TAB_ID',
  
  // Authentication errors
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Storage errors
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  
  // Unknown/Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Create a standardized data response
 * @template T
 * @param {T} data - The response data
 * @returns {ApiResponse}
 */
export function createDataResponse(data) {
  return {
    success: true,
    data
  };
}

/**
 * Create a standardized API error response
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {string} [context] - Additional context
 * @param {*} [details] - Additional details
 * @returns {ApiResponse}
 */
export function createApiErrorResponse(code, message, context, details) {
  return {
    success: false,
    error: {
      code,
      message,
      context,
      details
    }
  };
}

/**
 * Convert exception to error response
 * @param {Error} error - The caught error
 * @param {string} [context] - Where the error occurred
 * @returns {ApiResponse}
 */
export function exceptionToApiErrorResponse(error, context) {
  const message = error?.message || String(error);
  return createApiErrorResponse(
    ERROR_CODES.UNKNOWN_ERROR,
    message,
    context,
    error?.stack
  );
}
