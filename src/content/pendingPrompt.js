/**
 * @fileoverview Content Script — Pending Prompt Queue
 *
 * Manages a single pending prompt in sessionStorage so that
 * navigation (new-chat) doesn't lose the prompt to send.
 *
 * Exports:
 *   readPendingPrompt()  → object | null
 *   writePendingPrompt(pending) → void
 *   clearPendingPrompt() → void
 *   trySendPendingPromptOnce() → boolean
 *   drainPendingPrompt(opts)   → void (retries until sent or timeout)
 */

import { sleep, getChatMeta } from './utils.js';
import { inputAndSendPrompt, waitForEmptyNewChat } from './editor.js';

// Lightweight inline logger (content scripts are classic scripts — can't import shared chunks)
const LOG_PREFIX = '[Content/PendingPrompt]';
const logger = {
  debug: (msg, data) => console.debug(LOG_PREFIX, msg, data || ''),
  info:  (msg, data) => console.log(LOG_PREFIX, msg, data || ''),
  warn:  (msg, data) => console.warn(LOG_PREFIX, msg, data || ''),
  error: (msg, data) => console.error(LOG_PREFIX, msg, data || ''),
};
const PENDING_PROMPT_KEY = '__chatgpt_assistant_pending_prompt_v1';

/**
 * Read the pending prompt object from sessionStorage.
 * @returns {{ prompt: string, runId?: string, createNewChat?: boolean, startUrl?: string, queuedAt: number } | null}
 */
function readPendingPrompt() {
  try {
    const raw = sessionStorage.getItem(PENDING_PROMPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.prompt !== 'string') return null;
    logger.debug('readPendingPrompt found', { runId: parsed.runId, promptLength: parsed.prompt?.length });
    return parsed;
  } catch (err) {
    logger.warn('readPendingPrompt failed to parse', { error: err?.message });
    return null;
  }
}

/**
 * Write a pending prompt to sessionStorage.
 * @param {object} pending
 */
export function writePendingPrompt(pending) {
  try {
    sessionStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(pending));
    logger.debug('writePendingPrompt saved', { runId: pending?.runId, promptLength: pending?.prompt?.length });
  } catch (err) {
    logger.error('writePendingPrompt failed', { error: err?.message });
  }
}

/**
 * Clear the pending prompt from sessionStorage.
 */
function clearPendingPrompt() {
  try {
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    logger.debug('clearPendingPrompt done');
  } catch (err) {
    logger.warn('clearPendingPrompt failed', { error: err?.message });
  }
}

/**
 * Attempt to send the pending prompt once. Returns true on success.
 * @returns {Promise<boolean>}
 */
async function trySendPendingPromptOnce() {
  const pending = readPendingPrompt();
  if (!pending) return false;

  if (pending.createNewChat) {
    const ready = await waitForEmptyNewChat({ startUrl: pending.startUrl, timeoutMs: 20000 });
    if (!ready) return false;
  }

  const ok = await inputAndSendPrompt(pending.prompt, { createNewChat: false, editorTimeoutMs: 4000 });
  if (!ok) return false;

  clearPendingPrompt();

  try {
    const meta = getChatMeta();
    chrome.runtime.sendMessage({
      v: 1,
      type: 'CONTENT_PROMPT_SENT',
      correlationId: `prompt-sent-${Date.now()}`,
      timestamp: Date.now(),
      data: { runId: pending.runId || null, ...meta }
    });
    logger.info('Pending prompt sent successfully', { runId: pending.runId, chatId: meta.chatId });
  } catch (err) {
    logger.warn('Failed to notify background of prompt sent', { error: err?.message });
  }

  return true;
}

/** @private Guard against concurrent drains */
let drainInFlight = false;

/**
 * Retry sending the pending prompt until success or timeout.
 * On timeout, notifies background with CONTENT_PROMPT_FAILED.
 *
 * @param {{ timeoutMs?: number }} options
 */
export async function drainPendingPrompt({ timeoutMs = 30000 } = {}) {
  if (drainInFlight) return;
  drainInFlight = true;
  const start = Date.now();
  try {
    while (Date.now() - start < timeoutMs) {
      const pending = readPendingPrompt();
      if (!pending) return;

      try {
        const ok = await trySendPendingPromptOnce();
        if (ok) return;
      } catch (err) {
        logger.debug('drainPendingPrompt retry failed', { error: err?.message, elapsedMs: Date.now() - start });
      }

      await sleep(500);
    }

    // Timeout: notify background
    const pending = readPendingPrompt();
    if (pending && pending.runId) {
      logger.warn('drainPendingPrompt timeout', { runId: pending.runId, timeoutMs });
      try {
        chrome.runtime.sendMessage({
          v: 1,
          type: 'CONTENT_PROMPT_FAILED',
          correlationId: `prompt-failed-${Date.now()}`,
          timestamp: Date.now(),
          data: {
            runId: pending.runId,
            error: 'timeout_sending_prompt'
          }
        });
      } catch (err) {
        logger.error('Failed to notify background of prompt timeout', { error: err?.message });
      }
      clearPendingPrompt();
    }
  } finally {
    drainInFlight = false;
  }
}
