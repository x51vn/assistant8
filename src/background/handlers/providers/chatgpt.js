/**
 * @fileoverview ChatGPT-specific background handlers
 *
 * Handles ChatGPT DOM automation concerns that sit outside the generic LLM
 * provider abstraction:
 *   - CHATGPT_GET_OUTPUT  — Retrieves the current ChatGPT response from the tab.
 *                           Kept for edge-case compatibility; SEND_PROMPT now
 *                           returns text directly for all providers.
 *   - ENSURE_CHATGPT_OPEN — Opens / focuses the ChatGPT tab (user-facing action).
 *
 * Note: Sending prompts to ChatGPT is now handled centrally by
 *       `handlers/llm.js` (SEND_PROMPT) via ChatGPTProvider.sendPrompt().
 */

import { registerHandler } from '../../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../../shared/messageSchema.js';
import { createLogger } from '../../../logger.js';
import { ERROR_CODES } from '../../../types.js';
import * as ChatGPTSession from '../../../chatgptSession.js';

const logger = createLogger('Providers/ChatGPT');

// ============================================================
// CHATGPT_GET_OUTPUT
// Retrieves the latest response text from an open ChatGPT tab.
// Called by UI code when the ChatGPT path is chosen and the
// caller polls for the response (e.g. writingApi.pollWritingOutput).
// ============================================================
registerHandler(MESSAGE_TYPES.CHATGPT_GET_OUTPUT, async (message, sender) => {
  const { tabId, options = {} } = message.payload || {};
  const trackingChatId = message.chatId;

  logger.info('CHATGPT_GET_OUTPUT', {
    correlationId: message.correlationId,
    trackingChatId,
    requestedTabId: tabId
  });

  let targetTabId = tabId;

  if (!targetTabId) {
    const chatgptTabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    if (chatgptTabs.length === 0) {
      return createResponse(message, MESSAGE_TYPES.ERROR, { error: 'No ChatGPT tab found' });
    }
    targetTabId = chatgptTabs[0].id;
    logger.info('Found ChatGPT tab', { tabId: targetTabId, trackingChatId });
  }

  const mergedOptions = { ...options };
  if (trackingChatId && !mergedOptions.expectedChatId) {
    mergedOptions.expectedChatId = trackingChatId;
  }

  const result = await ChatGPTSession.getOutput(targetTabId, mergedOptions);

  if (!result.success) {
    return createResponse(message, MESSAGE_TYPES.ERROR, { error: result.error });
  }

  logger.info('ChatGPT output retrieved', {
    trackingChatId,
    outputLength: result.data.result?.length,
    chatId: result.data.chatId
  });

  return createResponse(message, MESSAGE_TYPES.CHATGPT_OUTPUT_READY, {
    response: result.data.result,        // UI expects 'response' field
    output: result.data.result,          // backward compatibility alias
    chatId: result.data.chatId,
    chatUrl: result.data.chatUrl,
    assistantMessageId: result.data.assistantMessageId,
    status: result.data.status
  });
});

// ============================================================
// ENSURE_CHATGPT_OPEN
// Opens or focuses the ChatGPT tab. Typically triggered by a
// user button ("Open ChatGPT") rather than as part of a prompt send.
// ============================================================
registerHandler(MESSAGE_TYPES.ENSURE_CHATGPT_OPEN, async (message) => {
  const correlationId = logger.startOperation('ensureChatGPTOpen', message.correlationId);

  try {
    const tabResult = await ChatGPTSession.ensureChatGPTTab({
      createIfNeeded: true,
      focusTab: true
    });

    if (tabResult.error) {
      throw new Error(typeof tabResult.error === 'string' ? tabResult.error : 'Failed to ensure ChatGPT tab');
    }

    logger.info('ChatGPT tab ready', { correlationId, tabId: tabResult.tabId });
    logger.endOperation(correlationId, 'success');

    return createResponse(message, MESSAGE_TYPES.CHATGPT_TAB_READY, {
      tabId: tabResult.tabId
    });
  } catch (error) {
    logger.error('ENSURE_CHATGPT_OPEN failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

logger.info('ChatGPT provider handlers registered');
