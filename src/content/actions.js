/**
 * @fileoverview Content Script — Message Action Handlers
 *
 * Extracts all chrome.runtime.onMessage action implementations
 * into a single dispatcher function.
 *
 * Exports:
 *   handleMessage(request, safeSendResponse) → boolean
 *     Returns true when the response will be sent asynchronously.
 */

import { sleep, getChatMeta } from './utils.js';
import { getConversationMessageCount, getSelectorStats } from './selectors.js';
import { ensureNewChatSession, inputAndSendPrompt, triggerNewChatNavigation } from './editor.js';
import {
  getLatestAssistantMessageMeta,
  isGenerating,
  waitForStableAssistantResponse
} from './output.js';
import { writePendingPrompt, drainPendingPrompt } from './pendingPrompt.js';
import { captureAndReportAssistantResponse } from './capture.js';
import { activateGuard, deactivateGuard } from './navigationGuard.js';
import { adaptSendInput, adaptGetOutput } from './contractAdapter.js';

// Lightweight inline logger (content scripts are classic scripts — can't import shared chunks)
const LOG_PREFIX = '[Content/Actions]';
const logger = {
  debug: (msg, data) => console.debug(LOG_PREFIX, msg, data || ''),
  info:  (msg, data) => console.log(LOG_PREFIX, msg, data || ''),
  warn:  (msg, data) => console.warn(LOG_PREFIX, msg, data || ''),
  error: (msg, data) => console.error(LOG_PREFIX, msg, data || ''),
};

/**
 * Dispatch a single content-script message action.
 *
 * @param {object} request — The incoming message (must have `request.action`)
 * @param {(payload: object) => void} safeSendResponse — One-shot response sender
 * @returns {boolean} true if response will be sent asynchronously (caller must `return true`)
 */
