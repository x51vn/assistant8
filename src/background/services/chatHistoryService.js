/**
 * @fileoverview Chat history auto-save service (Option A)
 *
 * Goals:
 * - Keep UI dumb: UI only sends prompts; persistence happens in background.
 * - Be MV3-safe: service worker can be killed anytime -> always persist to outbox first.
 * - Eventually consistent: flush outbox to Supabase when authenticated/network is available.
 *
 * Data model (Supabase table: public.chat_history):
 * - One row per "run" (run_id = correlationId)
 * - Phase 1: save prompt (response null)
 * - Phase 2: update response when captured by content script
 */

import { supabase } from '../../supabaseConfig.js';
import { createLogger } from '../../logger.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { getCurrentUserId } from '../utils/auth.js';

const logger = createLogger('Services/ChatHistory');

const OUTBOX_KEY = 'x51labs_chat_history_outbox_v1';
// Keep this conservative to avoid chrome.storage.local quota issues when offline.
const OUTBOX_MAX_ITEMS = 30;

// Prevent accidentally sending/recording extremely large payloads via runtime messaging.
const MAX_PROMPT_CHARS = 50_000;
const MAX_RESPONSE_CHARS = 100_000;

/**
 * @typedef {Object} ChatHistoryMetadata
 * @description Flexible metadata object for chat history entries
 *
 * @property {string} [source] - Where the prompt came from
 *   - 'SEND_PROMPT': High-level prompt send from UI
 *   - 'CHATGPT_SEND_INPUT': Direct ChatGPT input manipulation
 *   - 'CONTEXT_MENU': Right-click context menu
 *   - 'content_script': Auto-captured from content script
 *
 * @property {number} [status] - Optional status or status code from prompt send
 *
 * @property {Object} [capture] - Response capture metadata (Phase 2)
 * @property {string} [capture.status] - Capture completion status
 *   - 'complete': Response fully captured and stabilized
 *   - 'timeout': Capture operation exceeded time limit
 * @property {string} [capture.assistantMessageId] - ChatGPT message ID for this response
 * @property {number} [capture.waitedMs] - Total wait time for response (milliseconds)
 * @property {number} [capture.capturedAt] - Unix timestamp when capture completed
 *
 * @property {Object} [sender] - Content script sender information (for debugging)
 * @property {number} [sender.tabId] - Browser tab ID that sent the message
 * @property {string} [sender.url] - Full URL of the sender page
 *
 * @example
 * // Phase 1: Saving prompt
 * { source: 'SEND_PROMPT', status: 'sent' }
 *
 * @example
 * // Phase 2: Response captured, merged with Phase 1 metadata
 * {
 *   source: 'SEND_PROMPT',
 *   status: 'sent',
 *   capture: {
 *     status: 'complete',
 *     assistantMessageId: 'msg-abc123',
 *     waitedMs: 5420,
 *     capturedAt: 1707143456789
 *   },
 *   sender: {
 *     tabId: 42,
 *     url: 'https://chatgpt.com/c/abc123'
 *   }
 * }
 */

let flushInFlight = null;

