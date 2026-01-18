/**
 * @fileoverview Prompt Handler
 * Handles sending prompts to ChatGPT
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../types.js';
import * as ChatGPTSession from '../../chatgptSession.js';

const logger = createLogger('PromptHandler');

/**
 * SEND_PROMPT - Send prompt to ChatGPT
 */
registerHandler(MESSAGE_TYPES.SEND_PROMPT, async (message, sender) => {
  const correlationId = logger.startOperation('sendPrompt', message.correlationId);
  const { prompt, options } = message.payload || {};
  
  try {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      logger.warn('Invalid prompt', { correlationId });
      logger.endOperation(correlationId, 'error', { reason: 'invalid_prompt' });
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Missing or invalid prompt');
    }

    logger.info('Sending prompt', { correlationId, promptLength: prompt.length });

    // Ensure ChatGPT tab is ready
    const tabResult = await ChatGPTSession.ensureChatGPTTab({ 
      createIfNeeded: true,
      focusTab: options?.focusTab !== false // Default true
    });

    if (tabResult.error) {
      throw new Error(`Failed to ensure ChatGPT tab: ${tabResult.error}`);
    }

    // Send prompt
    const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, prompt.trim(), {
      createNewChat: options?.createNewChat || false,
      reviewOnly: options?.reviewOnly || false
    });

    if (!sendResult.success) {
      throw new Error(`Failed to send prompt: ${sendResult.error}`);
    }

    logger.info('Prompt sent successfully', { correlationId });
    logger.endOperation(correlationId, 'success');

    return createResponse(message, MESSAGE_TYPES.PROMPT_SENT, {
      tabId: tabResult.tabId,
      success: true
    });

  } catch (error) {
    logger.error('Send prompt failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * ENSURE_CHATGPT_OPEN - Ensure ChatGPT tab is open
 */
registerHandler(MESSAGE_TYPES.ENSURE_CHATGPT_OPEN, async (message, sender) => {
  const correlationId = logger.startOperation('ensureChatGPTOpen', message.correlationId);
  
  try {
    logger.info('Ensuring ChatGPT tab is open', { correlationId });

    const tabResult = await ChatGPTSession.ensureChatGPTTab({
      createIfNeeded: true,
      focusTab: true
    });

    if (tabResult.error) {
      throw new Error(tabResult.error);
    }

    logger.info('ChatGPT tab ready', { correlationId, tabId: tabResult.tabId });
    logger.endOperation(correlationId, 'success');

    return createResponse(message, MESSAGE_TYPES.CHATGPT_TAB_READY, {
      tabId: tabResult.tabId
    });

  } catch (error) {
    logger.error('Ensure ChatGPT open failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});
