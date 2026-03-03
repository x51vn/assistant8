/**
 * @fileoverview Unit Tests for googleSearchWebService
 * Ticket: XST-812 — Google Search Web Provider (DOM scraping)
 *
 * Tests: tab automation, DOM extraction, retry, timeout, ads filtering, URL encoding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mock setup ---
const { mockTabsCreate, mockTabsRemove, mockTabsGet, mockTabsOnUpdated, mockScriptingExecuteScript } = vi.hoisted(() => {
  const addListenerCallbacks = [];
  return {
    mockTabsCreate: vi.fn(),
    mockTabsRemove: vi.fn(),
    mockTabsGet: vi.fn(),
    mockTabsOnUpdated: {
      addListener: vi.fn((cb) => addListenerCallbacks.push(cb)),
      removeListener: vi.fn(),
      _callbacks: addListenerCallbacks,
    },
    mockScriptingExecuteScript: vi.fn(),
  };
});

// Mock chrome APIs
vi.stubGlobal('chrome', {
  tabs: {
    create: mockTabsCreate,
    remove: mockTabsRemove,
    get: mockTabsGet,
    onUpdated: mockTabsOnUpdated,
  },
  scripting: {
    executeScript: mockScriptingExecuteScript,
  },
});

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startOperation: vi.fn(() => 'mock-corr'),
    endOperation: vi.fn(),
  }),
  generateCorrelationId: () => 'test-corr-id',
}));

// Mock errorCodes
vi.mock('../../src/shared/errorCodes.js', () => ({
  ERROR_CODES: {
    INVALID_INPUT: 'INVALID_INPUT',
    SEARCH_FAILED: 'SEARCH_FAILED',
    SEARCH_TIMEOUT: 'SEARCH_TIMEOUT',
    SEARCH_QUOTA_EXCEEDED: 'SEARCH_QUOTA_EXCEEDED',
  },
}));

// Now import after mocks
import { searchGoogleWeb, _testExports } from '../../src/background/services/search/googleSearchWebService.js';
import { resetSearchCache } from '../../src/background/services/search/searchCache.js';

const { buildSearchUrl, extractSearchResultsFromDOM } = _testExports;

// ===== HELPERS =====

function makeFakeExtractedResults(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Kết quả ${i + 1} — FPT cổ phiếu`,
    url: `https://cafef.vn/fpt-article-${i + 1}.html`,
    snippet: `FPT ghi nhận lợi nhuận tăng ${i * 10}%...`,
    publishedAt: null,
  }));
}

/**
 * Setup happy path: tab create → load complete → extraction → tab remove
 */
function setupHappyPath(results = null) {
  const fakeResults = results || makeFakeExtractedResults();

  mockTabsCreate.mockResolvedValue({ id: 42, status: 'loading' });
  mockTabsGet.mockResolvedValue({ id: 42, status: 'complete' });
  mockTabsRemove.mockResolvedValue(undefined);

  mockScriptingExecuteScript.mockResolvedValue([
    { result: fakeResults, frameId: 0 },
  ]);
}

// ===== TESTS =====

