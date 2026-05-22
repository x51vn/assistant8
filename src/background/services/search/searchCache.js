/**
 * @fileoverview Search Result Cache — LRU eviction, TTL, chrome.storage.local persistence
 * Ticket: XST-805 — Search result caching (symbol + timeWindow, LRU eviction, TTL)
 *
 * Architecture:
 * - In-memory Map for fast access (primary)
 * - chrome.storage.local backup to survive SW restart
 * - LRU eviction when max size exceeded
 * - TTL-based expiration (default 30 min)
 * - Cache key: normalized query + options hash
 * - Cache stats for debugging: hit/miss/eviction counts
 *
 * MV3-safe: Restore from chrome.storage.local on first access after SW wake.
 */

import { createLogger } from '../../../logger.js';

const logger = createLogger('SearchResultCache');

// ===== CONSTANTS =====

const STORAGE_KEY = 'search_cache_entries';
const STATS_KEY = 'search_cache_stats';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_SIZE = 50;

// ===== CACHE CLASS =====

/**
 * LRU cache for search results with TTL and chrome.storage.local persistence.
 *
 * Usage:
 *   const cache = new SearchResultCache({ ttlMs: 30 * 60 * 1000, maxSize: 50 });
 *   await cache.restore();
 *   const cached = await cache.get(key);
 *   if (!cached) { ... await cache.set(key, results); }
 */
export class SearchResultCache {
  /** @type {Map<string, CacheEntry>} */
  #store = new Map();

  /** @type {number} */
  #ttlMs;

  /** @type {number} */
  #maxSize;

  /** @type {{ hits: number, misses: number, evictions: number }} */
  #stats = { hits: 0, misses: 0, evictions: 0 };

  /** @type {boolean} */
  #restored = false;

  /** @type {Object} chrome.storage.local-compatible storage (DI for testing) */
  #storage;

  /**
   * @param {Object} [options]
   * @param {number} [options.ttlMs=1800000] - Time-to-live in ms (default 30 min)
   * @param {number} [options.maxSize=50] - Max cache entries before LRU eviction
   * @param {Object} [options.storage] - Storage adapter (default: chrome.storage.local)
   */
  constructor(options = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#maxSize = Math.max(1, options.maxSize ?? DEFAULT_MAX_SIZE);
    this.#storage = options.storage || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
  }

  // ===== PUBLIC API =====