export function handleMessage(request, safeSendResponse) {
  // ---- ping ----
  if (request.action === 'ping') {
    safeSendResponse({
      pong: true,
      status: 'ok',
      ready: true,
      contentScriptVersion: 1,
      markerSet: window.__ChatGPTAssistantReady === true,
      markerTimestamp: window.__ChatGPTAssistantReadyTimestamp || null,
      url: location.href,
      hostname: location.hostname,
      messageListenerReady: true
    });
    return false; // already responded synchronously
  }

  // ---- input_prompt (legacy compat) ----
  if (request.action === 'input_prompt') {
    const prompt = typeof request.prompt === 'string' ? request.prompt : '';
    const runId = typeof request.runId === 'string' ? request.runId : null;
    const createNewChat = request.newChat !== false;

    writePendingPrompt({ prompt, runId, queuedAt: Date.now(), createNewChat, startUrl: location.href });
    if (createNewChat) triggerNewChatNavigation();
    drainPendingPrompt({ timeoutMs: 30000 }).catch(() => {});

    let meta = {};
    try { meta = getChatMeta(); } catch { /* ignore */ }
    safeSendResponse({ status: 'accepted', runId, ...meta });
    return false;
  }

  // ---- create_new_session ----
  if (request.action === 'create_new_session') {
    logger.debug('create_new_session action received');
    (async () => {
      try {
        const success = await ensureNewChatSession();
        const meta = getChatMeta();
        logger.info('New session created', { success, chatId: meta.chatId });
        safeSendResponse({ success, ...meta });
      } catch (e) {
        logger.error('create_new_session failed', { error: e?.message });
        safeSendResponse({ success: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // ---- send_input ----
  if (request.action === 'send_input') {
    logger.debug('send_input action received', { promptLength: request.prompt?.length, reviewOnly: request.reviewOnly });
    (async () => {
      try {
        // Normalize request through contract adapter (CHATGPT_SEND_INPUT contract)
        const dto = adaptSendInput(request);
        if (dto._warnings.length > 0) {
          logger.warn('send_input contract warnings', { warnings: dto._warnings });
        }
        const { prompt, createNewChat, reviewOnly, runId } = dto;

        const beforeAssistant = getLatestAssistantMessageMeta();
        const beforeMsgCount = getConversationMessageCount();

        logger.debug('Before inputAndSendPrompt', { url: location.href, createNewChat, reviewOnly });

        const success = await inputAndSendPrompt(prompt, { createNewChat, reviewOnly });

        logger.debug('After inputAndSendPrompt', { success, url: location.href });

        // Wait for ChatGPT to update URL with new chat_id (up to 3s)
        let meta = getChatMeta();
        let retries = 0;
        const maxRetries = 6;

        while (!meta.chatId && retries < maxRetries) {
          logger.debug('Waiting for chat_id', { attempt: retries + 1, maxRetries });
          await sleep(500);
          meta = getChatMeta();
          retries++;
        }

        if (meta.chatId) {
          logger.debug('Got chat_id', { chatId: meta.chatId, waitedMs: retries * 500 });
        } else {
          logger.warn('No chat_id after waiting', { url: location.href, waitedMs: retries * 500 });
        }

        const status = reviewOnly ? 'filled' : (success ? 'sent' : 'failed');

        logger.info('send_input complete', {
          status,
          chatId: meta.chatId,
          success,
          waitedMs: retries * 500
        });

        // Activate navigation guard to prevent user from switching chats
        // while the extension waits for the assistant's response.
        if (!reviewOnly && success) {
          activateGuard(meta.chatId);
        }

        safeSendResponse({ status, runId, ...meta });

        // Fire-and-forget: capture assistant response
        // Guard is deactivated inside captureAndReportAssistantResponse (finally block)
        if (!reviewOnly && success && runId) {
          captureAndReportAssistantResponse({
            runId,
            prompt,
            beforeAssistantMessageId: beforeAssistant.messageId,
            beforeAssistantText: beforeAssistant.text,
            beforeMsgCount,
            timeoutMs: 15 * 60 * 1000
          }).catch(() => {});
        }
      } catch (e) {
        deactivateGuard(); // Ensure guard is released on error
        logger.error('send_input failed', { error: e?.message });
        safeSendResponse({ status: 'error', error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // ---- get_output ----
  if (request.action === 'get_output') {
    logger.debug('get_output action received', { wait: request.wait, timeoutMs: request.timeoutMs });
    (async () => {
      try {
        // Normalize request through contract adapter (CHATGPT_GET_OUTPUT contract)
        const dto = adaptGetOutput(request);
        if (dto._warnings.length > 0) {
          logger.warn('get_output contract warnings', { warnings: dto._warnings });
        }
        const { wait, timeoutMs, stableMs, expectedChatId } = dto;

        const meta = getChatMeta();

        // Session guard: if the caller supplied an expectedChatId, verify we are still
        // on that session before we start reading the DOM.
        if (expectedChatId && meta.chatId && meta.chatId !== expectedChatId) {
          logger.warn('get_output: session mismatch — user navigated to different chat', {
            expected: expectedChatId,
            current: meta.chatId
          });
          safeSendResponse({
            status: 'session_mismatch',
            expectedChatId,
            currentChatId: meta.chatId
          });
          return;
        }

        logger.debug('get_output state', {
          wait,
          generating: isGenerating(),
          messageCount: getConversationMessageCount(),
          chatId: meta.chatId,
        });

        if (!wait) {
          const latest = getLatestAssistantMessageMeta();
          logger.debug('get_output (no wait)', { resultLength: latest.text?.length || 0 });
          safeSendResponse({ result: latest.text, assistantMessageId: latest.messageId, status: 'ok', ...meta });
          return;
        }

        logger.debug('Waiting for stable response...');
        const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
        const latest = getLatestAssistantMessageMeta();

        logger.info('Response captured', {
          status: waited.status,
          resultLength: (waited.text || latest.text)?.length || 0,
          messageId: latest.messageId,
        });

        safeSendResponse({
          result: waited.text || latest.text,
          assistantMessageId: latest.messageId,
          status: waited.status,
          ...meta
        });
      } catch (e) {
        logger.error('get_output failed', { error: e?.message });
        safeSendResponse({ status: 'error', error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // ---- check_response_status ----
  if (request.action === 'check_response_status') {
    try {
      const generating = isGenerating();
      const latest = getLatestAssistantMessageMeta();
      const hasContent = !!latest.text;
      const messageCount = getConversationMessageCount();

      safeSendResponse({
        ready: !generating && hasContent,
        generating,
        hasContent,
        messageCount
      });
    } catch (e) {
      safeSendResponse({ ready: false, generating: false, hasContent: false, error: String(e?.message || e) });
    }
    return false;
  }

  // ---- unlock_navigation (sent by background when job finishes) ----
  if (request.action === 'unlock_navigation') {
    deactivateGuard();
    safeSendResponse({ success: true });
    return false;
  }

  // ---- get_chat_metadata ----
  if (request.action === 'get_chat_metadata') {
    try {
      const meta = getChatMeta();
      safeSendResponse(meta);
    } catch (e) {
      safeSendResponse({ chatId: null, chatUrl: null, error: String(e?.message || e) });
    }
    return false;
  }

  // ---- get_message_count ----
  if (request.action === 'get_message_count') {
    try {
      const count = getConversationMessageCount();
      safeSendResponse({ count });
    } catch (e) {
      safeSendResponse({ count: 0, error: String(e?.message || e) });
    }
    return false;
  }

  // ---- get_selector_stats ----
  if (request.action === 'get_selector_stats') {
    try {
      safeSendResponse({ success: true, stats: getSelectorStats() });
    } catch (e) {
      safeSendResponse({ success: false, error: String(e?.message || e) });
    }
    return false;
  }

  // ---- clear_conversation ----
  if (request.action === 'clear_conversation') {
    try {
      triggerNewChatNavigation();
      safeSendResponse({ success: true });
    } catch (e) {
      safeSendResponse({ success: false, error: String(e?.message || e) });
    }
    return false;
  }

  // ---- get_result (legacy compat) ----
  if (request.action === 'get_result') {
    (async () => {
      let meta = {};
      try { meta = getChatMeta(); } catch { /* ignore */ }

      const wait = !!request.wait;
      const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 15 * 60 * 1000;
      const stableMs = Number.isFinite(request.stableMs) ? request.stableMs : 1500;

      if (!wait) {
        const latest = getLatestAssistantMessageMeta();
        safeSendResponse({ status: 'ok', result: latest.text, assistantMessageId: latest.messageId, ...meta });
        return;
      }

      const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
      const latest = getLatestAssistantMessageMeta();
      safeSendResponse({
        status: waited.status,
        result: waited.text,
        assistantMessageId: latest.messageId,
        ...meta,
      });
    })().catch((e) => {
      logger.error('get_result failed', { error: e?.message });
      let meta = {};
      try { meta = getChatMeta(); } catch { /* ignore */ }
      safeSendResponse({ status: 'error', error: String(e && e.message ? e.message : e), ...meta });
    });
    return true;
  }

  // ---- unknown ----
  safeSendResponse({ status: 'error', error: 'unknown_action', action: request.action });
  return false;
}
