/**
 * @fileoverview ChatGPT Provider — wraps the existing ChatGPT DOM automation
 * Ticket: XST-775 — Multi-LLM Provider Interface
 * Fix: XST-793 — Replace dynamic import with DI for MV3 compliance
 *
 * This provider delegates to the existing ChatGPT tab + content script approach.
 * It does NOT call the OpenAI REST API directly (uses the web UI).
 * As a result, no API key is required for this provider.
 *
 * The `enqueue` function is injected via constructor (Dependency Injection)
 * to avoid dynamic `import()` which is not MV3-safe in Service Workers.
 */

import { LLMProvider } from './LLMProvider.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ChatGPTProvider');

export class ChatGPTProvider extends LLMProvider {
  /** @type {Function} Injected enqueue function from promptQueue */
  #enqueue;

  /**
   * @param {{ enqueue: Function }} deps - Injected dependencies
   * @param {Function} deps.enqueue - enqueue(config) from promptQueue service
   */
  constructor(deps = {}) {
    super();
    this.#enqueue = deps.enqueue;
    if (!this.#enqueue) {
      logger.warn('ChatGPTProvider created without enqueue function — sendPrompt will fail');
    }
  }

  get name() { return 'chatgpt'; }

  /**
   * sendPrompt — queue the prompt through the existing background prompt queue
   * which uses the ChatGPT web UI via content script.
   *
   * @param {string} prompt
   * @param {{ runId?: string, createNewChat?: boolean }} [options]
   */
  async sendPrompt(prompt, options = {}) {
    if (!this.#enqueue) {
      throw new Error('ChatGPTProvider: enqueue function not injected. Pass { enqueue } to constructor.');
    }

    const enqueue = this.#enqueue;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: ChatGPT không phản hồi sau 120 giây')), 120_000);

      enqueue({
        prompt,
        runId: options.runId || `chatgpt-${Date.now()}`,
        createNewChat: options.createNewChat ?? false,
        onDone: (text) => {
          clearTimeout(timeout);
          resolve({ text, usage: { inputTokens: 0, outputTokens: 0 } });
        },
        onError: (err) => {
          clearTimeout(timeout);
          reject(new Error(this.formatError(err)));
        },
      });
    });
  }

  async getStatus() {
    try {
      // Check if a ChatGPT tab is open
      const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
      return tabs.length > 0 ? 'connected' : 'disconnected';
    } catch {
      return 'error';
    }
  }

  getCapabilities() {
    return { streaming: false, vision: false, tools: false };
  }
}
