/**
 * @fileoverview Gemini Provider — Google AI Gemini API
 * Ticket: XST-775 — Multi-LLM Provider Interface
 *
 * @deprecated This API-based provider will be replaced by GeminiWebProvider.js
 *             (XST-814) which uses Web/DOM automation on gemini.google.com tabs,
 *             following the same pattern as ChatGPTProvider. No API key needed.
 *
 * @todo XST-814 — Implement GeminiWebProvider (Web/DOM automation)
 * @todo XST-815 — Update LLMProviderFactory to route to GeminiWebProvider
 *
 * Original description:
 * Pro/Enterprise feature: requires Google AI API key stored in Supabase settings.
 * Default model: gemini-1.5-flash (fast + free tier available)
 * Docs: https://ai.google.dev/api/generate-content
 */

import { LLMProvider } from './LLMProvider.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('GeminiProvider');

const DEFAULT_MODEL = 'gemini-1.5-flash';

export class GeminiProvider extends LLMProvider {
  /**
   * @param {string} apiKey — Google AI API key
   * @param {string} [model]
   */
  constructor(apiKey, model = DEFAULT_MODEL) {
    super();
    this._apiKey = apiKey;
    this._model  = model;
  }

  get name() { return 'gemini'; }

  _apiUrl() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this._model}:generateContent?key=${this._apiKey}`;
  }

  async sendPrompt(prompt, options = {}) {
    if (!this._apiKey) throw new Error('Gemini API key chưa được cấu hình. Vào Settings → LLM Provider.');

    const contents = [];
    if (options.systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: `[System]: ${options.systemPrompt}` }] });
      contents.push({ role: 'model', parts: [{ text: 'Tôi hiểu. Hãy tiếp tục.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 4096,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
      },
    };

    logger.info('Sending prompt to Gemini', { model: this._model, chars: prompt.length });

    let response;
    try {
      response = await fetch(this._apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const usage = {
      inputTokens:  data.usageMetadata?.promptTokenCount     ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };

    logger.info('Gemini response received', { outputTokens: usage.outputTokens });
    return { text, usage };
  }

  async getStatus() {
    if (!this._apiKey) return 'disconnected';
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this._apiKey}`
      );
      return res.ok ? 'connected' : 'error';
    } catch {
      return 'error';
    }
  }

  getCapabilities() {
    return { streaming: false, vision: true, tools: false };
  }
}
