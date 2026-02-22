/**
 * @fileoverview Claude Provider — Anthropic Messages API
 * Ticket: XST-775 — Multi-LLM Provider Interface
 *
 * @deprecated This API-based provider will be replaced by ClaudeWebProvider.js
 *             (XST-813) which uses Web/DOM automation on claude.ai tabs,
 *             following the same pattern as ChatGPTProvider. No API key needed.
 *
 * @todo XST-813 — Implement ClaudeWebProvider (Web/DOM automation)
 * @todo XST-815 — Update LLMProviderFactory to route to ClaudeWebProvider
 *
 * Original description:
 * Pro/Enterprise feature: requires Anthropic API key stored in Supabase settings.
 * Default model: claude-3-5-haiku-20241022 (fast + affordable)
 * Docs: https://docs.anthropic.com/en/api/messages
 *
 * Security:
 *  - API key fetched from Supabase settings at runtime (never in code)
 *  - No key stored in chrome.storage.local beyond the session
 */

import { LLMProvider } from './LLMProvider.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ClaudeProvider');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL  = 'claude-3-5-haiku-20241022';
const API_VERSION    = '2023-06-01';

export class ClaudeProvider extends LLMProvider {
  /**
   * @param {string} apiKey — Anthropic API key (fetched from Supabase settings)
   * @param {string} [model]
   */
  constructor(apiKey, model = DEFAULT_MODEL) {
    super();
    this._apiKey = apiKey;
    this._model  = model;
  }

  get name() { return 'claude'; }

  async sendPrompt(prompt, options = {}) {
    if (!this._apiKey) throw new Error('Claude API key chưa được cấu hình. Vào Settings → LLM Provider.');

    const body = {
      model: this._model,
      max_tokens: options.maxTokens ?? 4096,
      messages: [{ role: 'user', content: prompt }],
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
    };

    logger.info('Sending prompt to Claude', { model: this._model, chars: prompt.length });

    let response;
    try {
      response = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      throw new Error(this.formatError(networkErr));
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(this.formatError(new Error(errMsg)));
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text).join('') || '';
    const usage = {
      inputTokens:  data.usage?.input_tokens  ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };

    logger.info('Claude response received', { outputTokens: usage.outputTokens });
    return { text, usage };
  }

  async getStatus() {
    if (!this._apiKey) return 'disconnected';
    try {
      // Minimal check: fetch model list (lightweight)
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': this._apiKey, 'anthropic-version': API_VERSION },
      });
      return res.ok ? 'connected' : 'error';
    } catch {
      return 'error';
    }
  }

  getCapabilities() {
    return { streaming: false, vision: true, tools: true };
  }
}
