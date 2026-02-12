/**
 * @fileoverview Prompt Handler
 * Handles sending prompts to ChatGPT
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../types.js';
import * as ChatGPTSession from '../../chatgptSession.js';
import { persistPromptSafe } from './_persistPromptHelper.js';
import { enqueue } from '../services/promptQueue.js';

const logger = createLogger('PromptHandler');

/**
 * SEND_PROMPT - Send prompt to ChatGPT (via unified prompt queue)
 *
 * All prompt sends are serialized through p-queue (concurrency=1).
 * The handler awaits its turn in the queue before sending.
 */
registerHandler(MESSAGE_TYPES.SEND_PROMPT, async (message, sender) => {
  const correlationId = logger.startOperation('sendPrompt', message.correlationId);
  // ✅ CONSISTENCY FIX: Support both payload and data for backward compatibility
  const { prompt, options } = message.payload || message.data || {};
  const runId = message.correlationId; // Option A: use correlationId as run_id for chat_history
  
  try {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      logger.warn('Invalid prompt', { correlationId });
      logger.endOperation(correlationId, 'error', { reason: 'invalid_prompt' });
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Missing or invalid prompt');
    }

    logger.info('Sending prompt (queued)', { correlationId, promptLength: prompt.length });

    // ===== QUEUE: All ChatGPT sends go through p-queue =====
    const result = await enqueue(async () => {
      // Ensure ChatGPT tab is ready
      const tabResult = await ChatGPTSession.ensureChatGPTTab({ 
        createIfNeeded: true,
        focusTab: options?.focusTab !== false // Default true
      });

      if (tabResult.error) {
        const errorMsg = typeof tabResult.error === 'string' ? tabResult.error : 'Failed to ensure ChatGPT tab';
        throw new Error(errorMsg);
      }

      // Send prompt
      const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, prompt.trim(), {
        createNewChat: options?.createNewChat !== false,
        runId, // propagate to content script for capture correlation
        reviewOnly: options?.reviewOnly || false
      });

      if (!sendResult.success) {
        throw new Error(`Failed to send prompt: ${sendResult.error}`);
      }

      logger.info('Prompt sent successfully', { correlationId });

      const chatId = sendResult.data?.chatId || null;
      const chatUrl = sendResult.data?.chatUrl || null;

      // Persist prompt to chat_history (response will be captured by content script)
      // IMPORTANT: Never fail prompt sending if persistence fails.
      if (options?.saveToHistory !== false) {
        const baseMetadata = {
          source: 'SEND_PROMPT',
          status: sendResult.data?.status || null
        };

        const fullMetadata = {
          ...baseMetadata,
          ...(options?.metadata || {})
        };

        await persistPromptSafe(runId, prompt, chatId, chatUrl, fullMetadata);
      }

      return {
        tabId: tabResult.tabId,
        success: true,
        chatId,
        chatUrl,
        runId,
        status: sendResult.data?.status || null
      };
    });
    // ===== END QUEUE =====

    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.PROMPT_SENT, result);

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
      const errorMsg = typeof tabResult.error === 'string' ? tabResult.error : 'Failed to ensure ChatGPT tab';
      throw new Error(errorMsg);
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
