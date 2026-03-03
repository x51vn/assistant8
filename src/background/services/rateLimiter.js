/**
 * @fileoverview Rate Limiter — tab concurrency, per-provider debounce, anti-detection
 * Ticket: XST-806 — Rate limiting & quota management (Web providers)
 *
 * Architecture:
 * - Tab concurrency limiter: max simultaneous web provider tabs (default 2)
 * - Per-provider debounce: min delay between requests to same provider
 * - Anti-detection: random delay jitter to humanize timing
 * - Priority queue: user-initiated > automated pipeline requests
 * - Request queue with max size + timeout
 * - Usage tracking: requests per provider per hour
 * - Captcha/block detection with exponential backoff
 *
 * MV3-safe: State persisted to chrome.storage.local, restored on SW wake.
 * All providers are web-based (no API keys) — rate limiting prevents
 * Google/Claude/Gemini from detecting automation.
 */

import { createLogger } from '../../logger.js';

const logger = createLogger('RateLimiter');

// ===== CONSTANTS =====

const STORAGE_KEY_USAGE = 'rate_limiter_usage';
const STORAGE_KEY_BACKOFF = 'rate_limiter_backoff';
const USAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Default debounce delays (ms) per provider */
const DEFAULT_DEBOUNCE = {
  'google-search': 3000,
  'chatgpt': 5000,
  'gemini-web': 5000,
  'claude-web': 5000,
};

/** Default configuration */
const DEFAULT_CONFIG = {
  maxConcurrentTabs: 2,
  maxQueueSize: 20,
  queueTimeoutMs: 5 * 60 * 1000, // 5 minutes
  jitterMs: 1000, // ±1 second random offset
  debounceOverrides: {},
};

/** Exponential backoff stages for captcha/block detection (ms) */
const BACKOFF_STAGES = [30_000, 60_000, 120_000];

// ===== TYPES =====

/**
 * @typedef {'user' | 'pipeline'} RequestPriority
 *   user: User-initiated research (high priority)
 *   pipeline: Automated background pipeline (low priority)
 */

/**
 * @typedef {Object} RateLimitRequest
 * @property {string} provider - Provider identifier (google-search, chatgpt, gemini-web, claude-web)
 * @property {RequestPriority} priority - Request priority
 * @property {Function} execute - async () => result
 * @property {string} [correlationId] - Trace ID
 */

// ===== RATE LIMITER CLASS =====

export class RateLimiter {
  /** @type {Map<string, number>} Provider → timestamp of last request completion */
  #lastRequestTime = new Map();

  /** @type {Array<QueueEntry>} Priority queue of pending requests */
  #queue = [];

  /** @type {number} Current number of active tab operations */
  #activeTabs = 0;

  /** @type {Object} Config */
  #config;

  /** @type {Map<string, number>} Provider → current backoff stage index */
  #backoffStage = new Map();

  /** @type {Object} Usage tracking: { provider: [{ timestamp, success }] } */
  #usageLog = {};

  /** @type {boolean} Whether currently processing queue */
  #processing = false;

  /** @type {Object} Storage adapter */
  #storage;

  /**
   * @param {Object} [config] - Configuration overrides
   * @param {number} [config.maxConcurrentTabs=2]
   * @param {number} [config.maxQueueSize=20]
   * @param {number} [config.queueTimeoutMs=300000]
   * @param {number} [config.jitterMs=1000]
   * @param {Object} [config.debounceOverrides] - Per-provider debounce overrides
   * @param {Object} [config.storage] - Storage adapter (default: chrome.storage.local)
   */
  constructor(config = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#storage = config.storage || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
  }

  // ===== PUBLIC API =====

