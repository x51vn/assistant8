/**
 * @fileoverview Gemini-specific background handlers
 *
 * Handles Gemini DOM automation concerns that sit outside the generic LLM
 * provider abstraction:
 *   - ENSURE_GEMINI_OPEN — Opens / focuses the gemini.google.com tab
 *                          (symmetric with ENSURE_CHATGPT_OPEN)
 *
 * Sending prompts to Gemini is handled centrally by
 * `handlers/llm.js` (unified SEND_PROMPT pipeline) via GeminiWebProvider.sendPrompt().
 */

import { registerHandler } from '../../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../../shared/messageSchema.js';
import { createLogger } from '../../../logger.js';
import { ERROR_CODES } from '../../../shared/errorCodes.js';

const logger = createLogger('Providers/Gemini');

const GEMINI_URL = 'https://gemini.google.com/app';
const GEMINI_URL_PATTERN = 'https://gemini.google.com/*';

// ============================================================
// ENSURE_GEMINI_OPEN
// Opens or focuses the Gemini tab. Typically triggered by the
// Settings page "Open & Login" button for provider setup.
// ============================================================
registerHandler(MESSAGE_TYPES.ENSURE_GEMINI_OPEN, async (message) => {
  const correlationId = logger.startOperation('ensureGeminiOpen', message.correlationId);

  try {
    // Reuse an existing Gemini tab if available
    const existing = await chrome.tabs.query({ url: GEMINI_URL_PATTERN });

    if (existing.length > 0) {
      await chrome.tabs.update(existing[0].id, { active: true });
      const win = await chrome.windows?.getCurrent?.();
      if (win && existing[0].windowId !== win.id) {
        await chrome.windows.update(existing[0].windowId, { focused: true });
      }
      logger.info('ENSURE_GEMINI_OPEN: Focused existing tab', {
        tabId: existing[0].id,
        correlationId
      });
      logger.endOperation(correlationId, 'success');
      return createResponse(message, MESSAGE_TYPES.GEMINI_TAB_READY, {
        tabId: existing[0].id
      });
    }

    // Create new tab
    const tab = await chrome.tabs.create({ url: GEMINI_URL, active: true });
    logger.info('ENSURE_GEMINI_OPEN: Created new Gemini tab', {
      tabId: tab.id,
      correlationId
    });
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.GEMINI_TAB_READY, { tabId: tab.id });

  } catch (error) {
    logger.error('ENSURE_GEMINI_OPEN failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

logger.info('Gemini provider handlers registered');
