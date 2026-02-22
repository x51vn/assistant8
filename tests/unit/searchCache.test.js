/**
 * @fileoverview Unit tests for SearchResultCache
 * Ticket: XST-805 — Search result caching
 *
 * Tests cover:
 * - get/set basic operations
 * - TTL expiration
 * - LRU eviction at max size
 * - Cache key building
 * - chrome.storage.local persistence & restore
 * - Cache invalidation (full + selective + by query)
 * - Cache stats tracking (hits, misses, evictions)
 * - clear + resetStats
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchResultCache, getSearchCache, resetSearchCache } from '../../src/background/services/search/searchCache.js';

// ===== MOCK LOGGER =====

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ===== HELPERS =====

function createMockStorage() {
  const store = {};
  return {
    get: vi.fn(async (keys) => {
      const result = {};
      for (const key of keys) {
        if (store[key] !== undefined) result[key] = store[key];
      }
      return result;
    }),
    set: vi.fn(async (data) => {
      Object.assign(store, data);
    }),
    _store: store,
  };
}

function makeSampleResults(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Result ${i + 1}`,
    url: `https://example.com/page-${i + 1}`,
    snippet: `Snippet ${i + 1}`,
  }));
}

// ===== TESTS =====

describe('SearchResultCache', () => {
  let cache;
  let storage;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = createMockStorage();
    cache = new SearchResultCache({ ttlMs: 30 * 60 * 1000, maxSize: 5, storage });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSearchCache();
  });

  // ===== buildKey =====

  describe('buildKey', () => {
    it('normalizes query to lowercase and trims', () => {
      const key = SearchResultCache.buildKey('  FPT Stock  ', { maxResults: 10 });
      expect(key).toBe('fpt stock::10::14');
    });

    it('uses defaults for missing options', () => {
      const key = SearchResultCache.buildKey('vnm');
      expect(key).toBe('vnm::10::14');
    });

    it('includes maxResults and recencyWindowDays in key', () => {
      const key = SearchResultCache.buildKey('abc', { maxResults: 5, recencyWindowDays: 7 });
      expect(key).toBe('abc::5::7');
    });

    it('different options produce different keys', () => {
      const k1 = SearchResultCache.buildKey('fpt', { maxResults: 5 });
      const k2 = SearchResultCache.buildKey('fpt', { maxResults: 10 });
      expect(k1).not.toBe(k2);
    });
  });

  // ===== get / set =====

  describe('get/set', () => {
    it('returns null for unknown key', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('stores and retrieves results', async () => {
      const results = makeSampleResults();
      await cache.set('test-key', results);
      const cached = await cache.get('test-key');
      expect(cached).toEqual(results);
    });

    it('updates existing key without duplicating', async () => {
      await cache.set('key1', [{ url: 'a' }]);
      await cache.set('key1', [{ url: 'b' }]);
      expect(cache.size).toBe(1);
      const cached = await cache.get('key1');
      expect(cached).toEqual([{ url: 'b' }]);
    });
  });

  // ===== TTL =====

  describe('TTL expiration', () => {
    it('returns null after TTL expires', async () => {
      const results = makeSampleResults();
      await cache.set('exp-key', results);

      // Advance time past TTL
      vi.advanceTimersByTime(31 * 60 * 1000);

      const cached = await cache.get('exp-key');
      expect(cached).toBeNull();
    });

    it('returns valid data before TTL', async () => {
      const results = makeSampleResults();
      await cache.set('fresh-key', results);

      vi.advanceTimersByTime(29 * 60 * 1000); // Just under 30 min

      const cached = await cache.get('fresh-key');
      expect(cached).toEqual(results);
    });

    it('removes expired entry from store on get', async () => {
      await cache.set('expired', [{ url: 'x' }]);
      vi.advanceTimersByTime(31 * 60 * 1000);
      await cache.get('expired');
      expect(cache.size).toBe(0);
    });
  });

  // ===== LRU Eviction =====

  describe('LRU eviction', () => {
    it('evicts oldest entry when max size exceeded', async () => {
      // Fill cache to maxSize (5)
      for (let i = 0; i < 5; i++) {
        await cache.set(`key-${i}`, [{ url: `https://example.com/${i}` }]);
      }
      expect(cache.size).toBe(5);

      // Add one more → should evict key-0 (oldest)
      await cache.set('key-5', [{ url: 'https://example.com/5' }]);
      expect(cache.size).toBe(5);
      expect(await cache.get('key-0')).toBeNull();
      expect(await cache.get('key-5')).toBeTruthy();
    });

    it('evicts multiple entries if needed', async () => {
      // Fill with 5, then check we can keep adding
      for (let i = 0; i < 7; i++) {
        await cache.set(`k-${i}`, [{ url: `https://example.com/${i}` }]);
      }
      expect(cache.size).toBe(5);
      // Only last 5 should exist: k-2 through k-6
      expect(await cache.get('k-0')).toBeNull();
      expect(await cache.get('k-1')).toBeNull();
      expect(await cache.get('k-2')).toBeTruthy();
    });

    it('accessing a key refreshes its LRU position', async () => {
      for (let i = 0; i < 5; i++) {
        await cache.set(`lru-${i}`, [{ url: `u${i}` }]);
      }
      // Access lru-0 → it should move to newest position
      await cache.get('lru-0');

      // Add new entries → lru-1 (now oldest) should be evicted first
      await cache.set('lru-new', [{ url: 'new' }]);
      expect(await cache.get('lru-0')).toBeTruthy(); // Refreshed, still there
      expect(await cache.get('lru-1')).toBeNull(); // Evicted (was oldest after lru-0 refreshed)
    });

    it('tracks eviction count in stats', async () => {
      for (let i = 0; i < 7; i++) {
        await cache.set(`ev-${i}`, [{ url: `u${i}` }]);
      }
      const stats = cache.getStats();
      expect(stats.evictions).toBe(2); // 2 entries evicted (6th and 7th push out 1st and 2nd)
    });
  });

  // ===== Stats =====

  describe('stats', () => {
    it('tracks hits and misses', async () => {
      await cache.set('hit-key', [{ url: 'x' }]);
      await cache.get('hit-key'); // hit
      await cache.get('miss-key'); // miss
      await cache.get('miss-key-2'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
    });

    it('counts expired access as miss', async () => {
      await cache.set('exp', [{ url: 'x' }]);
      vi.advanceTimersByTime(31 * 60 * 1000);
      await cache.get('exp'); // Expired → miss

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it('includes current size and config', async () => {
      await cache.set('s1', [{ url: 'x' }]);
      await cache.set('s2', [{ url: 'y' }]);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(stats.ttlMs).toBe(30 * 60 * 1000);
    });

    it('resetStats clears counters', async () => {
      await cache.set('rs', [{ url: 'x' }]);
      await cache.get('rs');
      await cache.get('miss');

      cache.resetStats();
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  // ===== Invalidation =====

  describe('invalidation', () => {
    it('invalidate() without predicate clears all entries', async () => {
      await cache.set('a', [{ url: '1' }]);
      await cache.set('b', [{ url: '2' }]);
      const removed = await cache.invalidate();
      expect(removed).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('invalidate() with predicate removes matching entries only', async () => {
      await cache.set('fpt::10::14', [{ url: '1' }]);
      await cache.set('vnm::10::14', [{ url: '2' }]);
      await cache.set('fpt::5::7', [{ url: '3' }]);

      const removed = await cache.invalidate((key) => key.startsWith('fpt'));
      expect(removed).toBe(2);
      expect(cache.size).toBe(1);
      expect(await cache.get('vnm::10::14')).toBeTruthy();
    });

    it('invalidateByQuery matches substring in keys', async () => {
      await cache.set('fpt stock::10::14', [{ url: '1' }]);
      await cache.set('vnm stock::10::14', [{ url: '2' }]);
      await cache.set('fpt analysis::5::7', [{ url: '3' }]);

      const removed = await cache.invalidateByQuery('fpt');
      expect(removed).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('invalidateByQuery with empty string does nothing', async () => {
      await cache.set('key', [{ url: '1' }]);
      const removed = await cache.invalidateByQuery('');
      expect(removed).toBe(0);
      expect(cache.size).toBe(1);
    });
  });

  // ===== clear =====

  describe('clear', () => {
    it('removes all entries and resets stats', async () => {
      await cache.set('c1', [{ url: '1' }]);
      await cache.set('c2', [{ url: '2' }]);
      await cache.get('c1');
      await cache.get('miss');

      await cache.clear();

      expect(cache.size).toBe(0);
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // ===== Persistence =====

  describe('persistence', () => {
    it('persists entries to storage on set', async () => {
      await cache.set('persist-key', [{ url: 'x' }]);
      expect(storage.set).toHaveBeenCalled();

      const lastCall = storage.set.mock.calls.at(-1)[0];
      expect(lastCall).toHaveProperty('search_cache_entries');
      expect(lastCall).toHaveProperty('search_cache_stats');
    });

    it('restores entries from storage', async () => {
      const now = Date.now();
      const entries = [
        ['restored-key', { results: [{ url: 'restored' }], createdAt: now, lastAccessedAt: now }],
      ];
      storage._store.search_cache_entries = entries;
      storage._store.search_cache_stats = { hits: 5, misses: 3, evictions: 1 };

      const freshCache = new SearchResultCache({ maxSize: 10, storage });
      await freshCache.restore();

      const result = await freshCache.get('restored-key');
      expect(result).toEqual([{ url: 'restored' }]);

      const stats = freshCache.getStats();
      expect(stats.hits).toBe(6); // 5 restored + 1 from get
      expect(stats.misses).toBe(3);
    });

    it('skips expired entries during restore', async () => {
      const longAgo = Date.now() - (31 * 60 * 1000); // 31 min ago
      const entries = [
        ['expired', { results: [{ url: 'old' }], createdAt: longAgo, lastAccessedAt: longAgo }],
        ['valid', { results: [{ url: 'new' }], createdAt: Date.now(), lastAccessedAt: Date.now() }],
      ];
      storage._store.search_cache_entries = entries;

      const freshCache = new SearchResultCache({ maxSize: 10, storage });
      await freshCache.restore();

      expect(freshCache.size).toBe(1);
      expect(await freshCache.get('valid')).toEqual([{ url: 'new' }]);
    });

    it('handles missing storage gracefully', async () => {
      const noStorageCache = new SearchResultCache({ storage: null });
      await noStorageCache.set('key', [{ url: 'x' }]);
      const result = await noStorageCache.get('key');
      expect(result).toEqual([{ url: 'x' }]);
    });

    it('handles storage errors gracefully during restore', async () => {
      const errorStorage = {
        get: vi.fn(async () => { throw new Error('Storage read fail'); }),
        set: vi.fn(async () => {}),
      };
      const errorCache = new SearchResultCache({ storage: errorStorage });
      await errorCache.restore(); // Should not throw
      expect(errorCache.size).toBe(0);
    });

    it('handles storage errors gracefully during persist', async () => {
      const errorStorage = {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => { throw new Error('Storage write fail'); }),
      };
      const errorCache = new SearchResultCache({ storage: errorStorage });
      await errorCache.set('key', [{ url: 'x' }]); // Should not throw
      expect(errorCache.size).toBe(1);
    });
  });

  // ===== Lazy restore =====

  describe('lazy restore', () => {
    it('auto-restores on first get call', async () => {
      const now = Date.now();
      storage._store.search_cache_entries = [
        ['lazy-key', { results: [{ url: 'lazy' }], createdAt: now, lastAccessedAt: now }],
      ];

      // Create new cache (not yet restored)
      const lazyCache = new SearchResultCache({ storage });
      // First get should trigger restore
      const result = await lazyCache.get('lazy-key');
      expect(result).toEqual([{ url: 'lazy' }]);
    });

    it('auto-restores on first set call', async () => {
      const now = Date.now();
      storage._store.search_cache_entries = [
        ['existing', { results: [{ url: 'e' }], createdAt: now, lastAccessedAt: now }],
      ];

      const lazyCache = new SearchResultCache({ storage });
      await lazyCache.set('new-key', [{ url: 'n' }]);
      // Both existing and new should be present
      expect(lazyCache.size).toBe(2);
    });
  });

  // ===== Singleton =====

  describe('singleton (getSearchCache / resetSearchCache)', () => {
    it('returns same instance on subsequent calls', () => {
      const a = getSearchCache({ maxSize: 10 });
      const b = getSearchCache({ maxSize: 99 }); // options ignored on second call
      expect(a).toBe(b);
    });

    it('resetSearchCache creates new instance', () => {
      const a = getSearchCache();
      resetSearchCache();
      const b = getSearchCache();
      expect(a).not.toBe(b);
    });
  });

  // ===== Stress test: LRU at 50 entries =====

  describe('stress test', () => {
    it('maintains max size under pressure (50 entries)', async () => {
      const bigCache = new SearchResultCache({ maxSize: 50, storage: null });

      // Insert 100 unique entries
      for (let i = 0; i < 100; i++) {
        await bigCache.set(`stress-${i}`, [{ url: `https://example.com/${i}` }]);
      }

      expect(bigCache.size).toBe(50);

      // First 50 should be evicted
      for (let i = 0; i < 50; i++) {
        const result = await bigCache.get(`stress-${i}`);
        expect(result).toBeNull();
      }

      // Last 50 should exist
      for (let i = 50; i < 100; i++) {
        const result = await bigCache.get(`stress-${i}`);
        expect(result).toBeTruthy();
      }

      const stats = bigCache.getStats();
      expect(stats.evictions).toBe(50);
    });
  });
});
