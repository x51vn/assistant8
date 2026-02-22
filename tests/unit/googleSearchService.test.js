/**
 * @fileoverview Unit Tests for googleSearchService
 *
 * Tests: dedup, ranking, normalization, retry, timeout, error handling
 * Pattern: mirrors tests/unit/supabaseRetry.test.js
 *
 * Ticket: XST-791
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mock setup ---
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
  },
}));

// --- Mock logger to silence console output ---
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startOperation: vi.fn(() => 'mock-corr-id'),
  }),
  generateCorrelationId: () => 'test-correlation-id',
}));

// Now import after mocks
import { searchGoogle, _testExports } from '../../src/background/services/search/googleSearchService.js';

const {
  normalizeResults,
  normalizeUrl,
  classifySourceType,
  parseDate,
  deduplicateByUrl,
  rankSources,
  extractDomain,
  isNonRetryableError,
  createSearchError,
  DEFAULT_TRUSTED_DOMAINS,
  SOURCE_TYPE_WEIGHTS,
} = _testExports;

// ===== HELPERS =====

function makeFakeSource(overrides = {}) {
  return {
    title: 'FPT báo lãi kỷ lục',
    url: 'https://cafef.vn/fpt-bao-lai.html',
    snippet: 'FPT ghi nhận lợi nhuận tăng 45%...',
    sourceType: 'news',
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEdgeFunctionResponse(items) {
  return { data: { items }, error: null };
}

// ===== TESTS =====

describe('googleSearchService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ───────────────────────────────────────────
  // searchGoogle — happy path
  // ───────────────────────────────────────────
  describe('searchGoogle()', () => {
    it('should return normalized, deduped, ranked sources', async () => {
      const items = [
        makeFakeSource({ url: 'https://cafef.vn/a.html', title: 'A' }),
        makeFakeSource({ url: 'https://cafef.vn/b.html', title: 'B' }),
        makeFakeSource({ url: 'https://cafef.vn/a.html', title: 'A duplicate' }), // duplicate
      ];
      mockInvoke.mockResolvedValue(makeEdgeFunctionResponse(items));

      const results = await searchGoogle('FPT Vietnam stock', { maxResults: 5 });

      expect(results).toHaveLength(2); // duplicate removed
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('url');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('credibility');
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('should respect maxResults limit', async () => {
      const items = Array.from({ length: 15 }, (_, i) =>
        makeFakeSource({ url: `https://cafef.vn/${i}.html`, title: `Article ${i}` })
      );
      mockInvoke.mockResolvedValue(makeEdgeFunctionResponse(items));

      const results = await searchGoogle('FPT', { maxResults: 5 });

      expect(results).toHaveLength(5);
    });

    it('should throw on empty query', async () => {
      await expect(searchGoogle('')).rejects.toThrow();
      await expect(searchGoogle('   ')).rejects.toThrow();
    });

    it('should sort results by score descending', async () => {
      const items = [
        makeFakeSource({ url: 'https://random-blog.com/a.html', sourceType: 'blog' }),
        makeFakeSource({ url: 'https://cafef.vn/b.html', sourceType: 'news' }),
        makeFakeSource({ url: 'https://ssi.com.vn/c.html', sourceType: 'official' }),
      ];
      mockInvoke.mockResolvedValue(makeEdgeFunctionResponse(items));

      const results = await searchGoogle('FPT', { maxResults: 10 });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  // ───────────────────────────────────────────
  // Retry logic
  // ───────────────────────────────────────────
  describe('retry logic', () => {
    it('should retry on 500 error and succeed on second attempt', async () => {
      const error500 = new Error('Server error');
      error500.status = 500;

      // First call: edge function returns error
      mockInvoke
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'Internal Server Error', status: 500, context: { status: 500 } },
        })
        .mockResolvedValueOnce(makeEdgeFunctionResponse([makeFakeSource()]));

      const results = await searchGoogle('FPT', { timeoutMs: 30000 });

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
    });

    it('should NOT retry on 401 error — throw AUTH_ERROR immediately', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Unauthorized', status: 401, context: { status: 401 } },
      });

      await expect(searchGoogle('FPT')).rejects.toMatchObject({
        errorCode: 'AUTH_ERROR',
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 429 error — throw SEARCH_QUOTA_EXCEEDED', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Too Many Requests', status: 429, context: { status: 429 } },
      });

      await expect(searchGoogle('FPT')).rejects.toMatchObject({
        errorCode: 'SEARCH_QUOTA_EXCEEDED',
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('should exhaust all retries and throw SEARCH_FAILED', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Service Unavailable', status: 503, context: { status: 503 } },
      });

      await expect(searchGoogle('FPT', { timeoutMs: 60000 })).rejects.toMatchObject({
        errorCode: 'SEARCH_FAILED',
      });
      // Initial + 2 retries = 3 total
      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });
  });

  // ───────────────────────────────────────────
  // Normalization
  // ───────────────────────────────────────────
  describe('normalizeResults()', () => {
    it('should normalize raw results into SearchSource format', () => {
      const raw = [
        {
          title: '  FPT results  ',
          url: 'https://cafef.vn/page?utm_source=google&fbclid=abc',
          snippet: 'Some text',
          date: '2026-02-20',
        },
      ];

      const result = normalizeResults(raw, 'test');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('FPT results');
      expect(result[0].url).not.toContain('utm_source');
      expect(result[0].url).not.toContain('fbclid');
      expect(result[0].publishedAt).toBeTruthy();
      expect(result[0].score).toBe(0); // Not ranked yet
    });

    it('should filter out items without URL', () => {
      const raw = [
        { title: 'No URL item' },
        { title: 'Has URL', url: 'https://example.com' },
      ];

      const result = normalizeResults(raw, 'test');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Has URL');
    });

    it('should return empty array for non-array input', () => {
      expect(normalizeResults(null, 'test')).toEqual([]);
      expect(normalizeResults('string', 'test')).toEqual([]);
      expect(normalizeResults(42, 'test')).toEqual([]);
    });
  });

  // ───────────────────────────────────────────
  // URL normalization
  // ───────────────────────────────────────────
  describe('normalizeUrl()', () => {
    it('should remove tracking parameters', () => {
      const url = 'https://cafef.vn/page?utm_source=google&utm_medium=cpc&key=value';
      const result = normalizeUrl(url);
      expect(result).not.toContain('utm_source');
      expect(result).not.toContain('utm_medium');
      expect(result).toContain('key=value');
    });

    it('should remove hash fragment', () => {
      const url = 'https://example.com/page#section1';
      const result = normalizeUrl(url);
      expect(result).not.toContain('#section1');
    });

    it('should return raw URL if parsing fails', () => {
      const result = normalizeUrl('not-a-valid-url');
      expect(result).toBe('not-a-valid-url');
    });
  });

  // ───────────────────────────────────────────
  // Source type classification
  // ───────────────────────────────────────────
  describe('classifySourceType()', () => {
    it('should classify government sites as official', () => {
      expect(classifySourceType({ url: 'https://ssi.com.vn/report' })).toBe('official');
      expect(classifySourceType({ url: 'https://hnx.vn/data' })).toBe('official');
    });

    it('should classify research titles', () => {
      expect(classifySourceType({ url: 'https://example.com', title: 'Báo cáo phân tích FPT' })).toBe('research');
    });

    it('should classify forum sites', () => {
      expect(classifySourceType({ url: 'https://f247.com/forum/fpt' })).toBe('forum');
    });

    it('should classify blogs', () => {
      expect(classifySourceType({ url: 'https://medium.com/article' })).toBe('blog');
    });

    it('should default to news', () => {
      expect(classifySourceType({ url: 'https://unknown-site.com/article' })).toBe('news');
    });

    it('should respect pre-classified sourceType', () => {
      expect(classifySourceType({ url: 'https://example.com', sourceType: 'research' })).toBe('research');
    });
  });

  // ───────────────────────────────────────────
  // Date parsing
  // ───────────────────────────────────────────
  describe('parseDate()', () => {
    it('should parse ISO 8601 date', () => {
      const result = parseDate('2026-02-20T10:00:00Z');
      expect(result).toBeTruthy();
      expect(new Date(result).getFullYear()).toBe(2026);
    });

    it('should return null for invalid dates', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
    });
  });

  // ───────────────────────────────────────────
  // Deduplication
  // ───────────────────────────────────────────
  describe('deduplicateByUrl()', () => {
    it('should remove duplicate URLs (case-insensitive)', () => {
      const sources = [
        { url: 'https://cafef.vn/article', title: 'First' },
        { url: 'https://CAFEF.VN/Article', title: 'Duplicate' },
        { url: 'https://vietstock.vn/other', title: 'Different' },
      ];

      const result = deduplicateByUrl(sources);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('First');
      expect(result[1].title).toBe('Different');
    });

    it('should handle trailing slashes', () => {
      const sources = [
        { url: 'https://cafef.vn/article/', title: 'Trailing' },
        { url: 'https://cafef.vn/article', title: 'No trailing' },
      ];

      const result = deduplicateByUrl(sources);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Trailing');
    });

    it('should return empty array for empty input', () => {
      expect(deduplicateByUrl([])).toEqual([]);
    });
  });

  // ───────────────────────────────────────────
  // Ranking
  // ───────────────────────────────────────────
  describe('rankSources()', () => {
    it('should rank sources by composite score', () => {
      const now = new Date();
      const sources = [
        { url: 'https://random.com/a', sourceType: 'forum', publishedAt: null },
        { url: 'https://cafef.vn/b', sourceType: 'news', publishedAt: now.toISOString() },
        { url: 'https://ssi.com.vn/c', sourceType: 'official', publishedAt: now.toISOString() },
      ];

      const result = rankSources(sources, DEFAULT_TRUSTED_DOMAINS, 14);

      // Official + trusted + fresh should rank highest
      expect(result[0].url).toContain('ssi.com.vn');
      expect(result[0].score).toBeGreaterThan(result[1].score);
      expect(result[0].credibility).toBe('high');
    });

    it('should assign "high" credibility to trusted domains', () => {
      const sources = [
        { url: 'https://cafef.vn/article', sourceType: 'news', publishedAt: null },
        { url: 'https://unknown-blog.xyz/post', sourceType: 'blog', publishedAt: null },
      ];

      const result = rankSources(sources, DEFAULT_TRUSTED_DOMAINS, 14);

      const cafef = result.find(s => s.url.includes('cafef.vn'));
      const unknown = result.find(s => s.url.includes('unknown-blog'));

      expect(cafef.credibility).toBe('high');
      expect(unknown.credibility).toBe('medium');
    });

    it('should give higher freshness score to newer articles', () => {
      const now = new Date();
      const fresh = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const sources = [
        { url: 'https://cafef.vn/old', sourceType: 'news', publishedAt: old.toISOString() },
        { url: 'https://cafef.vn/fresh', sourceType: 'news', publishedAt: fresh.toISOString() },
      ];

      const result = rankSources(sources, DEFAULT_TRUSTED_DOMAINS, 14);

      const freshResult = result.find(s => s.url.includes('fresh'));
      const oldResult = result.find(s => s.url.includes('old'));

      expect(freshResult.score).toBeGreaterThan(oldResult.score);
    });

    it('should sort results by score descending', () => {
      const sources = Array.from({ length: 10 }, (_, i) =>
        ({ url: `https://site${i}.com/page`, sourceType: 'news', publishedAt: null })
      );

      const result = rankSources(sources, DEFAULT_TRUSTED_DOMAINS, 14);

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });
  });

  // ───────────────────────────────────────────
  // Domain extraction
  // ───────────────────────────────────────────
  describe('extractDomain()', () => {
    it('should extract domain without www', () => {
      expect(extractDomain('https://www.cafef.vn/article')).toBe('cafef.vn');
      expect(extractDomain('https://cafef.vn/article')).toBe('cafef.vn');
    });

    it('should return empty for invalid URL', () => {
      expect(extractDomain('not-a-url')).toBe('');
    });
  });

  // ───────────────────────────────────────────
  // Error helpers
  // ───────────────────────────────────────────
  describe('isNonRetryableError()', () => {
    it('should mark AUTH_ERROR as non-retryable', () => {
      const err = createSearchError('AUTH_ERROR', 'test', 'corr');
      expect(isNonRetryableError(err)).toBe(true);
    });

    it('should mark SEARCH_QUOTA_EXCEEDED as non-retryable', () => {
      const err = createSearchError('SEARCH_QUOTA_EXCEEDED', 'test', 'corr');
      expect(isNonRetryableError(err)).toBe(true);
    });

    it('should mark SEARCH_FAILED as retryable', () => {
      const err = createSearchError('SEARCH_FAILED', 'test', 'corr');
      expect(isNonRetryableError(err)).toBe(false);
    });
  });

  describe('createSearchError()', () => {
    it('should create an Error with errorCode and correlationId', () => {
      const err = createSearchError('SEARCH_FAILED', 'test message', 'corr-123');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('SearchError');
      expect(err.errorCode).toBe('SEARCH_FAILED');
      expect(err.correlationId).toBe('corr-123');
      expect(err.message).toBe('test message');
    });
  });
});
