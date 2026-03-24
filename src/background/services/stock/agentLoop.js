/**
 * @fileoverview Bounded Agent Loop — Planner/Critic for agentic stock research
 * Ticket: Agentic Web Research — Phase 4
 *
 * Implements a bounded multi-agent loop:
 *   Round N: Planner → Retriever → Evidence Processor → Synthesizer → Critic
 *
 * Constraints:
 * - maxRounds (default 2, max 3)
 * - maxCriticPasses (default 1)
 * - maxOpenedUrlsPerRound (default 5)
 * - URL budget across all rounds is tracked
 *
 * Fail-safe: If evidence is still weak after max rounds,
 * returns result with `insufficientEvidence: true`.
 *
 * Stateless, MV3-safe.
 */

import { createLogger, generateCorrelationId } from '../../../logger.js';
import { searchGoogleWeb } from '../search/googleSearchWebService.js';
import { filterAndRankCandidates } from '../search/urlCandidateValidator.js';
import { extractPagesSequentially } from '../retrieval/pageContentService.js';
import { walkSeedSites } from '../retrieval/seedSiteWalker.js';
import { summarizeArticle, classifyArticle, extractKeywords } from '../microtasks/llmMicroTasks.js';

const logger = createLogger('AgentLoop');

// ===== DEFAULTS =====

const DEFAULTS = {
  maxRounds: 2,
  maxCriticPasses: 1,
  maxOpenedUrlsPerRound: 5,
  maxTotalOpenedUrls: 12,
  minEvidencePages: 2,
  minHighRelevancePages: 1,
};

// ===== PUBLIC API =====

/**
 * Run the bounded agent loop for stock research.
 *
 * @param {string} symbol - Uppercased stock ticker
 * @param {Object} pipelineOptions - Merged pipeline options
 * @param {Object} deps - Dependencies
 * @param {Object} [deps.settingsConfig] - User settings
 * @param {Function} [deps.onProgress] - Progress callback
 * @param {Object} [deps.microtaskOptions] - Options for llmMicroTasks
 * @returns {Promise<AgentLoopResult>}
 *
 * @typedef {Object} AgentLoopResult
 * @property {boolean} success
 * @property {EvidenceItem[]} evidencePack - Processed evidence for synthesis
 * @property {string[]} queriesUsed - All search queries across rounds
 * @property {number} roundsExecuted
 * @property {number} urlsOpened
 * @property {string} criticDecision - 'accept' | 'insufficient' | 'retry_exhausted'
 * @property {boolean} insufficientEvidence
 * @property {Object} timing
 * @property {DiscoveredSource[]} discoveredSources - Raw search results (metadata only)
 *
 * @typedef {Object} EvidenceItem
 * @property {string} url
 * @property {string} title
 * @property {string} content - Full extracted content
 * @property {string} summary - Microtask summary
 * @property {string} relevance - 'high' | 'medium' | 'low'
 * @property {string} category
 * @property {string[]} facts
 * @property {string[]} numbers
 * @property {string[]} risks
 * @property {string} sourceStage - 'fetched' | 'summarized'
 * @property {string} discoveryMethod - 'google_search' | 'seed_google_site_search' | 'seed_direct_open'
 */
