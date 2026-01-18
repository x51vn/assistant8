/**
 * @fileoverview State Management Handlers
 * Handles storage/state operations through platform adapter
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { storageGet, storageSet, storageRemove } from '../../platform/storage.js';

const logger = createLogger('Handlers/State');

/**
 * Handle STATE_GET
 */
registerHandler(MESSAGE_TYPES.STATE_GET, async (message, sender) => {
  const { keys, area } = message;
  
  logger.info('Handling STATE_GET', { 
    correlationId: message.correlationId,
    keys 
  });
  
  const result = await storageGet(keys, area);
  
  if (!result.success) {
    return createResponse(message, MESSAGE_TYPES.ERROR, {
      error: result.error
    });
  }
  
  return createResponse(message, MESSAGE_TYPES.STATE_UPDATED, {
    data: result.data
  });
});

/**
 * Handle STATE_SET
 */
registerHandler(MESSAGE_TYPES.STATE_SET, async (message, sender) => {
  const { items, area } = message;
  
  logger.info('Handling STATE_SET', { 
    correlationId: message.correlationId,
    keys: Object.keys(items || {})
  });
  
  const result = await storageSet(items, area);
  
  if (!result.success) {
    return createResponse(message, MESSAGE_TYPES.ERROR, {
      error: result.error
    });
  }
  
  return createResponse(message, MESSAGE_TYPES.STATE_UPDATED, {
    data: result.data
  });
});

logger.info('State handlers registered');
