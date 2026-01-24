/**
 * @fileoverview ChatGPT Message Handlers
 * Handles all ChatGPT-related messages
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import * as ChatGPTSession from '../../chatgptSession.js';

const logger = createLogger('Handlers/ChatGPT');

/**
 * Handle CHATGPT_SEND_INPUT
 * Sends input to ChatGPT
 */
registerHandler(MESSAGE_TYPES.CHATGPT_SEND_INPUT, async (message, sender) => {
  const { prompt, options = {} } = message;
  
  logger.info('Handling CHATGPT_SEND_INPUT', { 
    correlationId: message.correlationId,
    promptLength: prompt?.length 
  });
  
  // Ensure ChatGPT tab is ready
  const tabResult = await ChatGPTSession.ensureChatGPTTab(options);
  
  if (tabResult.error) {
    return createResponse(message, MESSAGE_TYPES.ERROR, {
      error: tabResult.error
    });
  }
  
  // Send input
  const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, prompt, options);
  
  if (!sendResult.success) {
    return createResponse(message, MESSAGE_TYPES.ERROR, {
      error: sendResult.error
    });
  }
  
  return createResponse(message, MESSAGE_TYPES.CHATGPT_INPUT_SENT, {
    data: sendResult.data
  });
});

/**
 * Handle CHATGPT_GET_OUTPUT
 * Gets output from ChatGPT
 */
registerHandler(MESSAGE_TYPES.CHATGPT_GET_OUTPUT, async (message, sender) => {
  const { tabId, options = {} } = message.payload || {};
  const trackingChatId = message.chatId; // Get chatId from message root for tracking
  
  logger.info('Handling CHATGPT_GET_OUTPUT', { 
    correlationId: message.correlationId,
    trackingChatId,
    requestedTabId: tabId
  });
  
  let targetTabId = tabId;
  
  // If no tabId provided, find ChatGPT tab
  if (!targetTabId) {
    const chatgptTabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    if (chatgptTabs.length === 0) {
      return createResponse(message, MESSAGE_TYPES.ERROR, {
        error: 'No ChatGPT tab found'
      });
    }
    targetTabId = chatgptTabs[0].id;
    logger.info('Found ChatGPT tab', { tabId: targetTabId, trackingChatId });
  }
  
  const result = await ChatGPTSession.getOutput(targetTabId, options);
  
  if (!result.success) {
    return createResponse(message, MESSAGE_TYPES.ERROR, {
      error: result.error
    });
  }
  
  logger.info('ChatGPT output retrieved', { 
    trackingChatId,
    outputLength: result.data.result?.length,
    chatId: result.data.chatId
  });
  
  // ✅ CRITICAL: Return 'response' not 'output' for UI compatibility
  return createResponse(message, MESSAGE_TYPES.CHATGPT_OUTPUT_READY, {
    response: result.data.result, // UI expects 'response' field
    output: result.data.result,   // Keep for backward compatibility
    chatId: result.data.chatId,
    chatUrl: result.data.chatUrl,
    assistantMessageId: result.data.assistantMessageId,
    status: result.data.status
  });
});

logger.info('ChatGPT handlers registered');
