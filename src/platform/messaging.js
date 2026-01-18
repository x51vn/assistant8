/**
 * @fileoverview Platform Adapter - Chrome Messaging
 * Wraps chrome.runtime.* messaging APIs
 * Enforces message schema validation
 * 
 * Architecture: All message passing MUST go through these adapters
 */

import { createLogger } from '../logger.js';
import { createErrorResponse, ERROR_CODES } from '../types.js';
import { isValidMessage, createErrorResponse as createMsgError, MESSAGE_TYPES } from '../shared/messageSchema.js';

const logger = createLogger('Platform/Messaging');

/**
 * Send message to background script
 * @param {Object} message - Message object (must follow schema)
 * @returns {Promise<Object>} Response from background
 */
export async function sendToBackground(message) {
  const correlationId = message.correlationId || 'unknown';
  logger.debug('Sending to background', { type: message.type, correlationId });
  
  if (!isValidMessage(message)) {
    logger.error('Invalid message format', { message });
    throw new Error('Message does not follow schema');
  }
  
  try {
    const response = await chrome.runtime.sendMessage(message);
    logger.debug('Received response from background', { type: message.type, correlationId });
    return response;
  } catch (error) {
    logger.error('Failed to send message to background', { error, correlationId });
    throw error;
  }
}

/**
 * Send message to specific tab
 * @param {number} tabId - Target tab ID
 * @param {Object} message - Message object (must follow schema)
 * @returns {Promise<Object>} Response from tab
 */
export async function sendToTab(tabId, message) {
  const correlationId = message.correlationId || 'unknown';
  logger.debug('Sending to tab', { tabId, type: message.type, correlationId });
  
  if (!isValidMessage(message)) {
    logger.error('Invalid message format', { message });
    throw new Error('Message does not follow schema');
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    logger.debug('Received response from tab', { tabId, type: message.type, correlationId });
    return response;
  } catch (error) {
    logger.error('Failed to send message to tab', { error, tabId, correlationId });
    throw error;
  }
}

/**
 * Send message to all tabs matching URL pattern
 * @param {string} urlPattern - URL pattern (e.g., 'https://chatgpt.com/*')
 * @param {Object} message - Message object
 * @returns {Promise<Object[]>} Array of responses
 */
export async function sendToMatchingTabs(urlPattern, message) {
  const correlationId = message.correlationId || 'unknown';
  logger.debug('Sending to matching tabs', { urlPattern, type: message.type, correlationId });
  
  if (!isValidMessage(message)) {
    logger.error('Invalid message format', { message });
    throw new Error('Message does not follow schema');
  }
  
  try {
    const tabs = await chrome.tabs.query({ url: urlPattern });
    const promises = tabs.map(tab => 
      chrome.tabs.sendMessage(tab.id, message).catch(err => {
        logger.warn('Failed to send to tab', { tabId: tab.id, error: err.message });
        return null;
      })
    );
    
    const responses = await Promise.all(promises);
    return responses.filter(r => r !== null);
  } catch (error) {
    logger.error('Failed to send to matching tabs', { error, urlPattern });
    throw error;
  }
}

/**
 * Create a long-lived connection (Port)
 * @param {string} name - Connection name
 * @returns {Port} Chrome Port object
 */
export function createConnection(name) {
  logger.debug('Creating connection', { name });
  const port = chrome.runtime.connect({ name });
  
  port.onDisconnect.addListener(() => {
    logger.debug('Connection disconnected', { name });
  });
  
  return port;
}

/**
 * Listen for incoming messages
 * Must be called synchronously at top-level (MV3 requirement!)
 * 
 * @param {Function} handler - Message handler: (message, sender) => Promise<response>
 * @returns {Function} Unsubscribe function
 */
export function onMessage(handler) {
  const listener = (message, sender, sendResponse) => {
    // Validate message schema
    if (!isValidMessage(message)) {
      logger.warn('Received invalid message', { message, sender });
      const errorResponse = createMsgError(
        message || {},
        ERROR_CODES.INVALID_INPUT,
        'Message does not follow schema'
      );
      sendResponse(errorResponse);
      return false;
    }
    
    logger.debug('Received message', { 
      type: message.type, 
      correlationId: message.correlationId,
      from: sender.tab ? `tab:${sender.tab.id}` : 'extension'
    });
    
    // Handle message asynchronously
    (async () => {
      try {
        const response = await handler(message, sender);
        sendResponse(response);
      } catch (error) {
        logger.error('Message handler error', { 
          error, 
          type: message.type,
          correlationId: message.correlationId 
        });
        const errorResponse = createMsgError(
          message,
          ERROR_CODES.UNKNOWN_ERROR,
          error?.message || 'Handler error'
        );
        sendResponse(errorResponse);
      }
    })();
    
    // Return true to keep sendResponse channel open
    return true;
  };
  
  chrome.runtime.onMessage.addListener(listener);
  logger.info('Message listener registered');
  
  // Return unsubscribe function
  return () => {
    chrome.runtime.onMessage.removeListener(listener);
    logger.info('Message listener removed');
  };
}

/**
 * Listen for connections (Port-based)
 * Must be called synchronously at top-level (MV3 requirement!)
 * 
 * @param {Function} handler - Connection handler: (port) => void
 * @returns {Function} Unsubscribe function
 */
export function onConnect(handler) {
  const listener = (port) => {
    logger.debug('Connection established', { name: port.name });
    handler(port);
  };
  
  chrome.runtime.onConnect.addListener(listener);
  logger.info('Connect listener registered');
  
  return () => {
    chrome.runtime.onConnect.removeListener(listener);
    logger.info('Connect listener removed');
  };
}

/**
 * Broadcast message to all extension contexts (not tabs)
 * Useful for state sync across popup/options/sidepanel
 * @param {Object} message - Message to broadcast
 */
export async function broadcastToExtension(message) {
  logger.debug('Broadcasting to extension', { type: message.type });
  
  if (!isValidMessage(message)) {
    throw new Error('Message does not follow schema');
  }
  
  try {
    // Get all extension views
    const views = chrome.extension.getViews();
    views.forEach(view => {
      if (view !== window && view.postMessage) {
        view.postMessage(message, '*');
      }
    });
  } catch (error) {
    logger.error('Broadcast failed', { error });
  }
}