function normalizeText(value, maxChars) {
  if (value == null) return null;
  const str = typeof value === 'string' ? value : String(value);
  const trimmed = str.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function mergePreferTruthy(base, patch) {
  return patch != null && patch !== '' ? patch : base;
}

function mergeMetadata(base, patch) {
  const baseObj = base && typeof base === 'object' ? base : null;
  const patchObj = patch && typeof patch === 'object' ? patch : null;
  if (!baseObj && !patchObj) return null;
  return { ...(baseObj || {}), ...(patchObj || {}) };
}

async function loadOutbox() {
  const stored = await chrome.storage.local.get([OUTBOX_KEY]);
  const items = stored[OUTBOX_KEY];
  return Array.isArray(items) ? items : [];
}

async function saveOutbox(items) {
  const safe = Array.isArray(items) ? items.slice(0, OUTBOX_MAX_ITEMS) : [];
  try {
    await chrome.storage.local.set({ [OUTBOX_KEY]: safe });
    return safe;
  } catch (error) {
    // If we hit quota, try an aggressive shrink so we don't break core flows.
    logger.warn('Failed to save outbox (will try to shrink)', {
      errorMessage: error?.message || String(error),
      itemCount: safe.length
    });

    const shrunk = safe.slice(0, Math.min(5, safe.length)).map((x) => ({
      ...x,
      prompt: normalizeText(x.prompt, 10_000),
      response: normalizeText(x.response, 10_000)
    }));

    try {
      await chrome.storage.local.set({ [OUTBOX_KEY]: shrunk });
      logger.warn('Outbox shrunk and saved successfully', { itemCount: shrunk.length });
      return shrunk;
    } catch (error2) {
      logger.error('Outbox shrink save failed (dropping outbox update)', {
        errorMessage: error2?.message || String(error2)
      });
      // Last resort: do not throw further; keep extension operational.
      return safe;
    }
  }
}

function upsertOutboxItem(items, patch) {
  const runId = patch?.runId;
  if (!runId || typeof runId !== 'string') return items;

  const idx = items.findIndex((x) => x && x.runId === runId);
  const now = Date.now();

  if (idx === -1) {
    const next = {
      runId,
      prompt: patch.prompt ?? null,
      response: patch.response ?? null,
      chatId: patch.chatId ?? null,
      chatUrl: patch.chatUrl ?? null,
      promptId: patch.promptId ?? null,
      timestamp: patch.timestamp ?? now,
      metadata: patch.metadata ?? null,
      lastUpdatedAt: now,
      attempts: 0
    };
    items.unshift(next);
    return items;
  }

  const current = items[idx] || {};
  const merged = {
    ...current,
    // Prefer newer non-empty values
    prompt: mergePreferTruthy(current.prompt, patch.prompt),
    response: mergePreferTruthy(current.response, patch.response),
    chatId: mergePreferTruthy(current.chatId, patch.chatId),
    chatUrl: mergePreferTruthy(current.chatUrl, patch.chatUrl),
    promptId: mergePreferTruthy(current.promptId, patch.promptId),
    // Keep the earliest timestamp if present
    timestamp: typeof current.timestamp === 'number' ? current.timestamp : (patch.timestamp ?? now),
    metadata: mergeMetadata(current.metadata, patch.metadata),
    lastUpdatedAt: now
  };

  items[idx] = merged;
  return items;
}

async function enqueueOutbox(patch) {
  const items = await loadOutbox();
  const next = upsertOutboxItem(items, patch);
  await saveOutbox(next);
}

async function removeOutboxRunId(runId) {
  const items = await loadOutbox();
  const next = items.filter((x) => x && x.runId !== runId);
  await saveOutbox(next);
}

async function findExistingRow({ userId, runId, chatId, correlationId }) {
  // 1) Prefer run_id lookup (our main correlation key)
  if (runId) {
    const row = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .select('id, user_id, run_id, chat_id, prompt, response, metadata, timestamp')
          .eq('user_id', userId)
          .eq('run_id', runId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { operationName: 'chat_history.findByRunId', correlationId }
    );
    if (row) return row;
  }

  // 2) Fallback: chat_id is unique per user when non-null
  if (chatId) {
    const row = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .select('id, user_id, run_id, chat_id, prompt, response, metadata, timestamp')
          .eq('user_id', userId)
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { operationName: 'chat_history.findByChatId', correlationId }
    );
    if (row) return row;
  }

  return null;
}

