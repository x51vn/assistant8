/**
 * @fileoverview Tests for Page Content Service
 * Agentic Web Research — Phase 1
 *
 * Mocks chrome.tabs and chrome.scripting to test extraction flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Setup chrome API mocks
const mockTabsCreate = vi.fn();
const mockTabsRemove = vi.fn();
const mockTabsGet = vi.fn();
const mockExecuteScript = vi.fn();
const mockOnUpdatedAddListener = vi.fn();
const mockOnUpdatedRemoveListener = vi.fn();

globalThis.chrome = {
  tabs: {
    create: mockTabsCreate,
    remove: mockTabsRemove,
    get: mockTabsGet,
    onUpdated: { addListener: mockOnUpdatedAddListener, removeListener: mockOnUpdatedRemoveListener },
  },
  scripting: {
    executeScript: mockExecuteScript,
  },
};

import {
  extractPageContent,
  extractPagesSequentially,
} from '../../src/background/services/retrieval/pageContentService.js';

beforeEach(() => {
  vi.clearAllMocks();

  // Default: tab creates successfully, returns id=42
  mockTabsCreate.mockResolvedValue({ id: 42 });
  mockTabsRemove.mockResolvedValue(undefined);
  mockTabsGet.mockResolvedValue({ status: 'complete' });
});

describe('extractPageContent', () => {
  it('extracts content from a page successfully', async () => {
    mockExecuteScript.mockResolvedValue([{
      result: {
        title: 'FPT Analysis',
        content: 'FPT reported 25% revenue growth in Q3 2025. The company expects strong momentum. ' + 'X'.repeat(200),
        metaDescription: 'FPT stock analysis',
        publishedTime: '2025-01-15',
      },
    }]);

    const result = await extractPageContent('https://cafef.vn/fpt.html', { timeoutMs: 2000 });

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://cafef.vn/fpt.html');
    expect(result.title).toBe('FPT Analysis');
    expect(result.content).toContain('FPT reported');
    expect(result.contentLength).toBeGreaterThan(100);

    // Tab should be created and removed
    expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'https://cafef.vn/fpt.html', active: false });
    expect(mockTabsRemove).toHaveBeenCalledWith(42);
  });

  it('returns success:false for insufficient content', async () => {
    mockExecuteScript.mockResolvedValue([{
      result: {
        title: 'Page',
        content: 'Short',
        metaDescription: '',
      },
    }]);

    const result = await extractPageContent('https://example.com/page', { timeoutMs: 2000 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_content');
    // Tab should still be cleaned up
    expect(mockTabsRemove).toHaveBeenCalled();
  });

  it('returns success:false when tab creation fails', async () => {
    mockTabsCreate.mockRejectedValue(new Error('Cannot create tab'));

    const result = await extractPageContent('https://example.com/page', { timeoutMs: 2000 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot create tab');
  });

  it('returns success:false when executeScript fails', async () => {
    mockExecuteScript.mockRejectedValue(new Error('Script injection blocked'));

    const result = await extractPageContent('https://example.com/page', { timeoutMs: 2000 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Script injection blocked');
    expect(mockTabsRemove).toHaveBeenCalled();
  });

  it('returns success:false when executeScript returns null', async () => {
    mockExecuteScript.mockResolvedValue([{ result: null }]);

    const result = await extractPageContent('https://example.com/page', { timeoutMs: 2000 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_content');
  });

  it('cleans up tab even on failure', async () => {
    mockExecuteScript.mockRejectedValue(new Error('fail'));

    await extractPageContent('https://example.com', { timeoutMs: 2000 });
    expect(mockTabsRemove).toHaveBeenCalledWith(42);
  });
});

describe('extractPagesSequentially', () => {
  it('processes multiple URLs in order', async () => {
    let callCount = 0;
    mockExecuteScript.mockImplementation(async () => {
      callCount++;
      return [{
        result: {
          title: `Page ${callCount}`,
          content: 'Content '.repeat(50) + `page ${callCount}`,
          metaDescription: '',
        },
      }];
    });

    const urls = [
      { url: 'https://cafef.vn/1', title: 'First' },
      { url: 'https://cafef.vn/2', title: 'Second' },
    ];

    const results = await extractPagesSequentially(urls, { timeoutMs: 2000 });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    // Tabs created sequentially
    expect(mockTabsCreate).toHaveBeenCalledTimes(2);
  });

  it('calls onPageDone callback for each page', async () => {
    mockExecuteScript.mockResolvedValue([{
      result: {
        title: 'Page',
        content: 'Good content here with enough length. '.repeat(10),
        metaDescription: '',
      },
    }]);

    const onPageDone = vi.fn();
    const urls = [{ url: 'https://a.com' }, { url: 'https://b.com' }];

    await extractPagesSequentially(urls, { timeoutMs: 2000, onPageDone });

    expect(onPageDone).toHaveBeenCalledTimes(2);
    expect(onPageDone).toHaveBeenCalledWith(expect.objectContaining({ success: true }), 0);
    expect(onPageDone).toHaveBeenCalledWith(expect.objectContaining({ success: true }), 1);
  });

  it('continues processing when one page fails', async () => {
    let callCount = 0;
    mockExecuteScript.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('first page fail');
      return [{
        result: {
          title: 'Page 2',
          content: 'Working content with enough length to pass check. '.repeat(5),
          metaDescription: '',
        },
      }];
    });

    const urls = [{ url: 'https://fail.com' }, { url: 'https://ok.com' }];
    const results = await extractPagesSequentially(urls, { timeoutMs: 2000 });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });

  it('returns empty array for empty input', async () => {
    const results = await extractPagesSequentially([]);
    expect(results).toEqual([]);
  });
});
