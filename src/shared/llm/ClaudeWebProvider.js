/**
 * @fileoverview Claude Web Provider — wraps Claude DOM automation (no API key)
 * Ticket: XST-814 — Claude Web Provider
 *
 * This provider uses the Claude web UI (claude.ai) via a content script.
 * No API key is required — the user must be logged in with their Anthropic account.
 *
 * Architecture (mirrors GeminiWebProvider / ChatGPTProvider pattern):
 *   1. Find or create claude.ai tab
 *   2. Wait for content script to be ready (ping/pong)
 *   3. Send prompt via chrome.tabs.sendMessage → content script injects into DOM
 *   4. Poll for response via chrome.tabs.sendMessage → content script extracts text
 *
 * The `enqueue` function is injected via constructor (Dependency Injection)
 * to serialize concurrent requests through p-queue (concurrency=1).
 */

import { LLMProvider } from './LLMProvider.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ClaudeWebProvider');

/** @type {string} */
const CLAUDE_URL = 'https://claude.ai/new';

/** @type {string} */
const CLAUDE_URL_PATTERN = 'https://claude.ai/*';

/** Default timeout for the full send→receive cycle */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Max retries for content script ping */
const MAX_PING_RETRIES = 15;

/** Delay between ping retries (ms) */
const PING_RETRY_DELAY_MS = 500;

export class ClaudeWebProvider extends LLMProvider {
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
      logger.warn('ClaudeWebProvider created without enqueue function — sendPrompt will fail');
    }
  }

  get name() { return 'claude'; }

  /**
   * Send a prompt to Claude web UI and wait for the response.
   *
   * @param {string} prompt
   * @param {{ runId?: string, createNewChat?: boolean, timeoutMs?: number }} [options]
   * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number } }>}
   */
  async sendPrompt(prompt, options = {}) {
    if (!this.#enqueue) {
      throw new Error('ClaudeWebProvider: enqueue function not injected. Pass { enqueue } to constructor.');
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Prompt không được để trống.');
    }

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const runId = options.runId || `claude-${Date.now()}`;

    logger.info('sendPrompt: queuing Claude request', { runId, chars: prompt.length });

    // Serialize through p-queue (concurrency=1)
    return this.#enqueue(async () => {
      const startTime = Date.now();

      // 1. Find or create Claude tab (always reuse if available)
      const tabId = await this.#ensureClaudeTab();
      logger.info('sendPrompt: Claude tab ready', { tabId, runId });

      // 2. Check login status
      const loginStatus = await this.#sendToTab(tabId, { action: 'check_login' });
      if (loginStatus && loginStatus.loggedIn === false) {
        throw new Error('Bạn chưa đăng nhập Claude. Vui lòng đăng nhập tại claude.ai.');
      }

      // 3. Create new session if requested
      if (options.createNewChat) {
        await this.#sendToTab(tabId, { action: 'create_new_session' });
        // Wait for new session to initialize
        await new Promise(r => setTimeout(r, 1000));
      }

      // 4. Inject prompt
      const injectResult = await this.#sendToTab(tabId, {
        action: 'inject_prompt',
        prompt,
      });

      if (!injectResult?.success) {
        throw new Error(injectResult?.error || 'Không thể gửi prompt tới Claude.');
      }

      // 5. Extract response (with remaining timeout)
      const elapsed = Date.now() - startTime;
      const remainingMs = Math.max(timeoutMs - elapsed, 10_000);

      const extractResult = await this.#sendToTab(tabId, {
        action: 'extract_response',
        options: {
          timeoutMs: remainingMs,
          stableMs: 2000,
          pollIntervalMs: 500,
        },
      });

      if (!extractResult?.success || !extractResult?.text) {
        throw new Error(extractResult?.error || 'Claude không phản hồi.');
      }

      logger.info('sendPrompt: Claude response received', {
        runId,
        chars: extractResult.text.length,
        elapsed: Date.now() - startTime,
      });

      return {
        text: extractResult.text,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    });
  }

  /**
   * Check Claude connection status.
   * @returns {Promise<'connected' | 'disconnected' | 'error'>}
   */
  async getStatus() {
    try {
      const tabs = await chrome.tabs.query({ url: CLAUDE_URL_PATTERN });
      if (tabs.length === 0) return 'disconnected';

      // Try to ping the content script
      try {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' });
        if (response?.pong) return 'connected';
      } catch {
        // Content script not responding
      }

      return 'disconnected';
    } catch {
      return 'error';
    }
  }

  getCapabilities() {
    return { streaming: false, vision: false, tools: false };
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Find existing Claude tab or create a new one.
   * Waits for the content script to be ready.
   *
   * @param {boolean} [forceNew=false] - Force create new tab
   * @returns {Promise<number>} Tab ID
   */
  async #ensureClaudeTab(forceNew = false) {
    let tabId = null;

    if (!forceNew) {
      // Find existing Claude tab
      const tabs = await chrome.tabs.query({ url: CLAUDE_URL_PATTERN });
      if (tabs.length > 0) {
        tabId = tabs[0].id;
        // Focus the tab
        await chrome.tabs.update(tabId, { active: true });
        logger.debug('ensureClaudeTab: Reusing existing tab', { tabId });
      }
    }

    if (!tabId) {
      // Create new Claude tab
      const tab = await chrome.tabs.create({ url: CLAUDE_URL, active: false });
      tabId = tab.id;
      logger.info('ensureClaudeTab: Created new Claude tab', { tabId });

      // Wait for tab to finish loading
      await this.#waitForTabLoad(tabId, 30_000);

      // Additional wait for Claude app to initialize
      await new Promise(r => setTimeout(r, 2000));
    }

    // Wait for content script to be ready
    const ready = await this.#waitForContentScript(tabId);
    if (!ready) {
      throw new Error('Claude content script không sẵn sàng. Vui lòng thử lại.');
    }

    return tabId;
  }

  /**
   * Wait for a tab to finish loading.
   * @param {number} tabId
   * @param {number} timeoutMs
   * @returns {Promise<void>}
   */
  #waitForTabLoad(tabId, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
      };

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // Check if already complete
      chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') {
          cleanup();
          resolve();
        }
      }).catch(err => {
        cleanup();
        reject(err);
      });

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Claude tab load timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Wait for content script to become ready via ping/pong.
   * @param {number} tabId
   * @returns {Promise<boolean>}
   */
  async #waitForContentScript(tabId) {
    for (let i = 0; i < MAX_PING_RETRIES; i++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        if (response?.pong && response?.provider === 'claude') {
          logger.debug('waitForContentScript: Claude content script ready', {
            tabId,
            attempt: i + 1,
          });
          return true;
        }
      } catch {
        // Content script not ready yet
      }

      if (i < MAX_PING_RETRIES - 1) {
        await new Promise(r => setTimeout(r, PING_RETRY_DELAY_MS));
      }
    }

    logger.warn('waitForContentScript: Claude content script not ready after retries', {
      tabId,
      retries: MAX_PING_RETRIES,
    });
    return false;
  }

  /**
   * Send a message to the Claude tab and return the response.
   * @param {number} tabId
   * @param {Object} message
   * @returns {Promise<Object>}
   */
  async #sendToTab(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes('Receiving end does not exist') ||
          errorMsg.includes('Could not establish connection')) {
        throw new Error('Claude content script không phản hồi. Vui lòng mở lại tab Claude.');
      }
      throw err;
    }
  }
}
