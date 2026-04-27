/**
 * @fileoverview ErrorFactory — Layer 5 canonical error envelope
 *
 * Provides standardized error creation helpers used by handlers and middleware.
 * All errors share the same canonical envelope shape:
 *
 *   {
 *     v, type, correlationId, timestamp, inResponseTo,
 *     error: { code, message, details },
 *     // Legacy aliases (temporary backward compat):
 *     errorCode, errorMessage
 *   }
 *
 * Usage:
 *   import { ErrorFactory } from '../shared/contracts/ErrorFactory.js';
 *   return ErrorFactory.validation(message, 'Field X required', { field: 'X' });
 *   return ErrorFactory.auth(message);
 *   return ErrorFactory.notFound(message, 'Item not found');
 *   return ErrorFactory.internal(message, error);
 */

import { createErrorResponse, MESSAGE_TYPES } from '../messageSchema.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../errorCodes.js';

export const ErrorFactory = {

  /**
   * Validation error (bad request payload).
   * @param {object} message - original message
   * @param {string} [detail]  - specific validation issue
   * @param {*}      [extra]   - extra technical details
   */
  validation(message, detail, extra) {
    const msg = detail || getUserFriendlyMessage(ERROR_CODES.INVALID_INPUT);
    return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, msg, extra ?? null);
  },

  /**
   * Auth required or session expired.
   * @param {object} message
   * @param {string} [code] - default AUTH_REQUIRED
   */
  auth(message, code = ERROR_CODES.AUTH_REQUIRED) {
    return createErrorResponse(message, code, getUserFriendlyMessage(code));
  },

  /**
   * Resource not found.
   * @param {object} message
   * @param {string} [detail]
   */
  notFound(message, detail) {
    const msg = detail || getUserFriendlyMessage(ERROR_CODES.NOT_FOUND);
    return createErrorResponse(message, ERROR_CODES.NOT_FOUND, msg);
  },

  /**
   * Duplicate entry conflict.
   * @param {object} message
   * @param {string} [detail]
   */
  conflict(message, detail) {
    const msg = detail || getUserFriendlyMessage(ERROR_CODES.DUPLICATE_ENTRY);
    return createErrorResponse(message, ERROR_CODES.DUPLICATE_ENTRY, msg);
  },

  /**
   * Internal/infrastructure error.
   * @param {object}    message
   * @param {Error|*}   error  - raw error
   * @param {string}    [code] - default SUPABASE_ERROR
   */
  internal(message, error, code = ERROR_CODES.SUPABASE_ERROR) {
    const msg = getUserFriendlyMessage(code);
    const detail = error instanceof Error
      ? { technicalError: error.message }
      : (error ? { technicalError: String(error) } : null);
    return createErrorResponse(message, code, msg, detail);
  },

  /**
   * Network/connectivity error.
   * @param {object} message
   */
  network(message) {
    return createErrorResponse(
      message,
      ERROR_CODES.NETWORK_ERROR,
      getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
    );
  },

  /**
   * Contract/envelope validation mismatch (egress).
   * Used when egress validation finds a response does not match contract.
   * @param {object}   message
   * @param {string[]} errors - list of validation error strings
   */
  contractMismatch(message, errors) {
    return createErrorResponse(
      message,
      ERROR_CODES.UNKNOWN_ERROR,
      'Internal response contract mismatch',
      { contractErrors: errors }
    );
  },

  /**
   * Re-wrap a pre-formatted error response (already has errorCode).
   * Some older helpers return a response object rather than throwing.
   * Passthrough for those cases.
   * @param {object} errorResponse
   * @returns {object} unchanged
   */
  passthrough(errorResponse) {
    return errorResponse;
  },
};