export async function runAgentLoop(symbol, pipelineOptions = {}, deps = {}) {
  const correlationId = pipelineOptions.correlationId || generateCorrelationId();
  const { onProgress, settingsConfig, microtaskOptions = {} } = deps;

  const agentConfig = {
    ...DEFAULTS,
    ...(pipelineOptions.agentLoop || {}),
  };
  // Clamp values
  agentConfig.maxRounds = Math.min(agentConfig.maxRounds || 2, 3);
  agentConfig.maxCriticPasses = Math.min(agentConfig.maxCriticPasses || 1, 2);

  const timing = {};
  const startTime = Date.now();
  const allQueries = [];
  const allDiscoveredSources = [];
  let totalUrlsOpened = 0;
  let evidencePack = [];
  let criticDecision = 'accept';

  const emit = (status, message) => {
    if (typeof onProgress === 'function') {
      onProgress({ status, message, symbol, correlationId });
    }
  };

  logger.info('Agent loop started', { symbol, maxRounds: agentConfig.maxRounds, correlationId });

  for (let round = 1; round <= agentConfig.maxRounds; round++) {
    const roundStart = Date.now();

    // ===== PLANNER =====
    emit('planning', `Vòng ${round}: Đang lập kế hoạch tìm kiếm ${symbol}...`);

    const plannerResult = await runPlanner(symbol, {
      round,
      previousQueries: allQueries,
      previousEvidence: evidencePack,
      criticFeedback: round > 1 ? criticDecision : null,
      options: pipelineOptions,
      microtaskOptions,
    });

    allQueries.push(...plannerResult.queries);

    // ===== RETRIEVER: Google Discovery =====
    emit('discovering', `Vòng ${round}: Đang tìm kiếm thông tin ${symbol}...`);

    const retrievalBudget = Math.min(
      agentConfig.maxOpenedUrlsPerRound,
      agentConfig.maxTotalOpenedUrls - totalUrlsOpened
    );

    if (retrievalBudget <= 0) {
      logger.info('URL budget exhausted', { totalUrlsOpened, correlationId });
      break;
    }

    const discoveredUrls = [];
    for (const query of plannerResult.queries) {
      try {
        const results = await searchGoogleWeb(query, {
          maxResults: pipelineOptions.maxSources || 8,
          recencyWindowDays: pipelineOptions.recencyWindowDays || 14,
          trustedDomains: pipelineOptions.trustedDomains
            ? (typeof pipelineOptions.trustedDomains === 'string'
              ? pipelineOptions.trustedDomains.split(',').map(d => d.trim())
              : pipelineOptions.trustedDomains)
            : undefined,
          timeoutMs: 15_000,
          correlationId,
        });

        for (const r of results) {
          allDiscoveredSources.push({ ...r, searchRound: round, query });
          discoveredUrls.push({ url: r.url, title: r.title, score: r.score });
        }
      } catch (err) {
        logger.warn('Search query failed in agent loop', { query, error: err.message, correlationId });
      }
    }

    // Validate and limit URLs
    emit('opening_urls', `Vòng ${round}: Đang mở các trang web...`);

    const validatedUrls = filterAndRankCandidates(discoveredUrls, {
      trustedDomains: pipelineOptions.trustedDomains
        ? (typeof pipelineOptions.trustedDomains === 'string'
          ? pipelineOptions.trustedDomains.split(',').map(d => d.trim())
          : pipelineOptions.trustedDomains)
        : undefined,
    });

    // Filter out already-fetched URLs
    const fetchedUrlSet = new Set(evidencePack.map(e => e.url));
    const newUrls = validatedUrls.filter(u => !fetchedUrlSet.has(u.url));
    const urlsToOpen = newUrls.slice(0, retrievalBudget);

    // ===== RETRIEVER: Page Extraction =====
    emit('extracting', `Vòng ${round}: Đang đọc nội dung ${urlsToOpen.length} trang...`);

    const fetchedPages = await extractPagesSequentially(urlsToOpen, {
      timeoutMs: pipelineOptions.pageTimeoutMs || 15_000,
      correlationId,
    });

    totalUrlsOpened += urlsToOpen.length;

    // ===== SEED SITES (Round 1 only) =====
    if (round === 1 && pipelineOptions.seedSites?.length > 0) {
      emit('extracting', `Đang lấy thông tin từ seed sites...`);

      const seedResult = await walkSeedSites(symbol, pipelineOptions.seedSites, {
        maxUrlsPerSite: 2,
        pageTimeoutMs: pipelineOptions.pageTimeoutMs || 15_000,
        correlationId,
        onProgress: (msg) => emit('extracting', msg),
      });

      fetchedPages.push(...seedResult.pages);
      totalUrlsOpened += seedResult.totalPagesOpened;
    }

    // ===== EVIDENCE PROCESSOR =====
    emit('microtasks', `Vòng ${round}: Đang xử lý và phân loại nội dung...`);

    const useMicrotasks = settingsConfig?.stock_research?.microtasks?.useLlmClient !== false;

    for (const page of fetchedPages) {
      if (!page.success || !page.content) continue;

      let summary = { summary: '', facts: [], numbers: [], risks: [], events: [] };
      let classification = { relevance: 'medium', category: 'company_specific' };

      if (useMicrotasks) {
        try {
          [summary, classification] = await Promise.all([
            summarizeArticle(page.content, symbol, microtaskOptions),
            classifyArticle(page.content, symbol, microtaskOptions),
          ]);
        } catch (err) {
          logger.warn('Microtask failed for page', { url: page.url, error: err.message });
        }
      }

      // Drop noise pages
      if (classification.relevance === 'low' && classification.category === 'unrelated') {
        logger.info('Dropping irrelevant page', { url: page.url, classification });
        continue;
      }

      evidencePack.push({
        url: page.url,
        title: page.title,
        content: page.content,
        summary: summary?.summary || '',
        relevance: classification?.relevance || 'medium',
        category: classification?.category || 'company_specific',
        facts: summary?.facts || [],
        numbers: summary?.numbers || [],
        risks: summary?.risks || [],
        sourceStage: summary?.summary ? 'summarized' : 'fetched',
        discoveryMethod: page.discoveryMethod || 'google_search',
      });
    }

    timing[`round${round}_ms`] = Date.now() - roundStart;

    // ===== CRITIC =====
    emit('critic_review', `Vòng ${round}: Đang đánh giá bằng chứng thu thập...`);

    criticDecision = evaluateEvidence(evidencePack, agentConfig);

    logger.info('Critic decision', {
      round,
      decision: criticDecision,
      evidenceCount: evidencePack.length,
      highRelevance: evidencePack.filter(e => e.relevance === 'high').length,
      correlationId,
    });

    if (criticDecision === 'accept') {
      break;
    }

    // If critic says retry but we're at max rounds, stop
    if (round >= agentConfig.maxRounds) {
      criticDecision = 'retry_exhausted';
      break;
    }
  }

  timing.total_ms = Date.now() - startTime;

  const result = {
    success: evidencePack.length > 0,
    evidencePack,
    queriesUsed: allQueries,
    roundsExecuted: Math.min(allQueries.length > 0 ? Math.ceil(allQueries.length / 2) : 1, agentConfig.maxRounds),
    urlsOpened: totalUrlsOpened,
    criticDecision,
    insufficientEvidence: criticDecision !== 'accept',
    timing,
    discoveredSources: allDiscoveredSources,
  };

  logger.info('Agent loop completed', {
    symbol,
    evidenceCount: evidencePack.length,
    urlsOpened: totalUrlsOpened,
    criticDecision,
    totalMs: timing.total_ms,
    correlationId,
  });

  return result;
}

