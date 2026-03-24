/**
 * @fileoverview Tests for Agent Loop
 * Agentic Web Research — Phase 4
 *
 * Tests the bounded multi-agent loop with all dependencies mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
  generateCorrelationId: vi.fn(() => 'test-corr-id'),
}));

// Mock Google Search
const mockSearchGoogleWeb = vi.fn();
vi.mock('../../src/background/services/search/googleSearchWebService.js', () => ({
  searchGoogleWeb: (...args) => mockSearchGoogleWeb(...args),
}));

// Mock URL Validator
const mockFilterAndRankCandidates = vi.fn();
vi.mock('../../src/background/services/search/urlCandidateValidator.js', () => ({
  filterAndRankCandidates: (...args) => mockFilterAndRankCandidates(...args),
}));

// Mock Page Content Service
const mockExtractPagesSequentially = vi.fn();
vi.mock('../../src/background/services/retrieval/pageContentService.js', () => ({
  extractPagesSequentially: (...args) => mockExtractPagesSequentially(...args),
}));

// Mock Seed Site Walker
const mockWalkSeedSites = vi.fn();
vi.mock('../../src/background/services/retrieval/seedSiteWalker.js', () => ({
  walkSeedSites: (...args) => mockWalkSeedSites(...args),
}));

// Mock Microtasks
const mockSummarizeArticle = vi.fn();
const mockClassifyArticle = vi.fn();
const mockExtractKeywords = vi.fn();
vi.mock('../../src/background/services/microtasks/llmMicroTasks.js', () => ({
  summarizeArticle: (...args) => mockSummarizeArticle(...args),
  classifyArticle: (...args) => mockClassifyArticle(...args),
  extractKeywords: (...args) => mockExtractKeywords(...args),
}));

import { runAgentLoop } from '../../src/background/services/stock/agentLoop.js';

// ===== FIXTURES =====

const SEARCH_RESULTS = [
  { url: 'https://cafef.vn/fpt-q3.html', title: 'FPT Q3 Revenue', score: 90 },
  { url: 'https://vietstock.vn/fpt-analysis', title: 'FPT Analysis', score: 85 },
];

const VALIDATED_URLS = [
  { url: 'https://cafef.vn/fpt-q3.html', title: 'FPT Q3 Revenue', domain: 'cafef.vn', isTrusted: true, rank: 1 },
  { url: 'https://vietstock.vn/fpt-analysis', title: 'FPT Analysis', domain: 'vietstock.vn', isTrusted: true, rank: 2 },
];

const EXTRACTED_PAGES = [
  { success: true, url: 'https://cafef.vn/fpt-q3.html', title: 'FPT Q3 Revenue', content: 'FPT reported 25% growth in Q3 revenue. ' + 'X'.repeat(300) },
  { success: true, url: 'https://vietstock.vn/fpt-analysis', title: 'FPT Analysis', content: 'Analysts recommend BUY for FPT stock. ' + 'X'.repeat(300) },
];

const MOCK_SUMMARY = {
  summary: 'FPT grew 25% in Q3',
  facts: ['Revenue up 25%'],
  numbers: ['25%'],
  risks: ['Competition'],
  events: ['Q3 report'],
};

const MOCK_CLASSIFICATION_HIGH = { relevance: 'high', category: 'company_specific' };
const MOCK_CLASSIFICATION_LOW_UNRELATED = { relevance: 'low', category: 'unrelated' };

// ===== SETUP =====

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock behavior
  mockSearchGoogleWeb.mockResolvedValue(SEARCH_RESULTS);
  mockFilterAndRankCandidates.mockReturnValue(VALIDATED_URLS);
  mockExtractPagesSequentially.mockResolvedValue(EXTRACTED_PAGES);
  mockWalkSeedSites.mockResolvedValue({ pages: [], sitesProcessed: 0, sitesSkipped: 0, totalPagesOpened: 0 });
  mockSummarizeArticle.mockResolvedValue(MOCK_SUMMARY);
  mockClassifyArticle.mockResolvedValue(MOCK_CLASSIFICATION_HIGH);
  mockExtractKeywords.mockResolvedValue({
    primary: ['FPT'], secondary: ['cổ phiếu'], negative: [], followUpQueries: ['FPT Q3 2025'],
  });
});

// ===== TESTS =====

describe('runAgentLoop', () => {
  it('runs single round and accepts when evidence is sufficient', async () => {
    const result = await runAgentLoop('FPT', {
      agentLoop: { maxRounds: 1 },
      maxSources: 5,
    });

    expect(result.success).toBe(true);
    expect(result.evidencePack.length).toBeGreaterThan(0);
    expect(result.criticDecision).toBe('accept');
    expect(result.urlsOpened).toBeGreaterThan(0);
    expect(result.queriesUsed.length).toBeGreaterThan(0);
    expect(result.timing.total_ms).toBeGreaterThanOrEqual(0);
  });

  it('populates evidence with summary and classification', async () => {
    const result = await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 } });

    const firstEvidence = result.evidencePack[0];
    expect(firstEvidence.summary).toBe('FPT grew 25% in Q3');
    expect(firstEvidence.relevance).toBe('high');
    expect(firstEvidence.category).toBe('company_specific');
    expect(firstEvidence.facts).toContain('Revenue up 25%');
    expect(firstEvidence.sourceStage).toBe('summarized');
  });

  it('drops irrelevant pages (low relevance + unrelated)', async () => {
    // First page: high relevance, second page: low/unrelated
    mockClassifyArticle
      .mockResolvedValueOnce(MOCK_CLASSIFICATION_HIGH)
      .mockResolvedValueOnce(MOCK_CLASSIFICATION_LOW_UNRELATED);

    const result = await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 } });

    // Only the high-relevance page should be in evidence
    expect(result.evidencePack).toHaveLength(1);
    expect(result.evidencePack[0].relevance).toBe('high');
  });

  it('retries when evidence is insufficient and runs multiple rounds', async () => {
    // Round 1: return only 1 low-relevance page → critic says 'retry'
    // Round 2: return high-relevance pages → critic says 'accept'
    mockExtractPagesSequentially
      .mockResolvedValueOnce([EXTRACTED_PAGES[0]])
      .mockResolvedValueOnce(EXTRACTED_PAGES);

    mockClassifyArticle
      .mockResolvedValueOnce({ relevance: 'medium', category: 'sector' })  // Round 1
      .mockResolvedValueOnce(MOCK_CLASSIFICATION_HIGH)                     // Round 2, page 1
      .mockResolvedValueOnce(MOCK_CLASSIFICATION_HIGH);                    // Round 2, page 2

    const result = await runAgentLoop('FPT', {
      agentLoop: { maxRounds: 2, maxOpenedUrlsPerRound: 5 },
    });

    expect(result.success).toBe(true);
    // Should have done 2 rounds of search
    expect(mockSearchGoogleWeb).toHaveBeenCalledTimes(3); // Round 1 (1 query) + Round 2 (2 queries)
  });

  it('calls seed sites in round 1 when configured', async () => {
    const seedSites = [
      { domain: 'cafef.vn', enabled: true, mode: 'google_site_search' },
    ];

    mockWalkSeedSites.mockResolvedValue({
      pages: [{ success: true, url: 'https://cafef.vn/seed', title: 'Seed', content: 'From seed. '.repeat(50), discoveryMethod: 'seed_google_site_search' }],
      sitesProcessed: 1,
      sitesSkipped: 0,
      totalPagesOpened: 1,
    });

    await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 }, seedSites });

    expect(mockWalkSeedSites).toHaveBeenCalledOnce();
    expect(mockWalkSeedSites.mock.calls[0][0]).toBe('FPT');
    expect(mockWalkSeedSites.mock.calls[0][1]).toEqual(seedSites);
  });

  it('does NOT call seed sites when seedSites is empty', async () => {
    await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 }, seedSites: [] });
    expect(mockWalkSeedSites).not.toHaveBeenCalled();
  });

  it('respects URL budget (maxTotalOpenedUrls)', async () => {
    mockFilterAndRankCandidates.mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        url: `https://example.com/${i}`, title: `Page ${i}`, domain: 'example.com', isTrusted: false, rank: i + 1,
      }))
    );

    // All pages return low relevance so critic keeps retrying
    mockClassifyArticle.mockResolvedValue({ relevance: 'medium', category: 'sector' });

    const result = await runAgentLoop('FPT', {
      agentLoop: { maxRounds: 3, maxOpenedUrlsPerRound: 5, maxTotalOpenedUrls: 8 },
    });

    expect(result.urlsOpened).toBeLessThanOrEqual(8);
  });

  it('returns insufficientEvidence when search fails completely', async () => {
    mockSearchGoogleWeb.mockRejectedValue(new Error('Network error'));
    mockExtractPagesSequentially.mockResolvedValue([]);

    const result = await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 } });

    expect(result.success).toBe(false);
    expect(result.evidencePack).toHaveLength(0);
  });

  it('calls onProgress callback with status updates', async () => {
    const onProgress = vi.fn();

    await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 } }, { onProgress });

    expect(onProgress).toHaveBeenCalled();
    const statuses = onProgress.mock.calls.map(c => c[0].status);
    expect(statuses).toContain('planning');
    expect(statuses).toContain('discovering');
  });

  it('clamps maxRounds to 3', async () => {
    // Request 10 rounds, should be clamped to 3
    mockClassifyArticle.mockResolvedValue({ relevance: 'medium', category: 'sector' });

    const result = await runAgentLoop('FPT', {
      agentLoop: { maxRounds: 10 },
    });

    // At most 3 rounds even though 10 was requested
    expect(result.roundsExecuted).toBeLessThanOrEqual(3);
  });

  it('does not use duplicate URLs across rounds', async () => {
    // Both rounds return the same URLs
    const sameUrls = [VALIDATED_URLS[0]];
    mockFilterAndRankCandidates.mockReturnValue(sameUrls);
    mockClassifyArticle.mockResolvedValue({ relevance: 'medium', category: 'sector' });

    await runAgentLoop('FPT', { agentLoop: { maxRounds: 2 } });

    // Second round should filter out already-fetched URLs
    // extractPagesSequentially should receive empty array on round 2
    const secondCallUrls = mockExtractPagesSequentially.mock.calls[1]?.[0] || [];
    expect(secondCallUrls.length).toBe(0);
  });

  it('includes discoveredSources in result', async () => {
    const result = await runAgentLoop('FPT', { agentLoop: { maxRounds: 1 } });

    expect(result.discoveredSources.length).toBeGreaterThan(0);
    expect(result.discoveredSources[0]).toHaveProperty('url');
    expect(result.discoveredSources[0]).toHaveProperty('searchRound', 1);
  });
});
