/**
 * @fileoverview History Message Handlers
 * Handles chat history operations
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/History');

const CHAT_HISTORY_KEY = 'chatHistory';

/**
 * Handle HISTORY_GET
 * Get all chat history
 */
registerHandler(MESSAGE_TYPES.HISTORY_GET, async (message, sender) => {
  logger.info('Handling HISTORY_GET', { correlationId: message.correlationId });
  
  const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
  const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
  
  return createResponse(message, MESSAGE_TYPES.HISTORY_READY, {
    history
  });
});

/**
 * Handle HISTORY_CLEAR
 * Clear all chat history
 */
registerHandler(MESSAGE_TYPES.HISTORY_CLEAR, async (message, sender) => {
  logger.info('Handling HISTORY_CLEAR', { correlationId: message.correlationId });
  
  await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: [] });
  
  return createResponse(message, MESSAGE_TYPES.HISTORY_CLEARED, {
    success: true
  });
});

/**
 * Handle HISTORY_GET_BY_ID
 * Get specific chat by ID
 */
registerHandler(MESSAGE_TYPES.HISTORY_GET_BY_ID, async (message, sender) => {
  const { chatId } = message.payload || {};
  
  logger.info('Handling HISTORY_GET_BY_ID', { 
    correlationId: message.correlationId,
    chatId 
  });
  
  if (!chatId) {
    return createErrorResponse(message, 'MISSING_CHAT_ID', 'Missing chatId parameter');
  }
  
  const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
  const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
  const chat = history.find(c => c.chatId === chatId);
  
  return createResponse(message, MESSAGE_TYPES.HISTORY_ITEM, {
    chat: chat || null
  });
});

/**
 * Handle CHAT_OPEN
 * Open chat in ChatGPT tab
 */
registerHandler(MESSAGE_TYPES.CHAT_OPEN, async (message, sender) => {
  const { chatId, chatUrl } = message.payload || {};
  
  logger.info('Handling CHAT_OPEN', { 
    correlationId: message.correlationId,
    chatId,
    chatUrl 
  });
  
  // Construct URL
  let url = chatUrl;
  if (!url && chatId) {
    url = `https://chatgpt.com/c/${chatId}`;
  }
  
  if (!url) {
    return createErrorResponse(message, 'MISSING_URL', 'Missing chatUrl or chatId');
  }
  
  try {
    // Check if there's already a ChatGPT tab
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    
    let tabId;
    if (tabs.length > 0 && tabs[0].id != null) {
      // Navigate existing tab
      await chrome.tabs.update(tabs[0].id, { url, active: true });
      tabId = tabs[0].id;
    } else {
      // Create new tab
      const newTab = await chrome.tabs.create({ url, active: true });
      tabId = newTab.id;
    }
    
    return createResponse(message, MESSAGE_TYPES.CHAT_OPENED, {
      tabId
    });
  } catch (error) {
    logger.error('Error opening chat', { error: error.message });
    return createErrorResponse(message, 'OPEN_ERROR', error.message);
  }
});

logger.info('History handlers registered');