// ===== PLANNER =====

/**
 * Generate search queries for the current round.
 */
async function runPlanner(symbol, context) {
  const { round, previousQueries, previousEvidence, criticFeedback, options, microtaskOptions } = context;
  const year = new Date().getFullYear();

  if (round === 1) {
    // Initial queries — broad coverage
    const queries = [
      `${symbol} cổ phiếu phân tích đánh giá ${year}`,
    ];

    // Try LLM-based keyword extraction for richer queries
    try {
      const headlines = previousEvidence.map(e => e.title).filter(Boolean);
      const keywords = await extractKeywords(
        { symbol, headlines },
        { ...microtaskOptions, timeoutMs: 10_000 }
      );

      if (keywords.followUpQueries?.length > 0) {
        queries.push(...keywords.followUpQueries.slice(0, 1));
      }
    } catch {
      // Fallback query
      queries.push(`${symbol} kết quả kinh doanh quý ${year}`);
    }

    return { queries: queries.slice(0, 3) };
  }

  // Subsequent rounds: refine based on gaps
  const coveredCategories = new Set(previousEvidence.map(e => e.category));
  const refinedQueries = [];

  if (!coveredCategories.has('company_specific')) {
    refinedQueries.push(`${symbol} báo cáo tài chính kết quả kinh doanh ${year}`);
  }
  if (!coveredCategories.has('sector')) {
    refinedQueries.push(`${symbol} ngành phân tích triển vọng ${year}`);
  }

  // Avoid repeating previous queries
  const prevSet = new Set(previousQueries);
  const newQueries = refinedQueries.filter(q => !prevSet.has(q));

  if (newQueries.length === 0) {
    newQueries.push(`${symbol} tin tức mới nhất ${year}`);
  }

  return { queries: newQueries.slice(0, 2) };
}

// ===== CRITIC =====

/**
 * Evaluate evidence quality and decide whether to accept or retry.
 *
 * @param {EvidenceItem[]} evidence
 * @param {Object} config
 * @returns {'accept' | 'retry'}
 */
function evaluateEvidence(evidence, config) {
  if (evidence.length >= config.minEvidencePages) {
    const highRelevance = evidence.filter(e => e.relevance === 'high').length;
    if (highRelevance >= config.minHighRelevancePages) {
      return 'accept';
    }
  }

  return 'retry';
}
