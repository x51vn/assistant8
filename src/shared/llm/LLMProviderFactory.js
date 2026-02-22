/**
 * @fileoverview LLM Provider Factory
 * Ticket: XST-775 — Multi-LLM Provider Interface
 *
 * Resolves the active LLM provider based on Supabase settings.
 * Reading settings from Supabase is done in the background handler
 * so this factory receives provider config as a plain object.
 *
 * Usage (background handler):
 *   const config = await getProviderConfig(userId);
 *   const provider = LLMProviderFactory.create(config, { enqueue });
 *   const { text } = await provider.sendPrompt(prompt);
 */

import { ChatGPTProvider } from './ChatGPTProvider.js';
import { ClaudeProvider }  from './ClaudeProvider.js';
import { GeminiProvider }  from './GeminiProvider.js';

/** @typedef {'chatgpt' | 'claude' | 'gemini'} ProviderName */

/**
 * @typedef {Object} ProviderConfig
 * @property {ProviderName} provider - Active provider id
 * @property {string} [claudeApiKey]
 * @property {string} [geminiApiKey]
 * @property {string} [claudeModel]
 * @property {string} [geminiModel]
 */

export const SUPPORTED_PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT (Web)', plans: ['free', 'pro', 'enterprise'], requiresKey: false },
  { id: 'claude',  name: 'Claude (Anthropic)', plans: ['pro', 'enterprise'],    requiresKey: true  },
  { id: 'gemini',  name: 'Gemini (Google AI)', plans: ['pro', 'enterprise'],    requiresKey: true  },
];

/**
 * @typedef {Object} ProviderDeps
 * @property {Function} [enqueue] - enqueue function from promptQueue (required for ChatGPT)
 */

export class LLMProviderFactory {
  /**
   * Create and return a configured LLMProvider instance.
   * @param {ProviderConfig} config
   * @param {ProviderDeps} [deps] - External dependencies (DI)
   * @returns {import('./LLMProvider.js').LLMProvider}
   */
  static create(config = {}, deps = {}) {
    const { provider = 'chatgpt', claudeApiKey, geminiApiKey, claudeModel, geminiModel } = config;

    switch (provider) {
      case 'claude':
        return new ClaudeProvider(claudeApiKey || '', claudeModel);
      case 'gemini':
        return new GeminiProvider(geminiApiKey || '', geminiModel);
      case 'chatgpt':
      default:
        return new ChatGPTProvider({ enqueue: deps.enqueue });
    }
  }

  /**
   * Get provider metadata (capabilities, plan requirements).
   * @param {ProviderName} providerId
   */
  static getMeta(providerId) {
    return SUPPORTED_PROVIDERS.find(p => p.id === providerId) || SUPPORTED_PROVIDERS[0];
  }
}
