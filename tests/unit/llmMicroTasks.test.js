/**
 * @fileoverview Tests for LLM Micro Tasks
 * Agentic Web Research — Phase 3
 *
 * Tests heuristic fallback paths (no LLM API required).
 * Tests LLM paths with mocked llmClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Mock llmClient
const mockChat = vi.fn();
const mockGetApiKey = vi.fn();

vi.mock('../../src/shared/llmClient.js', () => ({
  chat: (...args) => mockChat(...args),
  getApiKey: (...args) => mockGetApiKey(...args),
}));

import {
  extractKeywords,
  detectNavigation,
  summarizeArticle,
  classifyArticle,
} from '../../src/background/services/microtasks/llmMicroTasks.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== HEURISTIC PATH (no API key) =====

describe('Heuristic fallbacks (no LLM)', () => {
  beforeEach(() => {
    mockGetApiKey.mockResolvedValue(null);
  });

  describe('extractKeywords', () => {
    it('returns keyword structure from symbol alone', async () => {
      const result = await extractKeywords({ symbol: 'FPT' });
      expect(result.primary).toContain('FPT');
      expect(result.primary).toContain('FPT cổ phiếu');
      expect(result.secondary).toBeInstanceOf(Array);
      expect(result.negative).toBeInstanceOf(Array);
      expect(result.followUpQueries).toBeInstanceOf(Array);
    });

    it('includes companyName in primary keywords', async () => {
      const result = await extractKeywords({ symbol: 'VNM', companyName: 'Vinamilk' });
      expect(result.primary).toContain('Vinamilk');
    });
  });

  describe('detectNavigation', () => {
    it('detects article from long text with paragraphs', async () => {
      // heuristicPageType requires: paragraphs > 3 AND length > 1000
      const longArticle = 'First paragraph about stock analysis.\n\n'
        + 'Second paragraph with more details about the company.\n\n'
        + 'Third paragraph discussing risks and uncertainties ahead.\n\n'
        + 'Fourth paragraph about catalysts and upcoming events.\n\n'
        + 'Fifth paragraph wrapping up the analysis and conclusion. '.repeat(20);

      const result = await detectNavigation(longArticle);
      expect(result.isArticle).toBe(true);
      expect(result.pageType).toBe('article');
    });

    it('detects listing pages', async () => {
      const listingPage = 'danh sách kết quả tìm kiếm cho cổ phiếu FPT';
      const result = await detectNavigation(listingPage);
      expect(result.pageType).toBe('listing');
      expect(result.isArticle).toBe(false);
    });

    it('detects login pages', async () => {
      const loginPage = 'Vui lòng đăng nhập để tiếp tục xem nội dung';
      const result = await detectNavigation(loginPage);
      expect(result.isArticle).toBe(false);
    });
  });

  describe('summarizeArticle', () => {
    it('extracts sentences mentioning the symbol', async () => {
      const text = 'FPT công bố doanh thu Q3 tăng 25%. '
        + 'Lợi nhuận đạt 5000 tỷ đồng. '
        + 'Thời tiết hôm nay đẹp. '
        + 'FPT mục tiêu 35000 tỷ doanh thu cả năm.';

      const result = await summarizeArticle(text, 'FPT');
      expect(result.summary).toBeTruthy();
      expect(result.facts).toBeInstanceOf(Array);
      expect(result.numbers).toBeInstanceOf(Array);
    });

    it('returns empty structure for very short text', async () => {
      const result = await summarizeArticle('Ngắn', 'FPT');
      expect(result.summary).toBeDefined();
      expect(result.facts).toBeInstanceOf(Array);
    });
  });

  describe('classifyArticle', () => {
    it('classifies high relevance when symbol appears frequently', async () => {
      const text = 'FPT là công ty công nghệ lớn. FPT vừa công bố KQKD. '
        + 'Cổ phiếu FPT tăng mạnh. FPT dự kiến chia cổ tức. Phân tích FPT chi tiết.';
      const result = await classifyArticle(text, 'FPT');
      expect(result.relevance).toBe('high');
    });

    it('classifies low relevance when symbol is absent and no sector keywords', async () => {
      const text = 'Tin tức thời tiết hôm nay trời nắng đẹp, nhiệt độ phù hợp cho hoạt động ngoài trời.';
      const result = await classifyArticle(text, 'FPT');
      expect(result.relevance).toBe('low');
      expect(result.category).toBe('unrelated');
    });

    it('returns valid category', async () => {
      const text = 'FPT phân tích kỹ thuật cổ phiếu';
      const result = await classifyArticle(text, 'FPT');
      expect(['company_specific', 'sector', 'macro', 'rumor', 'unrelated']).toContain(result.category);
    });
  });
});

// ===== LLM PATH (with API key) =====

describe('LLM path (with API key)', () => {
  beforeEach(() => {
    mockGetApiKey.mockResolvedValue('test-key-123');
  });

  it('extractKeywords uses LLM when available', async () => {
    mockChat.mockResolvedValue({
      success: true,
      data: {
        content: JSON.stringify({
          primary: ['FPT', 'FPT Software'],
          secondary: ['AI', 'Cloud'],
          negative: ['tuyển dụng'],
          followUpQueries: ['FPT Q3 2025'],
        }),
      },
    });

    const result = await extractKeywords({ symbol: 'FPT' });
    expect(result.primary).toContain('FPT');
    expect(result.primary).toContain('FPT Software');
    expect(mockChat).toHaveBeenCalledOnce();
  });

  it('falls back to heuristic when LLM returns parse error', async () => {
    mockChat.mockResolvedValue({
      success: true,
      data: { content: 'This is not JSON at all' },
    });

    const result = await extractKeywords({ symbol: 'VNM' });
    // Should still return valid structure via heuristic
    expect(result.primary).toContain('VNM');
  });

  it('falls back to heuristic when LLM request fails', async () => {
    mockChat.mockResolvedValue({ success: false, error: 'timeout' });

    const result = await extractKeywords({ symbol: 'VNM' });
    expect(result.primary).toContain('VNM');
  });

  it('summarizeArticle parses LLM JSON wrapped in code fence', async () => {
    mockChat.mockResolvedValue({
      success: true,
      data: {
        content: '```json\n{"summary":"FPT grew 25%","facts":["Revenue up"],"numbers":["25%"],"risks":[],"events":[]}\n```',
      },
    });

    // Text must be > 200 chars to trigger LLM path
    const articleText = 'FPT revenue grew 25% in Q3 2025. The company reported record profits across all segments. ' + 'Details about growth. '.repeat(10);
    const result = await summarizeArticle(articleText, 'FPT');
    expect(result.summary).toBe('FPT grew 25%');
    expect(result.facts).toContain('Revenue up');
  });

  it('classifyArticle passes symbol in prompt', async () => {
    mockChat.mockResolvedValue({
      success: true,
      data: {
        content: JSON.stringify({ relevance: 'high', category: 'company_specific' }),
      },
    });

    // Text must be > 200 chars to trigger LLM path
    const articleText = 'FPT cổ phiếu tăng mạnh trong phiên giao dịch hôm nay. ' + 'Phân tích chi tiết về cổ phiếu FPT. '.repeat(8);
    const result = await classifyArticle(articleText, 'FPT');
    expect(result.relevance).toBe('high');
    expect(result.category).toBe('company_specific');

    // Verify the prompt includes the symbol
    const userContent = mockChat.mock.calls[0][0][0].content;
    expect(userContent).toContain('FPT');
  });
});
