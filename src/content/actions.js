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
    console.log('[Content] Received create_new_session action');
    (async () => {
      try {
        const success = await ensureNewChatSession();
        const meta = getChatMeta();
        console.log('[Content] New session created, success:', success, 'meta:', meta);
        safeSendResponse({ success, ...meta });
      } catch (e) {
        console.error('[Content] create_new_session error:', e);
        safeSendResponse({ success: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // ---- send_input ----
  if (request.action === 'send_input') {
    console.log('[Content] Received send_input action, prompt length:', request.prompt?.length, 'reviewOnly:', request.reviewOnly);
    (async () => {
      try {
        const prompt = typeof request.prompt === 'string' ? request.prompt : '';
        const createNewChat = request.createNewChat !== false;
        const reviewOnly = request.reviewOnly === true;
        const runId = typeof request.runId === 'string' ? request.runId : null;

        const beforeAssistant = getLatestAssistantMessageMeta();
        const beforeMsgCount = getConversationMessageCount();

        console.log('🔍 [Content] Before inputAndSendPrompt, URL:', location.href);

        const success = await inputAndSendPrompt(prompt, { createNewChat, reviewOnly });

        console.log('🔍 [Content] After inputAndSendPrompt, success:', success, 'URL:', location.href);

        // Wait for ChatGPT to update URL with new chat_id (up to 3s)
        let meta = getChatMeta();
        let retries = 0;
        const maxRetries = 6;

        while (!meta.chatId && retries < maxRetries) {
          console.log(`⏳ [Content] Waiting for chat_id (attempt ${retries + 1}/${maxRetries}), URL:`, location.href);
          await sleep(500);
          meta = getChatMeta();
          retries++;
        }

        if (meta.chatId) {
          console.log(`✅ [Content] Got chat_id after ${retries * 500}ms:`, meta.chatId);
        } else {
          console.warn('⚠️ [Content] No chat_id after waiting, URL might not have updated:', location.href);
        }

        const status = reviewOnly ? 'filled' : (success ? 'sent' : 'failed');

        console.log('🔍 [Content] send_input complete:', {
          status,
          chatId: meta.chatId,
          chatUrl: meta.chatUrl,
          success,
          waitedMs: retries * 500
        });

        safeSendResponse({ status, runId, ...meta });

        // Fire-and-forget: capture assistant response
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
        console.error('[Content] send_input error:', e);
        safeSendResponse({ status: 'error', error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // ---- get_output ----
  if (request.action === 'get_output') {
    console.log('[Content] Received get_output action, wait:', request.wait);
    (async () => {
      try {
        const wait = request.wait !== false;
        const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 15 * 60 * 1000;
        const stableMs = Number.isFinite(request.stableMs) ? request.stableMs : 1500;

        const meta = getChatMeta();

        console.log('🔍 [Content] get_output state:', {
          wait,
          generating: isGenerating(),
          messageCount: getConversationMessageCount(),
          chatId: meta.chatId,
          chatUrl: meta.chatUrl
        });

        if (!wait) {
          const latest = getLatestAssistantMessageMeta();
          console.log('🔍 [Content] get_output (no wait), result length:', latest.text?.length || 0);
          safeSendResponse({ result: latest.text, assistantMessageId: latest.messageId, status: 'ok', ...meta });
          return;
        }

        console.log('🔍 [Content] Waiting for stable response...');
        const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
        const latest = getLatestAssistantMessageMeta();

        console.log('🔍 [Content] Response captured:', {
          status: waited.status,
          resultLength: (waited.text || latest.text)?.length || 0,
          messageId: latest.messageId,
          preview: (waited.text || latest.text)?.substring(0, 100)
        });

        safeSendResponse({
          result: waited.text || latest.text,
          assistantMessageId: latest.messageId,
          status: waited.status,
          ...meta
        });
      } catch (e) {
        console.error('[Content] get_output error:', e);
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
      console.error('content get_result error:', e);
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