  /**
   * Build a cache key from query + options.
   * Format: normalized_query::maxResults::recencyWindowDays
   *
   * @param {string} query - Search query string
   * @param {Object} [options] - Search options
   * @param {number} [options.maxResults] - Max results
   * @param {number} [options.recencyWindowDays] - Recency window
   * @returns {string} Cache key
   */
  static buildKey(query, options = {}) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    const maxResults = options.maxResults ?? 10;
    const recency = options.recencyWindowDays ?? 14;
    return `${normalizedQuery}::${maxResults}::${recency}`;
  }

  /**
   * Get cached value if valid (not expired).
   * Updates LRU order on hit.
   *
   * @param {string} key - Cache key
   * @returns {Promise<Array|null>} Cached results or null
   */
  async get(key) {
    await this.#ensureRestored();

    const entry = this.#store.get(key);

    if (!entry) {
      this.#stats.misses++;
      logger.debug('Cache MISS', { key, stats: this.#stats });
      return null;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > this.#ttlMs) {
      // Expired — remove and report miss
      this.#store.delete(key);
      this.#stats.misses++;
      logger.debug('Cache MISS (expired)', { key, age: Date.now() - entry.createdAt, ttl: this.#ttlMs });
      await this.#persist();
      return null;
    }

    // Hit — update LRU order (delete + re-add pushes to end of Map iteration order)
    this.#store.delete(key);
    this.#store.set(key, { ...entry, lastAccessedAt: Date.now() });
    this.#stats.hits++;
    logger.debug('Cache HIT', { key, stats: this.#stats });

    return entry.results;
  }

  /**
   * Store results in cache with LRU eviction if needed.
   *
   * @param {string} key - Cache key
   * @param {Array} results - Search results to cache
   * @returns {Promise<void>}
   */
  async set(key, results) {
    await this.#ensureRestored();

    // If key already exists, delete first (to update LRU order)
    if (this.#store.has(key)) {
      this.#store.delete(key);
    }

    // LRU eviction: remove oldest entries until under max size
    while (this.#store.size >= this.#maxSize) {
      const oldestKey = this.#store.keys().next().value;
      this.#store.delete(oldestKey);
      this.#stats.evictions++;
      logger.debug('Cache LRU eviction', { evictedKey: oldestKey, stats: this.#stats });
    }

    const now = Date.now();
    this.#store.set(key, {
      results,
      createdAt: now,
      lastAccessedAt: now,
    });

    logger.debug('Cache SET', { key, resultCount: results.length, size: this.#store.size });

    await this.#persist();
  }

  /**
   * Invalidate cache entries matching a predicate.
   * Used when settings change (e.g., trusted domains, maxSources).
   *
   * @param {Function} [predicate] - Function(key, entry) → boolean. If omitted, clears all.
   * @returns {Promise<number>} Number of entries removed
   */
  async invalidate(predicate) {
    await this.#ensureRestored();

    if (!predicate) {
      const count = this.#store.size;
      this.#store.clear();
      logger.info('Cache cleared (all entries)', { removedCount: count });
      await this.#persist();
      return count;
    }

    let removed = 0;
    for (const [key, entry] of this.#store) {
      if (predicate(key, entry)) {
        this.#store.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cache invalidated (selective)', { removedCount: removed });
      await this.#persist();
    }

    return removed;
  }

  /**
   * Invalidate all entries that contain a specific query substring.
   * Useful when trusted domains change → invalidate affected symbol queries.
   *
   * @param {string} querySubstring - Substring to match in cache keys
   * @returns {Promise<number>} Number of entries removed
   */
  async invalidateByQuery(querySubstring) {
    const normalized = (querySubstring || '').trim().toLowerCase();
    if (!normalized) return 0;
    return this.invalidate((key) => key.includes(normalized));
  }

  /**
   * Get cache statistics.
   *
   * @returns {{ hits: number, misses: number, evictions: number, size: number, maxSize: number, ttlMs: number }}
   */
  getStats() {
    return {
      ...this.#stats,
      size: this.#store.size,
      maxSize: this.#maxSize,
      ttlMs: this.#ttlMs,
    };
  }

  /**
   * Reset cache stats counters (for testing/debugging).
   */
  resetStats() {
    this.#stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Clear all entries and stats.
   *
   * @returns {Promise<void>}
   */
  async clear() {
    this.#store.clear();
    this.#stats = { hits: 0, misses: 0, evictions: 0 };
    await this.#persist();
    logger.info('Cache fully cleared');
  }

  /**
   * Returns the current cache size.
   * @returns {number}
   */
  get size() {
    return this.#store.size;
  }

  // ===== PERSISTENCE =====

  /**
   * Restore cache from chrome.storage.local.
   * Called lazily on first get/set or explicitly on SW wake.
   *
   * @returns {Promise<void>}
   */
  async restore() {
    if (!this.#storage) {
      this.#restored = true;
      return;
    }

    try {
      const data = await this.#storage.get([STORAGE_KEY, STATS_KEY]);

      if (data[STORAGE_KEY] && Array.isArray(data[STORAGE_KEY])) {
        const now = Date.now();
        let validCount = 0;
        let expiredCount = 0;

        for (const [key, entry] of data[STORAGE_KEY]) {
          // Skip expired entries during restore
          if (now - entry.createdAt > this.#ttlMs) {
            expiredCount++;
            continue;
          }
          this.#store.set(key, entry);
          validCount++;
        }

        logger.info('Cache restored from storage', { validCount, expiredCount });
      }

      if (data[STATS_KEY]) {
        this.#stats = { ...this.#stats, ...data[STATS_KEY] };
      }

      this.#restored = true;
    } catch (err) {
      logger.warn('Failed to restore cache from storage', { error: err.message });
      this.#restored = true; // Mark restored to avoid infinite retry
    }
  }

  // ===== PRIVATE =====

  /**
   * Ensure cache has been restored from storage (lazy init).
   * @returns {Promise<void>}
   */
  async #ensureRestored() {
    if (!this.#restored) {
      await this.restore();
    }
  }

  /**
   * Persist cache to chrome.storage.local.
   * @returns {Promise<void>}
   */
  async #persist() {
    if (!this.#storage) return;

    try {
      const entries = [...this.#store.entries()];
      await this.#storage.set({
        [STORAGE_KEY]: entries,
        [STATS_KEY]: this.#stats,
      });
    } catch (err) {
      logger.warn('Failed to persist cache to storage', { error: err.message });
    }
  }
}

// ===== SINGLETON INSTANCE =====

/**
 * Global singleton cache instance.
 * Use this in googleSearchWebService for cache integration.
 */
let _instance = null;

/**
 * Get or create the global SearchResultCache singleton.
 *
 * @param {Object} [options] - Constructor options (only used on first call)
 * @returns {SearchResultCache}
 */
export function getSearchCache(options) {
  if (!_instance) {
    _instance = new SearchResultCache(options);
  }
  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetSearchCache() {
  _instance = null;
}
