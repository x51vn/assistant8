/**
 * @fileoverview Helper for persisting prompts to chat history
 *
 * Centralizes the "record prompt sent" logic that was duplicated across
 * 3 handlers (prompt.js, chatgpt.js, contextMenu.js).
 *
 * Usage:
 *   await persistPromptSafe(runId, prompt, chatId, chatUrl, { source: 'SEND_PROMPT' });
 *
 * Philosophy: Never fail the user's action if persistence fails.
 * - Writes to outbox immediately
 * - Attempts Supabase flush (best-effort, async)
 * - Logs warning if flush fails
 */

import { createLogger } from '../../logger.js';
import { recordPromptSent } from '../services/chatHistoryService.js';

const logger = createLogger('PersistPromptHelper');

/**
 * Persist a prompt to chat history safely (non-blocking)
 *
 * @param {string} runId - Unique correlation ID for this prompt
 * @param {string} prompt - The prompt text to save
 * @param {string|null} chatId - ChatGPT chat identifier
 * @param {string|null} chatUrl - ChatGPT chat URL
 * @param {ChatHistoryMetadata} metadata - Metadata object
 * @returns {Promise<void>} - Always resolves (never throws)
 *
 * @example
 * await persistPromptSafe(correlationId, 'Hello ChatGPT', chatId, chatUrl, {
 *   source: 'SEND_PROMPT',
 *   status: 'sent'
 * });
 */
export async function persistPromptSafe(runId, prompt, chatId, chatUrl, metadata = {}) {
  // Guard: Missing runId means no correlation possible
  if (!runId || typeof runId !== 'string') {
    return;
  }

  try {
    await recordPromptSent({
      runId,
      prompt: typeof prompt === 'string' ? prompt.trim() : '',
      chatId: chatId || null,
      chatUrl: chatUrl || null,
      timestamp: Date.now(),
      metadata
    });
  } catch (persistErr) {
    // Log warning but never throw - persistence failure is not user-facing
    logger.warn('Failed to record prompt to chat_history (kept in outbox)', {
      correlationId: runId,
      source: metadata?.source || 'unknown',
      errorMessage: persistErr?.message || String(persistErr)
    });
  }
}
