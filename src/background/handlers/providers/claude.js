/**
 * @fileoverview Claude-specific background handlers
 *
 * Handles Claude tab management (open/focus) so the LLM provider
 * can automate via content script.
 *
 *   - ENSURE_CLAUDE_OPEN — Opens / focuses a Claude tab at claude.ai/new.
 *
 * Note: Sending prompts to Claude is handled centrally by
 *       `handlers/llm.js` (SEND_PROMPT) via ClaudeWebProvider.sendPrompt().
 */

import { registerHandler } from '../../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../../shared/messageSchema.js';
import { createLogger } from '../../../logger.js';
import { ERROR_CODES } from '../../../shared/errorCodes.js';

const logger = createLogger('Providers/Claude');

const CLAUDE_URL = 'https://claude.ai/new';
const CLAUDE_URL_PATTERN = 'https://claude.ai/*';

// ============================================================
// ENSURE_CLAUDE_OPEN
// Opens or focuses an existing Claude tab so the content script
// is available for DOM automation.
// ============================================================
registerHandler(MESSAGE_TYPES.ENSURE_CLAUDE_OPEN, async (message) => {
  const correlationId = logger.startOperation('ensureClaudeOpen', message.correlationId);

  try {
    logger.info('Ensuring Claude tab is open', { correlationId });

    // Try to find an existing Claude tab
    const existingTabs = await chrome.tabs.query({ url: CLAUDE_URL_PATTERN });

    if (existingTabs.length > 0) {
      const tab = existingTabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      logger.info('Focused existing Claude tab', { correlationId, tabId: tab.id });
      logger.endOperation(correlationId, 'success');
      return createResponse(message, MESSAGE_TYPES.CLAUDE_TAB_READY, { tabId: tab.id });
    }

    // No existing tab — open a new one
    const tab = await chrome.tabs.create({ url: CLAUDE_URL, active: true });
    logger.info('Opened new Claude tab', { correlationId, tabId: tab.id });
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.CLAUDE_TAB_READY, { tabId: tab.id });

  } catch (error) {
    logger.error('Ensure Claude open failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});
