/**
 * @fileoverview Unit tests for stockResearchOrchestrator
 * Ticket: XST-796
 * Tests the 7-step pipeline with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== MOCKS =====

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startOperation: vi.fn(() => 'corr-123'),
    endOperation: vi.fn(),
  }),
  generateCorrelationId: vi.fn(() => 'test-run-id-123'),
}));

// Mock Supabase
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
  }),
});

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    from: vi.fn((table) => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
    })),
  },
}));

// Mock searchGoogle
const mockSearchGoogle = vi.fn();
vi.mock('../../src/background/services/search/googleSearchService.js', () => ({
  searchGoogle: (...args) => mockSearchGoogle(...args),
}));

// Mock LLMProviderFactory
const mockSendPrompt = vi.fn();
vi.mock('../../src/shared/llm/LLMProviderFactory.js', () => ({
  LLMProviderFactory: {
    create: vi.fn(() => ({
      sendPrompt: mockSendPrompt,
      getStatus: vi.fn().mockResolvedValue('connected'),
      name: 'test-provider',
    })),
  },
}));

// Import after mocks
import { runStockResearch, buildAnalysisPrompt } from '../../src/background/services/stock/stockResearchOrchestrator.js';

// ===== FIXTURES =====

const VALID_LLM_OUTPUT = JSON.stringify({
  symbol: 'FPT',
  recommendation: 'BUY',
  confidence: 78,
  targetPrice: 165000,
  stopLoss: 125000,
  timeHorizon: '3-6m',
  thesis: ['Doanh thu AI/Cloud tăng 45% YoY', 'Backlog đạt $1.2B'],
  risks: ['Biên lợi nhuận giảm do cạnh tranh'],
  catalysts: ['KQKD Q1/2026'],
  sources: [{ url: 'https://cafef.vn/fpt.html', reason: 'KQKD', credibility: 'high' }],
});

const MOCK_SEARCH_SOURCES = [
  {
    title: 'FPT báo lãi kỷ lục',
    url: 'https://cafef.vn/fpt-bao-lai.html',
    snippet: 'FPT ghi nhận lợi nhuận kỷ lục...',
    sourceType: 'news',
    publishedAt: '2026-02-20T00:00:00Z',
    score: 0.92,
    credibility: 'high',
  },
];

// ===== TESTS =====

describe('runStockResearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchGoogle.mockResolvedValue(MOCK_SEARCH_SOURCES);
    mockSendPrompt.mockResolvedValue({ text: VALID_LLM_OUTPUT, usage: { inputTokens: 0, outputTokens: 0 } });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  // ============================================================================
  // Happy path
  // ============================================================================

  it('completes full pipeline successfully', async () => {
    const result = await runStockResearch('FPT', {}, 'user-123', {
      settingsConfig: { llm_provider: 'chatgpt' },
    });

    expect(result.success).toBe(true);
    expect(result.symbol).toBe('FPT');
    expect(result.output).toBeDefined();
    expect(result.output.recommendation).toBe('BUY');
    expect(result.output.confidence).toBe(78);
    expect(result.sources).toHaveLength(1);
    expect(result.metadata.timing.total_ms).toBeGreaterThanOrEqual(0);
  });

  it('normalizes lowercase symbol', async () => {
    const result = await runStockResearch('fpt', {}, 'user-123');

    expect(result.success).toBe(true);
    expect(result.symbol).toBe('FPT');
  });

  it('emits progress callbacks', async () => {
    const progressSteps = [];
    const onProgress = (status) => progressSteps.push(status);

    await runStockResearch('FPT', {}, 'user-123', { onProgress });

    expect(progressSteps.length).toBeGreaterThanOrEqual(7);
    expect(progressSteps[0].step).toBe(1);
    expect(progressSteps[0].status).toBe('validating');
    expect(progressSteps[progressSteps.length - 1].step).toBe(7);
  });

  it('includes timing metadata', async () => {
    const result = await runStockResearch('FPT', {}, 'user-123');

    expect(result.metadata.timing).toBeDefined();
    expect(result.metadata.timing.search_ms).toBeGreaterThanOrEqual(0);
    expect(result.metadata.timing.analyze_ms).toBeGreaterThanOrEqual(0);
    expect(result.metadata.timing.total_ms).toBeGreaterThanOrEqual(0);
  });

  // ============================================================================
  // Search disabled
  // ============================================================================

  it('skips search when searchEnabled=false', async () => {
    const result = await runStockResearch('FPT', { searchEnabled: false }, 'user-123');

    expect(result.success).toBe(true);
    expect(mockSearchGoogle).not.toHaveBeenCalled();
    expect(result.sources).toHaveLength(0);
    expect(result.metadata.searchEnabled).toBe(false);
  });

  // ============================================================================
  // Search failure (non-fatal)
  // ============================================================================

  it('continues pipeline when search fails', async () => {
    mockSearchGoogle.mockRejectedValue(new Error('Search proxy down'));

    const result = await runStockResearch('FPT', {}, 'user-123');

    expect(result.success).toBe(true);
    expect(result.sources).toHaveLength(0);
  });

  // ============================================================================
  // Input validation errors
  // ============================================================================

  it('fails with invalid symbol', async () => {
    const result = await runStockResearch('!!!invalid!!!', {}, 'user-123');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_INPUT');
    expect(result.failedStep).toBe('validating');
  });

  it('fails with empty symbol', async () => {
    const result = await runStockResearch('', {}, 'user-123');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_INPUT');
  });

  it('fails with null symbol', async () => {
    const result = await runStockResearch(null, {}, 'user-123');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_INPUT');
  });

  // ============================================================================
  // LLM failures
  // ============================================================================

  it('fails when LLM times out', async () => {
    const timeoutError = new Error('Timeout: ChatGPT không phản hồi sau 120 giây');
    mockSendPrompt.mockRejectedValue(timeoutError);

    const result = await runStockResearch('FPT', {}, 'user-123');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('LLM_TIMEOUT');
  });

  it('retries LLM on transient error then succeeds', async () => {
    mockSendPrompt
      .mockRejectedValueOnce(new Error('Something went wrong'))
      .mockResolvedValue({ text: VALID_LLM_OUTPUT, usage: {} });

    const result = await runStockResearch('FPT', {}, 'user-123');

    expect(result.success).toBe(true);
    expect(mockSendPrompt).toHaveBeenCalledTimes(2);
  });

  it('does not retry on quota exceeded', async () => {
    const quotaError = new Error('Monthly quota exceeded');
    quotaError.status = 429;
    mockSendPrompt.mockRejectedValue(quotaError);

    const result = await runStockResearch('FPT', {}, 'user-123');

    expect(result.success).toBe(false);
    expect(mockSendPrompt).toHaveBeenCalledTimes(1);
  });

  it('fails when LLM returns empty response', async () => {
    mockSendPrompt.mockResolvedValue({ text: '', usage: {} });

    const result = await runStockResearch('FPT', {}, 'user-123');

    expect(result.success).toBe(false);
  });

  // ============================================================================
  // Output validation
  // ============================================================================

  it('handles invalid LLM output with retry correction', async () => {
    // First LLM call returns invalid output, second returns valid
    mockSendPrompt
      .mockResolvedValueOnce({ text: '{"invalid": true}', usage: {} })
      .mockResolvedValueOnce({ text: VALID_LLM_OUTPUT, usage: {} });

    const result = await runStockResearch('FPT', { strictValidation: true }, 'user-123');

    // Should succeed because retry correction provides valid output
    expect(result.success).toBe(true);
  });

  it('uses partial data in non-strict mode', async () => {
    const partial = JSON.stringify({
      symbol: 'FPT',
      recommendation: 'BUY',
      confidence: 70,
    });
    mockSendPrompt.mockResolvedValue({ text: partial, usage: {} });

    const result = await runStockResearch('FPT', { strictValidation: false }, 'user-123');

    expect(result.success).toBe(true);
    expect(result.output.symbol).toBe('FPT');
    expect(result.output.recommendation).toBe('BUY');
  });

  // ============================================================================
  // Persist failure (non-fatal)
  // ============================================================================

  it('returns success even when persist fails', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: 'DB down' } }),
    });

    const result = await runStockResearch('FPT', {}, 'user-123');

    // Pipeline should still succeed — persist is non-fatal
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });
});

// ============================================================================
// buildAnalysisPrompt
// ============================================================================

describe('buildAnalysisPrompt', () => {
  it('builds prompt with symbol', () => {
    const prompt = buildAnalysisPrompt('FPT', []);
    expect(prompt).toContain('FPT');
    expect(prompt).toContain('BUY');
    expect(prompt).toContain('HOLD');
    expect(prompt).toContain('SELL');
    expect(prompt).toContain('WATCH');
    expect(prompt).toContain('JSON');
  });

  it('includes source context when sources provided', () => {
    const sources = [
      { title: 'FPT News', url: 'https://cafef.vn/fpt.html', snippet: 'Test snippet' },
    ];
    const prompt = buildAnalysisPrompt('FPT', sources);
    expect(prompt).toContain('Nguồn tham khảo');
    expect(prompt).toContain('FPT News');
    expect(prompt).toContain('cafef.vn');
  });

  it('omits source section when no sources', () => {
    const prompt = buildAnalysisPrompt('VCB', []);
    expect(prompt).not.toContain('Nguồn tham khảo');
  });
});