  /**
   * Submit a request through the rate limiter.
   * Handles debounce, concurrency limiting, priority queuing, and anti-detection.
   *
   * @param {RateLimitRequest} request
   * @returns {Promise<any>} Result of request.execute()
   * @throws {Error} Queue full, timeout, or request execution error
   */
  async submit(request) {
    const { provider, priority = 'pipeline', execute, correlationId = '' } = request;

    // Validate
    if (!provider || typeof execute !== 'function') {
      throw new Error('RateLimiter: provider and execute function are required');
    }

    // Check queue size
    if (this.#queue.length >= this.#config.maxQueueSize) {
      logger.warn('Queue full — rejecting request', {
        provider, correlationId, queueSize: this.#queue.length,
        maxQueueSize: this.#config.maxQueueSize,
      });
      throw new Error(
        `Rate limiter queue is full (${this.#config.maxQueueSize} pending requests). ` +
        'Vui lòng đợi các request hiện tại hoàn thành.'
      );
    }

    return new Promise((resolve, reject) => {
      const entry = {
        provider,
        priority,
        execute,
        correlationId,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timeoutId: null,
      };

      // Set queue timeout
      entry.timeoutId = setTimeout(() => {
        this.#removeFromQueue(entry);
        const err = new Error(
          `Rate limiter timeout: request pending > ${Math.round(this.#config.queueTimeoutMs / 60000)} minutes.`
        );
        err.code = 'RATE_LIMIT_TIMEOUT';
        logger.warn('Queue timeout', { provider, correlationId });
        reject(err);
      }, this.#config.queueTimeoutMs);

      // Insert into queue with priority ordering
      this.#insertByPriority(entry);

      logger.debug('Request queued', {
        provider, priority, correlationId,
        queueSize: this.#queue.length, activeTabs: this.#activeTabs,
      });

      // Try to process
      this.#processQueue();
    });
  }

  /**
   * Report a captcha or block detection from a content script.
   * Triggers exponential backoff for the provider.
   *
   * @param {string} provider - Provider that was blocked
   * @param {string} [correlationId]
   */
  async reportBlock(provider, correlationId = '') {
    const currentStage = this.#backoffStage.get(provider) ?? -1;
    const nextStage = Math.min(currentStage + 1, BACKOFF_STAGES.length - 1);
    this.#backoffStage.set(provider, nextStage);

    const backoffMs = BACKOFF_STAGES[nextStage];
    logger.warn('Block/captcha detected — applying exponential backoff', {
      provider, correlationId, stage: nextStage, backoffMs,
    });

    this.#logUsage(provider, false, 'blocked');
    await this.#persistBackoff();
  }

  /**
   * Clear backoff state for a provider (e.g., after manual resolution).
   *
   * @param {string} provider
   */
  async clearBackoff(provider) {
    this.#backoffStage.delete(provider);
    await this.#persistBackoff();
    logger.info('Backoff cleared', { provider });
  }

  /**
   * Get usage statistics for all providers.
   *
   * @returns {Object} { provider: { total, successful, failed, blocked, requestsLastHour } }
   */
  getUsageStats() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const stats = {};

    for (const [provider, logs] of Object.entries(this.#usageLog)) {
      // Filter out stale entries (> 24h)
      const valid = logs.filter(l => now - l.timestamp < USAGE_TTL_MS);
      const lastHour = valid.filter(l => l.timestamp > oneHourAgo);

      stats[provider] = {
        total: valid.length,
        successful: valid.filter(l => l.success).length,
        failed: valid.filter(l => !l.success && l.reason !== 'blocked').length,
        blocked: valid.filter(l => l.reason === 'blocked').length,
        requestsLastHour: lastHour.length,
      };
    }

    return stats;
  }

  /**
   * Get current queue/limiter state for debugging.
   *
   * @returns {Object}
   */
  getState() {
    return {
      activeTabs: this.#activeTabs,
      maxConcurrentTabs: this.#config.maxConcurrentTabs,
      queueSize: this.#queue.length,
      maxQueueSize: this.#config.maxQueueSize,
      providers: Object.fromEntries(
        [...this.#lastRequestTime.entries()].map(([p, t]) => [p, {
          lastRequestMs: Date.now() - t,
          debounceMs: this.#getDebounce(p),
          backoffStage: this.#backoffStage.get(p) ?? null,
        }])
      ),
    };
  }

  /**
   * Get the current pending queue length.
   * @returns {number}
   */
  get queueLength() {
    return this.#queue.length;
  }

  /**
   * Get active tab count.
   * @returns {number}
   */
  get activeTabs() {
    return this.#activeTabs;
  }

  // ===== PRIVATE: QUEUE PROCESSING =====

  /**
   * Insert entry into queue maintaining priority order.
   * User requests come before pipeline requests.
   */
  #insertByPriority(entry) {
    if (entry.priority === 'user') {
      // Insert before first pipeline entry
      const idx = this.#queue.findIndex(e => e.priority === 'pipeline');
      if (idx === -1) {
        this.#queue.push(entry);
      } else {
        this.#queue.splice(idx, 0, entry);
      }
    } else {
      this.#queue.push(entry);
    }
  }

  /**
   * Remove an entry from the queue (timeout/cancel).
   */
  #removeFromQueue(entry) {
    const idx = this.#queue.indexOf(entry);
    if (idx !== -1) {
      this.#queue.splice(idx, 1);
    }
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }
  }

  /**
   * Process queue: pick next eligible request and execute it.
   * Runs in a loop until no more eligible requests.
   */
  async #processQueue() {
    if (this.#processing) return;
    this.#processing = true;

    try {
      while (true) {
        // Check tab concurrency limit
        if (this.#activeTabs >= this.#config.maxConcurrentTabs) {
          logger.debug('Tab concurrency limit reached', {
            activeTabs: this.#activeTabs, max: this.#config.maxConcurrentTabs,
          });
          break;
        }

        // Find next eligible request (respecting debounce)
        const entry = this.#findNextEligible();
        if (!entry) break;

        // Remove from queue
        this.#removeFromQueue(entry);

        // Execute asynchronously (don't block queue processing)
        this.#executeEntry(entry);
      }
    } finally {
      this.#processing = false;
    }
  }

  /**
   * Find the next request that satisfies debounce + backoff constraints.
   *
   * @returns {Object|null} Queue entry or null
   */
  #findNextEligible() {
    const now = Date.now();

    for (const entry of this.#queue) {
      const debounce = this.#getDebounce(entry.provider);
      const lastTime = this.#lastRequestTime.get(entry.provider) || 0;
      const elapsed = now - lastTime;

      // Check backoff
      const backoffStage = this.#backoffStage.get(entry.provider);
      if (backoffStage !== undefined && backoffStage >= 0) {
        const backoffMs = BACKOFF_STAGES[backoffStage];
        if (elapsed < backoffMs) {
          continue; // Still in backoff
        }
      }

      // Check debounce
      if (elapsed < debounce) {
        // Schedule retry after debounce completes
        const remaining = debounce - elapsed;
        setTimeout(() => this.#processQueue(), remaining + 50);
        continue;
      }

      return entry;
    }

    return null;
  }

  /**
   * Execute a queue entry with anti-detection jitter.
   */
  async #executeEntry(entry) {
    const { provider, execute, correlationId, resolve, reject } = entry;

    this.#activeTabs++;
    logger.debug('Executing request', {
      provider, correlationId, activeTabs: this.#activeTabs,
    });

    try {
      // Anti-detection: add random jitter
      const jitter = this.#randomJitter();
      if (jitter > 0) {
        await this.#sleep(jitter);
      }

      const result = await execute();

      // Record success
      this.#lastRequestTime.set(provider, Date.now());
      this.#logUsage(provider, true);

      // Reset backoff on success
      if (this.#backoffStage.has(provider)) {
        this.#backoffStage.delete(provider);
        await this.#persistBackoff();
      }

      resolve(result);
    } catch (err) {
      // Record failure
      this.#lastRequestTime.set(provider, Date.now());
      this.#logUsage(provider, false, err.message);

      reject(err);
    } finally {
      this.#activeTabs--;
      // Try to process more from queue
      this.#processQueue();
    }
  }

  // ===== PRIVATE: HELPERS =====

  /**
   * Get debounce delay for a provider.
   * @param {string} provider
   * @returns {number} Debounce in ms
   */
  #getDebounce(provider) {
    return this.#config.debounceOverrides[provider]
      ?? DEFAULT_DEBOUNCE[provider]
      ?? 3000;
  }

  /**
   * Generate random jitter delay for anti-detection.
   * @returns {number} Jitter in ms (0 to jitterMs)
   */
  #randomJitter() {
    return Math.floor(Math.random() * this.#config.jitterMs);
  }

  /**
   * Log a usage event.
   * @param {string} provider
   * @param {boolean} success
   * @param {string} [reason]
   */
  #logUsage(provider, success, reason = '') {
    if (!this.#usageLog[provider]) {
      this.#usageLog[provider] = [];
    }

    this.#usageLog[provider].push({
      timestamp: Date.now(),
      success,
      reason,
    });

    // Trim old entries (> 24h)
    const cutoff = Date.now() - USAGE_TTL_MS;
    this.#usageLog[provider] = this.#usageLog[provider].filter(l => l.timestamp > cutoff);
  }

  /**
   * Persist backoff state to chrome.storage.local.
   */
  async #persistBackoff() {
    if (!this.#storage) return;
    try {
      const backoffData = Object.fromEntries(this.#backoffStage.entries());
      await this.#storage.set({ [STORAGE_KEY_BACKOFF]: backoffData });
    } catch (err) {
      logger.warn('Failed to persist backoff state', { error: err.message });
    }
  }

  /**
   * Restore backoff state from chrome.storage.local.
   */
  async restoreBackoff() {
    if (!this.#storage) return;
    try {
      const data = await this.#storage.get([STORAGE_KEY_BACKOFF]);
      if (data[STORAGE_KEY_BACKOFF]) {
        for (const [provider, stage] of Object.entries(data[STORAGE_KEY_BACKOFF])) {
          this.#backoffStage.set(provider, stage);
        }
        logger.info('Backoff state restored', { providers: Object.keys(data[STORAGE_KEY_BACKOFF]) });
      }
    } catch (err) {
      logger.warn('Failed to restore backoff state', { error: err.message });
    }
  }

  /**
   * Persist usage stats to chrome.storage.local.
   */
  async persistUsage() {
    if (!this.#storage) return;
    try {
      await this.#storage.set({ [STORAGE_KEY_USAGE]: this.#usageLog });
    } catch (err) {
      logger.warn('Failed to persist usage stats', { error: err.message });
    }
  }

  /**
   * Restore usage stats from chrome.storage.local.
   */
  async restoreUsage() {
    if (!this.#storage) return;
    try {
      const data = await this.#storage.get([STORAGE_KEY_USAGE]);
      if (data[STORAGE_KEY_USAGE]) {
        this.#usageLog = data[STORAGE_KEY_USAGE];
        logger.info('Usage stats restored');
      }
    } catch (err) {
      logger.warn('Failed to restore usage stats', { error: err.message });
    }
  }

  /**
   * Promise-based sleep.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== SINGLETON =====

let _instance = null;

/**
 * Get or create the global RateLimiter singleton.
 *
 * @param {Object} [config]
 * @returns {RateLimiter}
 */
export function getRateLimiter(config) {
  if (!_instance) {
    _instance = new RateLimiter(config);
  }
  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetRateLimiter() {
  _instance = null;
}
