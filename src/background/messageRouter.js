/**
 * @fileoverview Message Router for Background Service Worker
 * Central dispatcher for all incoming messages
 * 
 * Architecture Pattern: Command Pattern + Strategy Pattern
 * - Each message type maps to a handler function
 * - Handlers are registered in a map
 * - Router dispatches to appropriate handler
 * 
 * MV3 Critical: This must be imported and setup SYNCHRONOUSLY at top-level
 */

import { createLogger } from '../logger.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse as createMsgError } from '../shared/messageSchema.js';
import { ERROR_CODES } from '../types.js';
import { validateHeader, validateRequest } from '../shared/contracts/ValidatorEngine.js';

const logger = createLogger('MessageRouter');

/**
 * Message handler registry
 * Map<MessageType, HandlerFunction>
 */
const handlers = new Map();

/**
 * Register a message handler
 * @param {string} messageType - Message type from MESSAGE_TYPES
 * @param {Function} handler - Handler function: (message, sender) => Promise<response>
 */
export function registerHandler(messageType, handler) {
  if (handlers.has(messageType)) {
    logger.warn('Overwriting existing handler', { messageType });
  }
  
  handlers.set(messageType, handler);
  logger.debug('Handler registered', { messageType });
}

/**
 * Unregister a message handler
 * @param {string} messageType - Message type
 */
export function unregisterHandler(messageType) {
  const existed = handlers.delete(messageType);
  if (existed) {
    logger.debug('Handler unregistered', { messageType });
  }
}

/**
 * Route incoming message to appropriate handler
 * This is the main entry point called by messaging platform adapter
 * 
 * @param {Object} message - Incoming message (already validated by platform layer)
 * @param {Object} sender - Message sender info
 * @returns {Promise<Object>} Response message
 */
export async function route(message, sender) {
  const { type, correlationId } = message;
  
  logger.debug('Routing message', { 
    type, 
    correlationId,
    from: sender.tab ? `tab:${sender.tab.id}` : 'extension'
  });

  // ── Layer 2: Ingress validation ──────────────────────────────────────────
  // 2a: Header validation (always strict — required for routing/tracing)
  const headerResult = validateHeader(message);
  if (!headerResult.valid) {
    logger.warn('Ingress header validation failed', { type, correlationId, errors: headerResult.errors });
    return createMsgError(
      message,
      ERROR_CODES.INVALID_INPUT,
      `Invalid message header: ${headerResult.errors.join('; ')}`
    );
  }

  // 2b: Payload validation against registered contract
  const payloadResult = validateRequest(type, message.data);
  if (!payloadResult.valid) {
    if (payloadResult.mode === 'strict') {
      logger.warn('Ingress payload validation failed (strict)', { type, correlationId, errors: payloadResult.errors });
      return createMsgError(
        message,
        ERROR_CODES.INVALID_INPUT,
        `Validation failed: ${payloadResult.errors.join('; ')}`
      );
    } else {
      // warn-only: log but allow through
      logger.warn('Ingress payload contract mismatch (warn-only)', { type, correlationId, errors: payloadResult.errors });
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Check if handler exists
  const handler = handlers.get(type);
  
  if (!handler) {
    logger.warn('No handler for message type', { type, correlationId });
    return createMsgError(
      message,
      ERROR_CODES.UNKNOWN_ERROR,
      `No handler registered for message type: ${type}`
    );
  }
  
  // Execute handler
  try {
    const startTime = Date.now();
    const response = await handler(message, sender);
    const duration = Date.now() - startTime;
    
    logger.debug('Handler completed', { 
      type, 
      correlationId, 
      duration: `${duration}ms` 
    });
    
    // Warn on slow handlers (>5s)
    if (duration > 5000) {
      logger.warn('Slow handler detected', { type, correlationId, duration });
    }
    
    return response;
  } catch (error) {
    logger.error('Handler error', { 
      type, 
      correlationId, 
      error: error?.message,
      stack: error?.stack
    });
    
    return createMsgError(
      message,
      ERROR_CODES.UNKNOWN_ERROR,
      `Handler error: ${error?.message || 'Unknown error'}`,
      { stack: error?.stack }
    );
  }
}

/**
 * Get statistics about registered handlers
 * @returns {Object} Stats
 */
export function getStats() {
  return {
    handlerCount: handlers.size,
    registeredTypes: Array.from(handlers.keys())
  };
}

/**
 * Clear all handlers (useful for testing)
 */
export function clearHandlers() {
  const count = handlers.size;
  handlers.clear();
  logger.info('All handlers cleared', { count });
}

/**
 * Default handlers that should always be registered
 */

/**
 * PING handler - health check
 */
registerHandler(MESSAGE_TYPES.PING, async (message) => {
  return createResponse(message, MESSAGE_TYPES.PONG, {
    timestamp: Date.now(),
    stats: getStats()
  });
});

logger.info('Message router initialized', getStats());