async function upsertSupabaseRow({ userId, entry, correlationId }) {
  const runId = entry.runId;
  const prompt = normalizeText(entry.prompt, MAX_PROMPT_CHARS);
  const response = normalizeText(entry.response, MAX_RESPONSE_CHARS);
  const chatId = normalizeText(entry.chatId, 2000);
  const chatUrl = normalizeText(entry.chatUrl, 4000);
  const promptId = entry.promptId || null;
  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : null;

  if (!runId || typeof runId !== 'string') {
    throw new Error('Missing runId');
  }

  const existing = await findExistingRow({ userId, runId, chatId, correlationId });

  if (existing) {
    const updateData = {};

    // ⚠️ FIX: Check if chat_id already exists before updating
    // Prevent duplicate key violation when updating chat_id
    if (chatId && chatId !== existing.chat_id) {
      // Check if another record with this chat_id already exists
      const conflictingRow = await supabaseWithRetry(
        async () => {
          const { data, error } = await supabase
            .from('chat_history')
            .select('id')
            .eq('user_id', userId)
            .eq('chat_id', chatId)
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        { operationName: 'chat_history.checkChatIdConflict', correlationId }
      );

      if (conflictingRow && conflictingRow.id !== existing.id) {
        // Another record with this chat_id exists → don't update chat_id
        logger.warn('⚠️ chat_id conflict detected, skipping chat_id update', {
          correlationId,
          existingId: existing.id,
          conflictingId: conflictingRow.id,
          chatId
        });
        // Continue with other updates but skip chat_id
      } else {
        // Safe to update chat_id
        updateData.chat_id = chatId;
      }
    }

    if (chatUrl) updateData.chat_url = chatUrl;
    if (response != null) updateData.response = response;

    // Only set prompt if existing prompt is missing (defensive)
    if (prompt && (!existing.prompt || !String(existing.prompt).trim())) {
      updateData.prompt = prompt;
    }

    // Backfill run_id if we matched by chat_id
    if (!existing.run_id && runId) updateData.run_id = runId;

    // Merge metadata (don't lose previous fields)
    if (metadata) {
      updateData.metadata = mergeMetadata(existing.metadata, metadata);
    }

    if (Object.keys(updateData).length === 0) {
      return { action: 'noop', id: existing.id };
    }

    const updated = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .update(updateData)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      { operationName: 'chat_history.update', correlationId }
    );

    return { action: 'update', id: updated.id };
  }

  // New row: prompt is REQUIRED by schema
  if (!prompt) {
    throw new Error('Cannot insert chat_history without prompt');
  }

  try {
    const inserted = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .insert({
            user_id: userId,
            prompt,
            response: response ?? null,
            chat_id: chatId ?? null,
            chat_url: chatUrl ?? null,
            prompt_id: promptId ?? null,
            run_id: runId,
            timestamp,
            metadata
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      { operationName: 'chat_history.insert', correlationId }
    );

    return { action: 'insert', id: inserted.id };
  } catch (error) {
    // If we raced on the unique (user_id, chat_id) index, recover by updating that row.
    const isUniqueViolation = error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate');
    if (isUniqueViolation && chatId) {
      const existingByChat = await findExistingRow({ userId, runId: null, chatId, correlationId });
      if (existingByChat) {
        const updateData = {
          run_id: runId,
          chat_url: chatUrl ?? existingByChat.chat_url,
          response: response ?? existingByChat.response,
          metadata: mergeMetadata(existingByChat.metadata, metadata)
        };
        const updated = await supabaseWithRetry(
          async () => {
            const { data, error: updateError } = await supabase
              .from('chat_history')
              .update(updateData)
              .eq('id', existingByChat.id)
              .eq('user_id', userId)
              .select()
              .single();
            if (updateError) throw updateError;
            return data;
          },
          { operationName: 'chat_history.updateAfterUniqueViolation', correlationId }
        );
        return { action: 'update', id: updated.id };
      }
    }

    throw error;
  }
}

/**
 * Flush outbox to Supabase (best-effort).
 * - Safe to call frequently; guarded by an in-flight promise.
 * - If not authenticated, it exits without removing outbox items.
 *
 * @param {object} [options]
 * @param {string[]} [options.runIds] - Optional subset of runIds to flush
 * @param {string} [options.reason] - For logging
 */
export async function flushChatHistoryOutbox(options = {}) {
  if (flushInFlight) return flushInFlight;

  const { runIds = null, reason = 'manual' } = options;
  const correlationId = `flush-${reason}-${Date.now()}`;

  flushInFlight = (async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        logger.debug('Outbox flush skipped: not authenticated', { reason });
        return { flushed: 0, remaining: (await loadOutbox()).length, reason: 'unauthenticated' };
      }

      const allItems = await loadOutbox();
      const items = Array.isArray(runIds) && runIds.length > 0
        ? allItems.filter((x) => x && runIds.includes(x.runId))
        : allItems;

      if (items.length === 0) {
        return { flushed: 0, remaining: allItems.length };
      }

      let flushed = 0;

      for (const item of items) {
        if (!item?.runId) continue;

        try {
          const result = await upsertSupabaseRow({ userId, entry: item, correlationId });
          flushed += 1;
          logger.info('Chat history outbox item flushed', {
            runId: item.runId,
            action: result.action,
            id: result.id
          });
          await removeOutboxRunId(item.runId);
        } catch (error) {
          // Keep item in outbox for future retries.
          logger.warn('Failed to flush outbox item (kept for retry)', {
            runId: item.runId,
            errorMessage: error?.message || String(error),
            errorCode: error?.code,
            errorStatus: error?.status
          });
        }
      }

      const remaining = (await loadOutbox()).length;
      logger.info('Outbox flush complete', { flushed, remaining, reason });
      return { flushed, remaining, reason };
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

/**
 * Record a prompt send (phase 1).
 * MV3-safe: always writes to outbox first, then attempts a flush.
 */
export async function recordPromptSent(entry) {
  const runId = entry?.runId;
  if (!runId || typeof runId !== 'string') return;

  await enqueueOutbox({
    runId,
    prompt: normalizeText(entry.prompt, MAX_PROMPT_CHARS),
    response: null,
    chatId: entry.chatId ?? null,
    chatUrl: entry.chatUrl ?? null,
    promptId: entry.promptId ?? null,
    timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
    metadata: entry.metadata ?? null
  });

  // Best-effort: flush this run immediately if possible (don't block the user flow)
  flushChatHistoryOutbox({ runIds: [runId], reason: 'prompt_sent' }).catch((err) => {
    logger.debug('Prompt outbox flush deferred', { runId, errorMessage: err?.message || String(err) });
  });
}

/**
 * Record a captured response (phase 2).
 * MV3-safe: always writes to outbox first, then attempts a flush.
 */
export async function recordResponseCaptured(entry) {
  const runId = entry?.runId;
  if (!runId || typeof runId !== 'string') return;

  const metadata = mergeMetadata(entry.metadata, {
    capture: {
      status: entry.status ?? null,
      assistantMessageId: entry.assistantMessageId ?? null,
      waitedMs: entry.waitedMs ?? null,
      capturedAt: Number.isFinite(entry.capturedAt) ? entry.capturedAt : Date.now()
    }
  });

  await enqueueOutbox({
    runId,
    prompt: normalizeText(entry.prompt, MAX_PROMPT_CHARS),
    response: normalizeText(entry.response, MAX_RESPONSE_CHARS),
    chatId: entry.chatId ?? null,
    chatUrl: entry.chatUrl ?? null,
    timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
    metadata
  });

  flushChatHistoryOutbox({ runIds: [runId], reason: 'response_captured' }).catch((err) => {
    logger.debug('Response outbox flush deferred', { runId, errorMessage: err?.message || String(err) });
  });
}
