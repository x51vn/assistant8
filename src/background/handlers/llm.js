/**
 * @fileoverview Unified LLM Handler
 *
 * Merged from:
 *   - handlers/prompt.js  (SEND_PROMPT — provider-aware, XST-816)
 *   - handlers/llmProvider.js  (LLM_ management handlers, XST-775)
 *
 * Handles all LLM-related background messages:
 *   SEND_PROMPT        — Sends a prompt via the active LLM provider (ChatGPT / Gemini / Claude).
 *                        Uses LLMProviderFactory for ALL providers — no more hardcoded PATH B.
 *   LLM_GET_PROVIDERS  — List available providers with plan requirements.
 *   LLM_SEND_PROMPT    — Legacy alias routed to the same SEND_PROMPT pipeline.
 *   LLM_GET_STATUS     — Check connection status of the active provider.
 *   LLM_SET_PROVIDER   — Update provider selection in Supabase settings.
 *
 * Exports (used by other handlers):
 *   getProviderConfig(userId)  — Returns { provider } from Supabase settings.
 *   getUserPlan(userId)        — Returns plan ID from subscriptions table.
 */

import { registerHandler } from '../messageRouter.js';
import {
  MESSAGE_TYPES,
  createResponse,
  createErrorResponse,
} from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../types.js';
import { LLMProviderFactory, SUPPORTED_PROVIDERS } from '../../shared/llm/LLMProviderFactory.js';
import { enqueue } from '../services/promptQueue.js';
import { persistPromptSafe } from './_persistPromptHelper.js';
import { recordResponseCaptured } from '../services/chatHistoryService.js';

const logger = createLogger('LLMHandler');

// ============================================================
// HELPERS (exported for reuse by other handlers)
// ============================================================

/**
 * Returns the active LLM provider config from Supabase settings.
 * @param {string} userId
 * @returns {{ provider: string }}
 * @throws {Error} if Supabase query fails (caller should handle fallback)
 */
export async function getProviderConfig(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('config')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Throw so caller knows this is a config-read failure (not a missing setting)
    throw new Error(`getProviderConfig: Supabase error — ${error.message}`);
  }

  const config = data?.config || {};
  logger.debug('getProviderConfig: resolved provider', { provider: config.llm_provider || 'chatgpt' });
  return {
    provider: config.llm_provider || 'chatgpt',
  };
}

/**
 * Returns the active subscription plan for a user.
 * @param {string} userId
 * @returns {string} plan ID (defaults to 'free')
 */
export async function getUserPlan(userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return data?.plan_id || 'free';
}

// ============================================================
// SEND_PROMPT
// Send a prompt via the active LLM provider.
// All providers (chatgpt, gemini, claude) go through LLMProviderFactory.
// The full response text is returned immediately in the payload (no polling needed).
//
// Fix: XST-816 — was hardcoded to ChatGPT; now routes via LLMProviderFactory.
// Fix: XST-820 — getProviderForFeature(FEATURE_TYPES.CHAT) routing key fixed.
// ============================================================
registerHandler(MESSAGE_TYPES.SEND_PROMPT, async (message) => {
  return handleUnifiedSendPrompt(message, {
    source: 'SEND_PROMPT',
    responseType: MESSAGE_TYPES.PROMPT_SENT,
  });
});

/**
 * Unified send-prompt pipeline for all entry routes.
 * Any legacy route must call this to guarantee a single execution path.
 *
 * @param {object} message
 * @param {{ source: string, responseType: string }} params
 * @returns {Promise<object>}
 */
