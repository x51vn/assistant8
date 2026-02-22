/**
 * @fileoverview LLM Provider Background Handler
 * Ticket: XST-775 — Multi-LLM Provider Interface
 * Updated: XST-815 — Web providers, no API keys needed
 *
 * @done XST-815 — Web provider migration complete:
 *   - All providers use Web/DOM automation (no API keys)
 *   - All providers are free-tier (no plan-gating)
 *   - API key fields removed from config
 *   - All providers use DI-based {enqueue} pattern
 *
 * Message types:
 *  LLM_GET_PROVIDERS  — list available providers with plan requirements
 *  LLM_SEND_PROMPT    — send prompt through the active LLM provider
 *  LLM_GET_STATUS     — check connection status of active provider
 *  LLM_SET_PROVIDER   — update provider selection in settings
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
import { LLMProviderFactory, SUPPORTED_PROVIDERS } from '../../shared/llm/LLMProviderFactory.js';
import { enqueue } from '../services/promptQueue.js'; // XST-793: Static import for DI

const logger = createLogger('LLMHandler');

// ============================================================
// HELPERS (exported for reuse by other handlers)
// ============================================================

export async function getProviderConfig(userId) {
  const { data } = await supabase
    .from('settings')
    .select('config')
    .eq('user_id', userId)
    .maybeSingle();

  const config = data?.config || {};
  return {
    provider: config.llm_provider || 'chatgpt',
    // @done XST-815: API key fields removed — all providers use Web/DOM automation
  };
}

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
// LLM_GET_PROVIDERS
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
// LLM_SEND_PROMPT
// ============================================================
registerHandler('LLM_SEND_PROMPT', async (message) => {
  const correlationId = message.correlationId;
  const { prompt, options = {} } = message;

  if (!prompt?.trim()) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu prompt');

  try {
    const userId = await requireAuth(message);
    const config = await getProviderConfig(userId);

    // @done XST-815: Plan-gating removed — all Web providers are free-tier

    const provider = LLMProviderFactory.create(config, { enqueue });
    logger.info('Sending via LLM provider', { provider: config.provider, chars: prompt.length, correlationId });

    const { text, usage } = await provider.sendPrompt(prompt, options);

    return createResponse(message, 'LLM_RESPONSE', {
      success: true,
      text,
      usage,
      provider: config.provider,
    });
  } catch (err) {
    logger.error('LLM_SEND_PROMPT failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'LLM_SEND_ERROR', err?.message || 'Gửi prompt thất bại');
  }
});

// ============================================================
// LLM_GET_STATUS
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

    // Merge into settings config (only provider selection, no API keys)
    const { data: existing } = await supabase
      .from('settings')
      .select('config')
      .eq('user_id', userId)
      .maybeSingle();

    const currentConfig = existing?.config || {};
    const updates = {
      ...currentConfig,
      llm_provider: provider,
      // @done XST-815: API key fields removed — Web providers don't need them
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
