/**
 * @fileoverview Auto-save handlers for chat history
 *
 * Content script captures the assistant response (DOM) and reports it here.
 * Background persists to Supabase (with outbox for MV3 reliability).
 *
 * This keeps UI fully decoupled from persistence logic.
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';
import { recordResponseCaptured } from '../services/chatHistoryService.js';
import { saveRun } from '../../shared/promptImprovementDb.js';
import { getCurrentUserId } from '../utils/auth.js';

const logger = createLogger('Handlers/ChatHistoryAutoSave');

registerHandler(MESSAGE_TYPES.CONTENT_RESPONSE_CAPTURED, async (message, sender) => {
  const correlationId = message.correlationId;
  const data = message.data || {};

  const runId = typeof data.runId === 'string' ? data.runId : null;
  if (!runId) {
    logger.warn('CONTENT_RESPONSE_CAPTURED missing runId', { correlationId });
    return createErrorResponse(
      message,
      ERROR_CODES.INVALID_INPUT,
      'Missing runId in CONTENT_RESPONSE_CAPTURED'
    );
  }

  try {
    await recordResponseCaptured({
      runId,
      prompt: typeof data.prompt === 'string' ? data.prompt : null,
      response: typeof data.response === 'string' ? data.response : null,
      status: typeof data.status === 'string' ? data.status : null,
      assistantMessageId: typeof data.assistantMessageId === 'string' ? data.assistantMessageId : null,
      chatId: typeof data.chatId === 'string' ? data.chatId : null,
      chatUrl: typeof data.chatUrl === 'string' ? data.chatUrl : null,
      waitedMs: Number.isFinite(data.waitedMs) ? data.waitedMs : null,
      capturedAt: Number.isFinite(data.capturedAt) ? data.capturedAt : null,
      // Preserve sender tab info for debugging
      metadata: {
        source: 'content_script',
        sender: {
          tabId: sender?.tab?.id ?? null,
          url: sender?.tab?.url ?? null
        }
      }
    });

    // ✅ Prompt Improvement Loop: also save as prompt_run (best-effort, non-blocking)
    // This gives the "Đánh giá" feature data to evaluate later
    try {
      if (data.prompt || data.response) {
        const userId = await getCurrentUserId();
        await saveRun({
          id: runId,
          prompt_text: data.prompt || '',
          response_text: data.response || '',
          page_url: data.chatUrl || null,
          user_id: userId,
        });
      }
    } catch (piErr) {
      // Non-fatal: don't block chat history save
      logger.debug('Prompt improvement run save skipped', { runId, error: piErr?.message });
    }

    return createResponse(message, MESSAGE_TYPES.CONTENT_RESPONSE_CAPTURED, {
      success: true,
      runId
    });
  } catch (error) {
    logger.error('Failed to record captured response', {
      correlationId,
      runId,
      errorMessage: error?.message || String(error)
    });

    return createErrorResponse(
      message,
      ERROR_CODES.OPERATION_FAILED,
      'Failed to persist captured response',
      { technicalError: error?.message || String(error) }
    );
  }
});

logger.info('Chat history auto-save handlers registered');