async function handleUnifiedSendPrompt(message, { source, responseType }) {
  const correlationId = logger.startOperation('sendPrompt', message.correlationId);
  const normalized = message.payload || message.data || message || {};
  const { prompt, options } = normalized;
  const runId = message.correlationId;

  try {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      logger.warn('Invalid prompt', { correlationId });
      logger.endOperation(correlationId, 'error', { reason: 'invalid_prompt' });
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Missing or invalid prompt');
    }

    // ── Step 1: Authenticate ──────────────────────────────────────────────────
    // If auth fails, return an error immediately.
    // DO NOT fall back to any provider — the user must re-login to know their
    // configured provider, otherwise we would silently route to the wrong LLM.
    let userId;
    try {
      userId = await requireAuth(message);
    } catch (authErr) {
      logger.warn('requireAuth failed in SEND_PROMPT — aborting (no silent ChatGPT fallback)', { correlationId });
      logger.endOperation(correlationId, 'error', { reason: 'auth_failed' });
      // requireAuth throws a pre-formatted error response object when the user is not authenticated
      if (authErr?.errorCode) return authErr;
      return createErrorResponse(message, ERROR_CODES.AUTH_REQUIRED, 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    }

    // ── Step 2: Resolve provider from Supabase, with local-storage cache ─────
    // On Supabase failure we use the last-known provider cached in chrome.storage.local
    // so the user's selection survives transient network issues.
    let providerName = 'chatgpt'; // fallback only when both Supabase AND cache miss
    try {
      const config = await getProviderConfig(userId);
      providerName = config.provider || 'chatgpt';
      // Cache so next call survives a Supabase hiccup
      chrome.storage.local.set({ __llm_provider_cache: providerName }).catch(() => {});
    } catch (configErr) {
      logger.warn('getProviderConfig failed — trying local cache', { correlationId, error: configErr?.message });
      try {
        const cached = await chrome.storage.local.get(['__llm_provider_cache']);
        providerName = cached.__llm_provider_cache || 'chatgpt';
        logger.info('Using locally cached provider', { correlationId, providerName });
      } catch {
        providerName = 'chatgpt';
      }
    }

    logger.info('Sending prompt via provider', { correlationId, promptLength: prompt.length, provider: providerName });

    // All providers go through LLMProviderFactory (ChatGPTProvider is now fixed to use async-fn enqueue)
    const provider = LLMProviderFactory.create({ provider: providerName }, { enqueue });

    const providerResult = await provider.sendPrompt(prompt.trim(), {
      runId,
      createNewChat: options?.createNewChat !== false,
      timeoutMs: options?.timeoutMs,
      focusTab: options?.focusTab !== false,
      reviewOnly: options?.reviewOnly || false,
    });

    const { text, usage } = providerResult;
    // Preserve chatId/chatUrl returned by ChatGPTProvider (null for Gemini/Claude)
    const chatId = providerResult.chatId || null;
    const chatUrl = providerResult.chatUrl || null;

    // Persist to chat_history
    if (options?.saveToHistory !== false) {
      // Phase 1: save prompt (non-blocking on failure)
      await persistPromptSafe(runId, prompt, chatId, chatUrl, {
        source,
        provider: providerName,
        ...(options?.metadata || {}),
      });

      // Phase 2: save AI response immediately.
      // For the unified provider path (ChatGPT/Gemini/Claude via SEND_PROMPT), the response
      // is returned synchronously here — we must persist it now.
      // (The legacy ChatGPT path also sends CONTENT_RESPONSE_CAPTURED separately, but
      // that handler deduplicates via run_id so double-writes are safe.)
      if (text) {
        recordResponseCaptured({
          runId,
          prompt,
          response: text,
          chatId,
          chatUrl,
          timestamp: Date.now(),
          metadata: {
            source,
            provider: providerName,
            capture: { status: 'complete', capturedAt: Date.now() },
            ...(options?.metadata || {}),
          },
        }).catch((err) => {
          logger.warn('Failed to persist LLM response to chat_history', {
            correlationId: runId,
            error: err?.message,
          });
        });
      }
    }

    logger.endOperation(correlationId, 'success');
    return createResponse(message, responseType, {
      success: true,
      text,
      usage,
      provider: providerName,
      runId,
      chatId,
      chatUrl,
    });

  } catch (error) {
    logger.error('Send prompt failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
}

// ============================================================
// LLM_GET_PROVIDERS
// List available providers with plan information.
// ============================================================
registerHandler('LLM_GET_PROVIDERS', async (message) => {
  try {
    const userId = await requireAuth(message);
    const planId = await getUserPlan(userId);
    const config = await getProviderConfig(userId);

    const providers = SUPPORTED_PROVIDERS.map(p => ({
      ...p,
      available: p.plans.includes(planId),
      active: p.id === config.provider,
    }));

    return createResponse(message, 'LLM_PROVIDERS_DATA', {
      success: true,
      providers,
      activeProvider: config.provider,
      planId,
    });
  } catch (err) {
    return createErrorResponse(message, 'LLM_GET_PROVIDERS_ERROR', err?.message || 'Lấy danh sách LLM thất bại');
  }
});

// ============================================================
// LLM_SEND_PROMPT (legacy alias)
// Kept for backward compatibility but routed through SEND_PROMPT pipeline.
// ============================================================
registerHandler(MESSAGE_TYPES.LLM_SEND_PROMPT, async (message) => {
  logger.warn('LLM_SEND_PROMPT is deprecated. Route this caller to SEND_PROMPT.', {
    correlationId: message.correlationId,
  });
  return handleUnifiedSendPrompt(message, {
    source: 'LLM_SEND_PROMPT',
    responseType: MESSAGE_TYPES.LLM_RESPONSE,
  });
});

// ============================================================
// LLM_GET_STATUS
// Check connection status of the active LLM provider.
// ============================================================
registerHandler('LLM_GET_STATUS', async (message) => {
  try {
    const userId = await requireAuth(message);
    const config = await getProviderConfig(userId);
    const provider = LLMProviderFactory.create(config, { enqueue });
    const status = await provider.getStatus();
    const capabilities = provider.getCapabilities();

    return createResponse(message, 'LLM_STATUS', {
      success: true,
      provider: config.provider,
      status,
      capabilities,
    });
  } catch (err) {
    return createErrorResponse(message, 'LLM_STATUS_ERROR', err?.message || 'Kiểm tra trạng thái LLM thất bại');
  }
});

// ============================================================
// LLM_SET_PROVIDER
// Update the active LLM provider in Supabase settings.
// ============================================================
registerHandler('LLM_SET_PROVIDER', async (message) => {
  const correlationId = message.correlationId;
  const { provider } = message;

  const validProviders = SUPPORTED_PROVIDERS.map(p => p.id);
  if (!validProviders.includes(provider)) {
    return createErrorResponse(message, 'VALIDATION_ERROR', `Provider không hợp lệ: ${provider}`);
  }

  try {
    const userId = await requireAuth(message);

    const { data: existing } = await supabase
      .from('settings')
      .select('config')
      .eq('user_id', userId)
      .maybeSingle();

    const currentConfig = existing?.config || {};
    const updates = {
      ...currentConfig,
      llm_provider: provider,
    };

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('settings')
        .upsert({ user_id: userId, config: updates }, { onConflict: 'user_id' });
      if (error) throw error;
    }, { operationName: 'setLLMProvider', correlationId });

    logger.info('LLM provider updated', { provider, correlationId });
    return createResponse(message, 'LLM_PROVIDER_SET', { success: true, provider });
  } catch (err) {
    logger.error('LLM_SET_PROVIDER failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'LLM_SET_ERROR', err?.message || 'Cập nhật LLM provider thất bại');
  }
});
