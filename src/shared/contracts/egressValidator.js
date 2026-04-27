/**
 * @fileoverview Egress validation helper — Layer 6 of I/O standardization
 *
 * Validates a response payload against the registered contract before it
 * leaves the handler. Honors contract mode:
 *   'warn-only' → log mismatch, return original response unchanged
 *   'strict'    → return canonical error response instead
 *
 * Usage (in handler or router):
 *   import { validateEgress } from '../shared/contracts/egressValidator.js';
 *   const finalResponse = validateEgress(originalMessage, responseType, response, logger);
 *   return finalResponse;
 */

import { validateResponse } from './ValidatorEngine.js';
import { ErrorFactory } from './ErrorFactory.js';

/**
 * Validate and optionally gate a response payload against the registered contract.
 *
 * @param {object} originalMessage  - the request message (for correlation id in error responses)
 * @param {string} responseType     - MESSAGE_TYPES response constant
 * @param {object} response         - full response object to validate
 * @param {object} [logger]         - optional logger; logs warnings on mismatch
 * @returns {object} response (unchanged) or canonical contract error response
 */
export function validateEgress(originalMessage, responseType, response, logger) {
  const result = validateResponse(responseType, response);

  if (result.valid) return response;

  const correlationId = originalMessage?.correlationId;

  if (result.mode === 'strict') {
    if (logger) {
      logger.error('Egress validation failed (strict) — replacing response with contract error', {
        responseType, correlationId, errors: result.errors
      });
    }
    return ErrorFactory.contractMismatch(originalMessage, result.errors);
  }

  // warn-only: log and pass through
  if (logger) {
    logger.warn('Egress contract mismatch (warn-only)', {
      responseType, correlationId, errors: result.errors
    });
  }
  return response;
}
