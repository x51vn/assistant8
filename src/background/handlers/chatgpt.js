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
  const { tabId, options = {} } = message;
  
  logger.info('Handling CHATGPT_GET_OUTPUT', { 
    correlationId: message.correlationId,
    tabId 
  });
  
  const result = await ChatGPTSession.getOutput(tabId, options);
  
  if (!result.success) {
    return createResponse(message, MESSAGE_TYPES.ERROR, {
      error: result.error
    });
  }
  
  return createResponse(message, MESSAGE_TYPES.CHATGPT_OUTPUT_READY, {
    data: result.data
  });
});

logger.info('ChatGPT handlers registered');
