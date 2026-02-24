/**
 * @fileoverview ChatGPT Provider — wraps the existing ChatGPT DOM automation
 * Ticket: XST-775 — Multi-LLM Provider Interface
 * Fix: XST-793 — Replace dynamic import with DI for MV3 compliance
 * Fix: XST-821 — sendPrompt() now uses async-function pattern (mirrors GeminiWebProvider)
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
import * as ChatGPTSession from '../../chatgptSession.js';

const logger = createLogger('ChatGPTProvider');

/** Default timeout for the full send→receive cycle */
const DEFAULT_TIMEOUT_MS = 120_000;

export class ChatGPTProvider extends LLMProvider {
  /** @type {Function} Injected enqueue function from promptQueue */
  #enqueue;

  /**
   * @param {{ enqueue: Function }} deps - Injected dependencies
   * @param {Function} deps.enqueue - enqueue(asyncFn) from promptQueue service
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
   * sendPrompt — send prompt to ChatGPT web UI and await the complete response.
   *
   * XST-821: Uses async-function enqueue pattern (mirrors GeminiWebProvider/ClaudeWebProvider).
   * The full response is awaited so callers do NOT need to poll CHATGPT_GET_OUTPUT.
   *
   * @param {string} prompt
   * @param {{ runId?: string, createNewChat?: boolean, focusTab?: boolean, timeoutMs?: number }} [options]
   * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number } }>}
   */
  async sendPrompt(prompt, options = {}) {
    if (!this.#enqueue) {
      throw new Error('ChatGPTProvider: enqueue function not injected. Pass { enqueue } to constructor.');
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Prompt không được để trống.');
    }

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const runId = options.runId || `chatgpt-${Date.now()}`;

    logger.info('sendPrompt: queuing ChatGPT request', { runId, chars: prompt.length });

    // Serialize through p-queue (concurrency=1) — same pattern as GeminiWebProvider
    return this.#enqueue(async () => {
      const startTime = Date.now();

      // 1. Ensure ChatGPT tab is ready
      const tabResult = await ChatGPTSession.ensureChatGPTTab({
        createIfNeeded: true,
        focusTab: options.focusTab !== false,
      });

      if (tabResult.error) {
        throw new Error(typeof tabResult.error === 'string' ? tabResult.error : 'Failed to ensure ChatGPT tab');
      }

      const { tabId } = tabResult;
      logger.info('sendPrompt: ChatGPT tab ready', { tabId, runId });

      // 2. Inject prompt
      const sendResult = await ChatGPTSession.sendInput(tabId, prompt.trim(), {
        createNewChat: options.createNewChat ?? false,
        runId,
        reviewOnly: false,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Failed to send prompt to ChatGPT');
      }

      // 3. Await full response — with remaining timeout
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(timeoutMs - elapsed, 10_000);
      const getOutputTimeoutId = setTimeout(() => {}, 0); // unused, kept for clarity

      const outputResult = await Promise.race([
        ChatGPTSession.getOutput(tabId, { runId, wait: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: ChatGPT không phản hồi')), remainingMs)
        ),
      ]);

      clearTimeout(getOutputTimeoutId);

      if (!outputResult?.success || !outputResult?.data?.result) {
        throw new Error(outputResult?.error || 'ChatGPT không trả về kết quả.');
      }

      logger.info('sendPrompt: ChatGPT response received', {
        runId,
        chars: outputResult.data.result.length,
        elapsed: Date.now() - startTime,
      });

      return {
        text: outputResult.data.result,
        usage: { inputTokens: 0, outputTokens: 0 },
        chatId: sendResult.data?.chatId || null,
        chatUrl: sendResult.data?.chatUrl || null,
      };
    });
  }

  async getStatus() {
    try {
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

