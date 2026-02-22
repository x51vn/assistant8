/**
 * @fileoverview Unit tests for RateLimiter
 * Ticket: XST-806 — Rate limiting & quota management
 *
 * Tests cover:
 * - Tab concurrency limiting
 * - Per-provider debounce
 * - Priority queue (user > pipeline)
 * - Queue overflow (reject at max size)
 * - Queue timeout
 * - Captcha/block exponential backoff
 * - Usage tracking stats
 * - Persistence
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, getRateLimiter, resetRateLimiter } from '../../src/background/services/rateLimiter.js';

// ===== MOCKS =====

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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function createTestLimiter(overrides = {}) {
  return new RateLimiter({
    maxConcurrentTabs: 2,
    maxQueueSize: 5,
    queueTimeoutMs: 2000,
    jitterMs: 0,
    debounceOverrides: {
      'google-search': 50,
      'chatgpt': 80,
      'gemini-web': 80,
      'claude-web': 80,
      'fast': 0,
    },
    storage: null,
    ...overrides,
  });
}

// ===== TESTS =====

describe('RateLimiter', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  describe('input validation', () => {
    it('rejects missing provider', async () => {
      const limiter = createTestLimiter();
      await expect(
        limiter.submit({ execute: () => 'ok' })
      ).rejects.toThrow('provider and execute function are required');
    });

    it('rejects missing execute function', async () => {
      const limiter = createTestLimiter();
      await expect(
        limiter.submit({ provider: 'chatgpt' })
      ).rejects.toThrow('provider and execute function are required');
    });
  });

  describe('basic execution', () => {
    it('executes a simple request and returns result', async () => {
      const limiter = createTestLimiter();
      const result = await limiter.submit({
        provider: 'fast',
        execute: async () => 'hello',
      });
      expect(result).toBe('hello');
    });

    it('resets active count after request completes', async () => {
      const limiter = createTestLimiter();
      await limiter.submit({
        provider: 'fast',
        execute: async () => 'done',
      });
      expect(limiter.activeTabs).toBe(0);
    });

    it('propagates execute errors', async () => {
      const limiter = createTestLimiter();
      await expect(
        limiter.submit({
          provider: 'fast',
          execute: async () => { throw new Error('boom'); },
        })
      ).rejects.toThrow('boom');
    });

    it('frees tab slot on error', async () => {
      const limiter = createTestLimiter();
      await limiter.submit({
        provider: 'fast',
        execute: async () => { throw new Error('fail'); },
      }).catch(() => {});
      expect(limiter.activeTabs).toBe(0);
    });
  });

  describe('tab concurrency', () => {
    it('limits concurrent executions to maxConcurrentTabs', async () => {
      const limiter = createTestLimiter({ maxConcurrentTabs: 2 });
      let concurrent = 0;
      let maxConcurrent = 0;

      const makeRequest = (provider, delayMs) => limiter.submit({
        provider,
        execute: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await sleep(delayMs);
          concurrent--;
          return provider;
        },
      });

      const p1 = makeRequest('fast', 100);
      const p2 = makeRequest('chatgpt', 100);
      const p3 = makeRequest('gemini-web', 100);

      const results = await Promise.all([p1, p2, p3]);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(results).toContain('fast');
      expect(results).toContain('chatgpt');
      expect(results).toContain('gemini-web');
    }, 5000);

    it('processes queued request after slot freed', async () => {
      const limiter = createTestLimiter({ maxConcurrentTabs: 1 });
      const order = [];

      const p1 = limiter.submit({
        provider: 'fast',
        execute: async () => { order.push('first'); return 1; },
      });
      const p2 = limiter.submit({
        provider: 'chatgpt',
        execute: async () => { order.push('second'); return 2; },
      });

      expect(await p1).toBe(1);
      await sleep(150);
      expect(await p2).toBe(2);
      expect(order).toEqual(['first', 'second']);
    }, 5000);
  });

  describe('debounce', () => {
    it('delays rapid requests to same provider', async () => {
      const limiter = createTestLimiter({ maxConcurrentTabs: 5 });
      const timestamps = [];

      const makeRequest = () => limiter.submit({
        provider: 'google-search',
        execute: async () => { timestamps.push(Date.now()); },
      });

      await makeRequest();
      await makeRequest();

      expect(timestamps.length).toBe(2);
      const gap = timestamps[1] - timestamps[0];
      expect(gap).toBeGreaterThanOrEqual(40);
    }, 5000);

    it('allows immediate requests to different providers', async () => {
      const limiter = createTestLimiter();
      const results = [];

      const p1 = limiter.submit({
        provider: 'fast',
        execute: async () => { results.push('a'); return 'a'; },
      });
      const p2 = limiter.submit({
        provider: 'chatgpt',
        execute: async () => { results.push('b'); return 'b'; },
      });

      await Promise.all([p1, p2]);
      expect(results.length).toBe(2);
    });
  });

  describe('priority queue', () => {
    it('processes user requests before pipeline requests', async () => {
      const limiter = createTestLimiter({ maxConcurrentTabs: 1 });
      const order = [];

      let unblock;
      const blocker = new Promise(r => { unblock = r; });
      const pBlock = limiter.submit({
        provider: 'fast',
        execute: () => blocker,
      });

      const pPipeline = limiter.submit({
        provider: 'chatgpt',
        priority: 'pipeline',
        execute: async () => { order.push('pipeline'); },
      });
      const pUser = limiter.submit({
        provider: 'gemini-web',
        priority: 'user',
        execute: async () => { order.push('user'); },
      });

      unblock('done');
      await pBlock;
      await sleep(300);
      await Promise.allSettled([pPipeline, pUser]);

      expect(order[0]).toBe('user');
    }, 5000);
  });

  describe('queue overflow', () => {
    it('rejects when queue is full', async () => {
      const limiter = createTestLimiter({ maxConcurrentTabs: 1, maxQueueSize: 3 });

      let unblock;
      const blocker = new Promise(r => { unblock = r; });
      limiter.submit({ provider: 'fast', execute: () => blocker });

      const queued = [];
      for (let i = 0; i < 3; i++) {
        queued.push(limiter.submit({ provider: `p${i}`, execute: async () => i }));
      }

      await expect(
        limiter.submit({ provider: 'overflow', execute: async () => 'nope' })
      ).rejects.toThrow('queue is full');

      unblock('ok');
      await sleep(500);
      await Promise.allSettled(queued);
    }, 5000);
  });

  describe('queue timeout', () => {
    it('rejects request after queue timeout', async () => {
      const limiter = createTestLimiter({
        maxConcurrentTabs: 1,
        queueTimeoutMs: 200,
      });

      let unblock;
      const blocker = new Promise(r => { unblock = r; });
      limiter.submit({ provider: 'fast', execute: () => blocker });

      const timeoutPromise = limiter.submit({
        provider: 'chatgpt',
        execute: async () => 'should not run',
      });

      await expect(timeoutPromise).rejects.toThrow('timeout');

      unblock('done');
    }, 5000);
  });

  describe('captcha/block backoff', () => {
    it('reports block and tracks in usage', async () => {
      const limiter = createTestLimiter();
      await limiter.reportBlock('google-search');

      const stats = limiter.getUsageStats();
      expect(stats['google-search'].blocked).toBe(1);
    });

    it('clears backoff via clearBackoff', async () => {
      const limiter = createTestLimiter();
      await limiter.reportBlock('chatgpt');
      await limiter.clearBackoff('chatgpt');

      const result = await limiter.submit({
        provider: 'chatgpt',
        execute: async () => 'recovered',
      });
      expect(result).toBe('recovered');
    });
  });

  describe('usage tracking', () => {
    it('tracks successful requests', async () => {
      const limiter = createTestLimiter();
      await limiter.submit({
        provider: 'chatgpt',
        execute: async () => 'ok',
      });

      const stats = limiter.getUsageStats();
      expect(stats.chatgpt.total).toBe(1);
      expect(stats.chatgpt.successful).toBe(1);
      expect(stats.chatgpt.failed).toBe(0);
    });

    it('tracks failed requests', async () => {
      const limiter = createTestLimiter();
      await limiter.submit({
        provider: 'chatgpt',
        execute: async () => { throw new Error('fail'); },
      }).catch(() => {});

      const stats = limiter.getUsageStats();
      expect(stats.chatgpt.total).toBe(1);
      expect(stats.chatgpt.failed).toBe(1);
    });

    it('tracks blocked events', async () => {
      const limiter = createTestLimiter();
      await limiter.reportBlock('google-search');

      const stats = limiter.getUsageStats();
      expect(stats['google-search'].blocked).toBe(1);
    });

    it('counts requests per hour', async () => {
      const limiter = createTestLimiter();
      await limiter.submit({
        provider: 'fast',
        execute: async () => 'ok',
      });

      const stats = limiter.getUsageStats();
      expect(stats.fast.requestsLastHour).toBe(1);
    });
  });

  describe('getState', () => {
    it('returns current limiter state', async () => {
      const limiter = createTestLimiter();
      await limiter.submit({
        provider: 'fast',
        execute: async () => 'ok',
      });

      const state = limiter.getState();
      expect(state.activeTabs).toBe(0);
      expect(state.maxConcurrentTabs).toBe(2);
      expect(state.queueSize).toBe(0);
      expect(state.maxQueueSize).toBe(5);
      expect(state.providers).toHaveProperty('fast');
    });
  });

  describe('persistence', () => {
    it('persists backoff state to storage', async () => {
      const storage = createMockStorage();
      const limiter = new RateLimiter({ storage, jitterMs: 0 });

      await limiter.reportBlock('chatgpt');

      expect(storage.set).toHaveBeenCalled();
      expect(storage._store).toHaveProperty('rate_limiter_backoff');
      expect(storage._store.rate_limiter_backoff).toHaveProperty('chatgpt');
    });

    it('restores backoff state from storage', async () => {
      const storage = createMockStorage();
      storage._store.rate_limiter_backoff = { chatgpt: 1 };

      const limiter = new RateLimiter({ storage, jitterMs: 0 });
      await limiter.restoreBackoff();

      expect(storage.get).toHaveBeenCalled();
    });

    it('persists usage stats to storage', async () => {
      const storage = createMockStorage();
      const limiter = new RateLimiter({
        storage, jitterMs: 0,
        debounceOverrides: { chatgpt: 0 },
      });

      await limiter.submit({
        provider: 'chatgpt',
        execute: async () => 'ok',
      });

      await limiter.persistUsage();
      expect(storage._store).toHaveProperty('rate_limiter_usage');
    });

    it('restores usage stats from storage', async () => {
      const storage = createMockStorage();
      storage._store.rate_limiter_usage = {
        chatgpt: [{ timestamp: Date.now(), success: true, reason: '' }],
      };

      const limiter = new RateLimiter({ storage, jitterMs: 0 });
      await limiter.restoreUsage();

      const stats = limiter.getUsageStats();
      expect(stats.chatgpt.total).toBe(1);
    });
  });

  describe('singleton', () => {
    it('returns same instance on subsequent calls', () => {
      const a = getRateLimiter({ maxConcurrentTabs: 3 });
      const b = getRateLimiter({ maxConcurrentTabs: 99 });
      expect(a).toBe(b);
    });

    it('resetRateLimiter creates new instance', () => {
      const a = getRateLimiter();
      resetRateLimiter();
      const b = getRateLimiter();
      expect(a).not.toBe(b);
    });
  });

  describe('anti-detection jitter', () => {
    it('applies jitter when jitterMs > 0', async () => {
      const limiter = new RateLimiter({
        maxConcurrentTabs: 5,
        jitterMs: 50,
        debounceOverrides: { test: 0 },
        storage: null,
      });

      const result = await limiter.submit({
        provider: 'test',
        execute: async () => 'jittered',
      });
      expect(result).toBe('jittered');
    });
  });
});
