/**
 * @fileoverview Content Script — Auto-capture Assistant Response
 *
 * Waits for the assistant to finish its response and sends
 * the result to the background for persistence.
 *
 * Exports:
 *   captureAndReportAssistantResponse(params) → void
 *   waitForNewAssistantMessage(opts)          → { text, messageId }
 *   waitForConversationToChange(beforeCount, timeoutMs) → boolean
 */

import { sleep } from '../shared/utils.js';
import { getChatMeta, truncateText } from './utils.js';
import { getConversationMessageCount } from './selectors.js';
import {
  getLatestAssistantMessageMeta,
  isGenerating,
  waitForStableAssistantResponse
} from './output.js';
import { deactivateGuard } from './navigationGuard.js';

const MAX_CAPTURE_PROMPT_CHARS = 50_000;
const MAX_CAPTURE_RESPONSE_CHARS = 100_000;

/**
 * Wait until the conversation message count increases beyond the given baseline.
 * @param {number} beforeMsgCount
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<boolean>}
 */
async function waitForConversationToChange(beforeMsgCount, timeoutMs = 15000) {
  if (!Number.isFinite(beforeMsgCount)) return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = getConversationMessageCount();
    if (count > beforeMsgCount) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Wait until a new (or different) assistant message appears.
 * @param {{ beforeMessageId?: string, beforeText?: string, timeoutMs?: number }} options
 * @returns {Promise<{ text: string|null, messageId: string|null }>}
 */
async function waitForNewAssistantMessage({ beforeMessageId, beforeText, timeoutMs = 30000 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const latest = getLatestAssistantMessageMeta();

    if (latest.messageId && beforeMessageId && latest.messageId !== beforeMessageId) {
      return latest;
    }
    if (latest.text && beforeText && latest.text !== beforeText) {
      return latest;
    }

    if (isGenerating()) {
      return latest;
    }

    await sleep(250);
  }

  return getLatestAssistantMessageMeta();
}

/**
 * Wait for a complete assistant response, then report it to the background
 * via CONTENT_RESPONSE_CAPTURED message for persistence.
 *
 * @param {object} params
 * @param {string} params.runId — Correlation ID
 * @param {string} [params.prompt]
 * @param {string|null} [params.beforeAssistantMessageId]
 * @param {string|null} [params.beforeAssistantText]
 * @param {number|null} [params.beforeMsgCount]
 * @param {number} [params.timeoutMs=900000]
 */
export async function captureAndReportAssistantResponse(params) {
  const {
    runId,
    prompt,
    beforeAssistantMessageId = null,
    beforeAssistantText = null,
    beforeMsgCount = null,
    timeoutMs = 15 * 60 * 1000
  } = params || {};

  if (!runId || typeof runId !== 'string') return;

  // Record the chatId at the moment we start capturing — this is the session
  // the extension "owns". We validate at the end that the user hasn't navigated
  // away to a different session.
  const initialMeta = getChatMeta();
  const ownedChatId = initialMeta.chatId;

  const startedAt = Date.now();

  try {
    await waitForConversationToChange(beforeMsgCount, 15000);

    await waitForNewAssistantMessage({
      beforeMessageId: beforeAssistantMessageId,
      beforeText: beforeAssistantText,
      timeoutMs: 30000
    });

    const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs: 1500 });
    const latest = getLatestAssistantMessageMeta();
    const meta = getChatMeta();

    const responseText = truncateText(waited.text || latest.text || '', MAX_CAPTURE_RESPONSE_CHARS);
    const promptText = truncateText(prompt || '', MAX_CAPTURE_PROMPT_CHARS);

    // Session guard: if the user navigated to a different chat during the wait,
    // the response we captured belongs to a different session — do not persist it.
    if (ownedChatId && meta.chatId && meta.chatId !== ownedChatId) {
      console.warn('[Content] captureAndReportAssistantResponse: session changed during wait — discarding', {
        owned: ownedChatId,
        current: meta.chatId,
        runId
      });
      return;
    }

    const message = {
      v: 1,
      type: 'CONTENT_RESPONSE_CAPTURED',
      correlationId: `content-response-${runId}-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        runId,
        prompt: promptText,
        response: responseText,
        status: waited.status,
        assistantMessageId: latest.messageId || null,
        chatId: meta.chatId,
        chatUrl: meta.chatUrl,
        waitedMs: Date.now() - startedAt,
        capturedAt: Date.now()
      }
    };

    chrome.runtime.sendMessage(message).catch((err) => {
      console.warn('[Content] Failed to send CONTENT_RESPONSE_CAPTURED:', err?.message || err);
    });
  } catch (e) {
    console.warn('[Content] Auto-capture failed:', e?.message || e);
  } finally {
    // Always release the navigation guard when capture finishes
    // (success, failure, session-mismatch, or timeout)
    deactivateGuard();
  }
}
