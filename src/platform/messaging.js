/**
 * @fileoverview Platform Adapter - Chrome Messaging
 * Wraps chrome.runtime.* messaging APIs
 * Enforces message schema validation
 * 
 * Architecture: All message passing MUST go through these adapters
 */

import { createLogger } from '../logger.js';
import { ERROR_CODES } from '../shared/errorCodes.js';
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
    // X51LABS-85: Filter both null and undefined
    return responses.filter(r => r != null);
  } catch (error) {
    logger.error('Failed to send to matching tabs', { error, urlPattern });
    throw error;
  }
}

/**
 * X51LABS-78: Create a long-lived connection (Port) with keepalive
 * For operations >5min that exceed 5min message timeout
 * @param {string} name - Connection name
 * @param {object} [options] - Options
 * @param {number} [options.keepaliveIntervalMs=240000] - Keepalive ping interval (default 4min)
 * @param {function} [options.onMessage] - Message handler
 * @param {function} [options.onDisconnect] - Disconnect handler
 * @returns {{port: Port, cleanup: function}} Port and cleanup function
 */
export function createConnection(name, options = {}) {
  const {
    keepaliveIntervalMs = 240000, // 4 minutes (before 5min timeout)
    onMessage = null,
    onDisconnect = null
  } = options;
  
  logger.debug('Creating long-lived connection', { name, keepaliveIntervalMs });
  const port = chrome.runtime.connect({ name });
  
  // X51LABS-78: Setup keepalive pings to prevent timeout
  let keepaliveTimer = null;
  if (keepaliveIntervalMs > 0) {
    keepaliveTimer = setInterval(() => {
      try {
        port.postMessage({ type: 'KEEPALIVE', timestamp: Date.now() });
        logger.debug('Keepalive ping sent', { name });
      } catch (error) {
        logger.warn('Keepalive failed, connection may be closed', { name, error: error.message });
        clearInterval(keepaliveTimer);
      }
    }, keepaliveIntervalMs);
  }
  
  // Setup message listener
  if (onMessage) {
    port.onMessage.addListener(onMessage);
  }
  
  // Setup disconnect handler
  port.onDisconnect.addListener(() => {
    logger.debug('Connection disconnected', { name });
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
    }
    if (onDisconnect) {
      onDisconnect();
    }
  });
  
  // Cleanup function
  const cleanup = () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
    }
    try {
      port.disconnect();
    } catch (error) {
      logger.warn('Error during port cleanup', { name, error: error.message });
    }
  };
  
  return { port, cleanup };
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
