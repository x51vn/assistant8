/**
 * @fileoverview Error Management Handlers
 * Handles error tracking and retrospective operations
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/Errors');

const ERROR_LIST_KEY = 'errorList';

/**
 * Handle ERROR_ADD
 * Add new error to tracking list
 */
registerHandler(MESSAGE_TYPES.ERROR_ADD, async (message, sender) => {
  const { title, description, type, severity } = message.payload || {};
  
  logger.info('Handling ERROR_ADD', { 
    correlationId: message.correlationId,
    title,
    type 
  });
  
  const errorData = {
    id: Date.now().toString(),
    title: title || 'Lỗi không xác định',
    description: description || '',
    type: type || 'general',
    severity: severity || 'medium',
    timestamp: Date.now()
  };
  
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  errors.push(errorData);
  
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: errors });
  
  return createResponse(message, MESSAGE_TYPES.ERROR_ADDED, {
    error: errorData
  });
});

/**
 * Handle ERROR_UPDATE
 * Update existing error
 */
registerHandler(MESSAGE_TYPES.ERROR_UPDATE, async (message, sender) => {
  const { errorId, title, description, type, severity } = message.payload || {};
  
  logger.info('Handling ERROR_UPDATE', { 
    correlationId: message.correlationId,
    errorId 
  });
  
  if (!errorId) {
    return createErrorResponse(message, 'MISSING_ERROR_ID', 'Missing errorId parameter');
  }
  
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  
  const index = errors.findIndex(e => e.id === errorId);
  if (index === -1) {
    return createErrorResponse(message, 'ERROR_NOT_FOUND', 'Error not found');
  }
  
  // Update fields
  if (title !== undefined) errors[index].title = title;
  if (description !== undefined) errors[index].description = description;
  if (type !== undefined) errors[index].type = type;
  if (severity !== undefined) errors[index].severity = severity;
  errors[index].updatedAt = Date.now();
  
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: errors });
  
  return createResponse(message, MESSAGE_TYPES.ERROR_UPDATED, {
    error: errors[index]
  });
});

/**
 * Handle ERROR_DELETE
 * Delete error from tracking list
 */
registerHandler(MESSAGE_TYPES.ERROR_DELETE, async (message, sender) => {
  const { errorId } = message.payload || {};
  
  logger.info('Handling ERROR_DELETE', { 
    correlationId: message.correlationId,
    errorId 
  });
  
  if (!errorId) {
    return createErrorResponse(message, 'MISSING_ERROR_ID', 'Missing errorId parameter');
  }
  
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  let errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  
  errors = errors.filter(e => e.id !== errorId);
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: errors });
  
  return createResponse(message, MESSAGE_TYPES.ERROR_DELETED, {
    success: true
  });
});

/**
 * Handle ERROR_GET_ALL
 * Get all tracked errors
 */
registerHandler(MESSAGE_TYPES.ERROR_GET_ALL, async (message, sender) => {
  logger.info('Handling ERROR_GET_ALL', { correlationId: message.correlationId });
  
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  
  return createResponse(message, MESSAGE_TYPES.ERROR_LIST, {
    errors
  });
});

/**
 * Handle ERROR_CLEAR_ALL
 * Clear all errors
 */
registerHandler(MESSAGE_TYPES.ERROR_CLEAR_ALL, async (message, sender) => {
  logger.info('Handling ERROR_CLEAR_ALL', { correlationId: message.correlationId });
  
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: [] });
  
  return createResponse(message, MESSAGE_TYPES.ERROR_ALL_CLEARED, {
    success: true
  });
});

logger.info('Error handlers registered');
