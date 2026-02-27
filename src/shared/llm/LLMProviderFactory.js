/**
 * @fileoverview LLM Provider Factory
 * Ticket: XST-775 — Multi-LLM Provider Interface
 * Updated: XST-815 — Migrated to Web/DOM providers (no API keys)
 *
 * Resolves the active LLM provider based on Supabase settings.
 * Reading settings from Supabase is done in the background handler
 * so this factory receives provider config as a plain object.
 *
 * @done XST-815 — All providers now use Web/DOM automation:
 *   - ChatGPT → ChatGPTProvider (chatgpt.com content script)
 *   - Claude  → ClaudeWebProvider (claude.ai content script)
 *   - Gemini  → GeminiWebProvider (gemini.google.com content script)
 *   - No API keys required for any provider
 *   - All providers use DI-based {enqueue} pattern
 *
 * Usage (background handler):
 *   const config = await getProviderConfig(userId);
 *   const provider = LLMProviderFactory.create(config, { enqueue });
 *   const { text } = await provider.sendPrompt(prompt);
 */

import { ChatGPTProvider }   from './ChatGPTProvider.js';
import { ClaudeWebProvider } from './ClaudeWebProvider.js';
import { GeminiWebProvider } from './GeminiWebProvider.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('LLM/Factory');

/** @typedef {'chatgpt' | 'claude' | 'gemini'} ProviderName */

/**
 * @typedef {Object} ProviderConfig
 * @property {ProviderName} provider - Active provider id
 */

/**
 * All providers use Web/DOM automation — no API keys, all free-tier.
 * @done XST-815
 */
export const SUPPORTED_PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT (Web)',  plans: ['free', 'pro', 'enterprise'], requiresKey: false },
  { id: 'claude',  name: 'Claude (Web)',   plans: ['free', 'pro', 'enterprise'], requiresKey: false },
  { id: 'gemini',  name: 'Gemini (Web)',   plans: ['free', 'pro', 'enterprise'], requiresKey: false },
];

/**
 * @typedef {Object} ProviderDeps
 * @property {Function} [enqueue] - enqueue function from promptQueue (required for all providers)
 */

export class LLMProviderFactory {
  /**
   * Create and return a configured LLMProvider instance.
   * All providers use Web/DOM automation with DI-based enqueue.
   *
   * @param {ProviderConfig} config
   * @param {ProviderDeps} [deps] - External dependencies (DI)
   * @returns {import('./LLMProvider.js').LLMProvider}
   */
  static create(config = {}, deps = {}) {
    const { provider = 'chatgpt' } = config;
    logger.info('Creating LLM provider', { provider, hasEnqueue: !!deps.enqueue });

    switch (provider) {
      case 'claude':
        return new ClaudeWebProvider({ enqueue: deps.enqueue });
      case 'gemini':
        return new GeminiWebProvider({ enqueue: deps.enqueue });
      case 'chatgpt':
      default:
        if (provider !== 'chatgpt') {
          logger.warn('Unknown provider, falling back to chatgpt', { requestedProvider: provider });
        }
        return new ChatGPTProvider({ enqueue: deps.enqueue });
    }
  }

  /**
   * Get provider metadata (capabilities, plan requirements).
   * @param {ProviderName} providerId
   */
  static getMeta(providerId) {
    const meta = SUPPORTED_PROVIDERS.find(p => p.id === providerId);
    if (!meta) {
      logger.debug('getMeta: unknown providerId, using first provider', { providerId });
    }
    return meta || SUPPORTED_PROVIDERS[0];
  }
}