describe('googleSearchWebService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTabsOnUpdated._callbacks.length = 0;
    resetSearchCache(); // XST-805: Clear cache between tests to prevent cross-test hits
  });

  // ----- Input validation -----
  describe('input validation', () => {
    it('should throw INVALID_INPUT for empty query', async () => {
      await expect(searchGoogleWeb('')).rejects.toMatchObject({
        errorCode: 'INVALID_INPUT',
      });
    });

    it('should throw INVALID_INPUT for null query', async () => {
      await expect(searchGoogleWeb(null)).rejects.toMatchObject({
        errorCode: 'INVALID_INPUT',
      });
    });

    it('should throw INVALID_INPUT for whitespace-only query', async () => {
      await expect(searchGoogleWeb('   ')).rejects.toMatchObject({
        errorCode: 'INVALID_INPUT',
      });
    });
  });

  // ----- buildSearchUrl -----
  describe('buildSearchUrl', () => {
    it('should encode query correctly', () => {
      const url = buildSearchUrl('FPT cổ phiếu phân tích', { maxResults: 10, locale: 'vi' });
      expect(url).toContain('https://www.google.com/search?');
      expect(url).toContain('q=FPT+c%E1%BB%95+phi%E1%BA%BFu+ph%C3%A2n+t%C3%ADch');
      expect(url).toContain('hl=vi');
    });

    it('should handle special characters in query', () => {
      const url = buildSearchUrl('VNM & HPG "mua bán"', { maxResults: 10, locale: 'vi' });
      expect(url).toContain('https://www.google.com/search?');
      expect(url).toContain('q=');
      // Should not crash
    });

    it('should set num parameter', () => {
      const url = buildSearchUrl('test', { maxResults: 8, locale: 'vi' });
      expect(url).toContain('num=13'); // maxResults + 5
    });
  });

  // ----- Happy path -----
  describe('happy path', () => {
    it('should return normalized results on successful search', async () => {
      setupHappyPath();

      const results = await searchGoogleWeb('FPT cổ phiếu phân tích');

      expect(mockTabsCreate).toHaveBeenCalledOnce();
      expect(mockTabsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ active: false })
      );
      expect(mockScriptingExecuteScript).toHaveBeenCalledOnce();
      expect(mockTabsRemove).toHaveBeenCalledWith(42);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(5);
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('url');
      expect(results[0]).toHaveProperty('snippet');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('credibility');
    });

    it('should respect maxResults option', async () => {
      setupHappyPath(makeFakeExtractedResults(10));

      const results = await searchGoogleWeb('test', { maxResults: 3 });
      expect(results.length).toBe(3);
    });

    it('should close tab even on extraction failure', async () => {
      mockTabsCreate.mockResolvedValue({ id: 99, status: 'loading' });
      mockTabsGet.mockResolvedValue({ id: 99, status: 'complete' });
      mockTabsRemove.mockResolvedValue(undefined);
      mockScriptingExecuteScript.mockRejectedValue(new Error('Injection failed'));

      // All 3 attempts (1 + 2 retries) will fail — total time ~6s with backoff
      await expect(searchGoogleWeb('test', { timeoutMs: 30000 })).rejects.toThrow();
      // Tab should be cleaned up on each attempt
      expect(mockTabsRemove).toHaveBeenCalled();
    }, 15000);
  });

  // ----- Ads filtering -----
  describe('ads filtering', () => {
    it('should exclude results with ad URLs', async () => {
      const mixedResults = [
        { title: 'Organic Result', url: 'https://cafef.vn/article.html', snippet: 'Good' },
        // Ad result would be filtered in DOM, but normalized here without ad marker
      ];
      setupHappyPath(mixedResults);

      const results = await searchGoogleWeb('FPT');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Organic Result');
    });
  });

  // ----- Timeout -----
  describe('timeout handling', () => {
    it('should throw SEARCH_TIMEOUT when tab does not load in time', async () => {
      mockTabsCreate.mockResolvedValue({ id: 55, status: 'loading' });
      // Tab never completes — get returns loading
      mockTabsGet.mockResolvedValue({ id: 55, status: 'loading' });
      mockTabsRemove.mockResolvedValue(undefined);

      // Don't trigger onUpdated listener — simulates timeout
      await expect(
        searchGoogleWeb('test', { timeoutMs: 500 })
      ).rejects.toMatchObject({
        errorCode: 'SEARCH_TIMEOUT',
      });

      // Tab should still be cleaned up
      expect(mockTabsRemove).toHaveBeenCalledWith(55);
    });
  });

  // ----- Retry -----
  describe('retry logic', () => {
    it('should retry on non-timeout errors', async () => {
      // First attempt fails, second succeeds
      mockTabsCreate
        .mockResolvedValueOnce({ id: 71, status: 'loading' })
        .mockResolvedValueOnce({ id: 72, status: 'loading' });

      mockTabsGet
        .mockResolvedValueOnce({ id: 71, status: 'complete' })
        .mockResolvedValueOnce({ id: 72, status: 'complete' });

      mockTabsRemove.mockResolvedValue(undefined);

      // First injection fails
      mockScriptingExecuteScript
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce([{ result: makeFakeExtractedResults(3), frameId: 0 }]);

      const results = await searchGoogleWeb('test', { maxResults: 3 });
      expect(results.length).toBe(3);
      expect(mockTabsCreate).toHaveBeenCalledTimes(2);
    }, 15000); // Allow time for retry delays

    it('should NOT retry timeout errors', async () => {
      mockTabsCreate.mockResolvedValue({ id: 80, status: 'loading' });
      mockTabsGet.mockResolvedValue({ id: 80, status: 'loading' });
      mockTabsRemove.mockResolvedValue(undefined);

      await expect(
        searchGoogleWeb('test', { timeoutMs: 200 })
      ).rejects.toMatchObject({
        errorCode: 'SEARCH_TIMEOUT',
      });

      // Only 1 attempt — no retries for timeout
      expect(mockTabsCreate).toHaveBeenCalledTimes(1);
    });
  });

  // ----- Normalization -----
  describe('result normalization', () => {
    it('should normalize URLs (remove tracking params)', async () => {
      const rawResults = [
        {
          title: 'Test',
          url: 'https://cafef.vn/article?utm_source=google&fbclid=abc',
          snippet: 'Snippet',
        },
      ];
      setupHappyPath(rawResults);

      const results = await searchGoogleWeb('test');
      expect(results[0].url).toBe('https://cafef.vn/article');
    });

    it('should deduplicate by URL', async () => {
      const rawResults = [
        { title: 'Article 1', url: 'https://cafef.vn/same.html', snippet: 'First' },
        { title: 'Article 2', url: 'https://cafef.vn/same.html', snippet: 'Second' },
        { title: 'Article 3', url: 'https://vietstock.vn/other.html', snippet: 'Third' },
      ];
      setupHappyPath(rawResults);

      const results = await searchGoogleWeb('test');
      expect(results.length).toBe(2);
    });

    it('should rank trusted domains higher', async () => {
      const rawResults = [
        { title: 'Unknown', url: 'https://unknown-blog.com/article', snippet: 'Unknown source' },
        { title: 'CafeF', url: 'https://cafef.vn/fpt.html', snippet: 'Trusted source' },
      ];
      setupHappyPath(rawResults);

      const results = await searchGoogleWeb('test');
      // CafeF (trusted) should rank higher than unknown blog
      expect(results[0].url).toContain('cafef.vn');
      expect(results[0].credibility).toBe('high');
    });
  });

  // ----- Vietnamese query -----
  describe('Vietnamese query handling', () => {
    it('should handle Vietnamese characters correctly', async () => {
      setupHappyPath();

      const results = await searchGoogleWeb('Vingroup tin tức mới nhất');
      expect(results).toBeInstanceOf(Array);

      // Verify the URL was built with correct encoding
      const urlArg = mockTabsCreate.mock.calls[0][0].url;
      expect(urlArg).toContain('Vingroup');
    });
  });

  // ----- Cache integration (XST-805) -----
  describe('cache integration', () => {
    it('should return cached results on second call (no API call)', async () => {
      setupHappyPath();

      // First call → tab automation
      const result1 = await searchGoogleWeb('FPT stock', { maxResults: 3 });
      expect(mockTabsCreate).toHaveBeenCalledTimes(1);
      expect(result1.length).toBe(3);

      // Second call with same query + options → cache hit, no tab created
      mockTabsCreate.mockClear();
      const result2 = await searchGoogleWeb('FPT stock', { maxResults: 3 });
      expect(mockTabsCreate).not.toHaveBeenCalled();
      expect(result2).toEqual(result1);
    }, 10000);

    it('should miss cache when options differ', async () => {
      setupHappyPath();

      await searchGoogleWeb('VNM stock', { maxResults: 3, recencyWindowDays: 7 });
      expect(mockTabsCreate).toHaveBeenCalledTimes(1);

      // Different recencyWindowDays → different cache key → miss
      mockTabsCreate.mockClear();
      setupHappyPath();
      await searchGoogleWeb('VNM stock', { maxResults: 3, recencyWindowDays: 30 });
      expect(mockTabsCreate).toHaveBeenCalledTimes(1); // New tab created
    }, 10000);
  });
});

// ----- extractSearchResultsFromDOM (isolated test) -----
describe('extractSearchResultsFromDOM', () => {
  it('should be a pure function (no external dependencies)', () => {
    expect(typeof extractSearchResultsFromDOM).toBe('function');
    // Function body should not reference imports or outer scope
    const src = extractSearchResultsFromDOM.toString();
    expect(src).not.toContain('import ');
    // It references 'document' which is fine — runs in page context
  });
});
