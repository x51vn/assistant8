/**
 * @fileoverview Seed Site Walker — Open configured seed-site pages
 * Ticket: Agentic Web Research — Phase 2
 *
 * Two execution modes:
 * 1. `google_site_search` — query "site:{domain} {symbol}" via googleSearchWebService,
 *    then extract top result pages.
 * 2. `direct_open` — open a domain/path template directly and extract content.
 *
 * Stateless, MV3-safe. Each call is independent.
 */

import { createLogger } from '../../../logger.js';
import { searchGoogleWeb } from '../search/googleSearchWebService.js';
import { filterAndRankCandidates } from '../search/urlCandidateValidator.js';
import { extractPageContent } from './pageContentService.js';

const logger = createLogger('SeedSiteWalker');

// ===== DEFAULTS =====

const DEFAULT_MAX_URLS_PER_SITE = 2;
const DEFAULT_PAGE_TIMEOUT_MS = 15_000;

// ===== PUBLIC API =====

/**
 * Walk all enabled seed sites for a given symbol.
 * Returns fetched page content merged from all sites.
 *
 * @param {string} symbol - Stock ticker symbol (uppercased)
 * @param {Array<SeedSiteConfig>} seedSites - Seed site config from settings
 * @param {Object} [options]
 * @param {number} [options.maxUrlsPerSite=2] - Max pages to open per seed site
 * @param {number} [options.pageTimeoutMs=15000]
 * @param {string[]} [options.trustedDomains]
 * @param {string} [options.correlationId]
 * @param {Function} [options.onProgress] - Callback: (msg) => void
 * @returns {Promise<SeedWalkerResult>}
 *
 * @typedef {Object} SeedSiteConfig
 * @property {string} domain - e.g. 'vietstock.vn'
 * @property {boolean} enabled
 * @property {string} mode - 'google_site_search' | 'direct_open'
 * @property {string} [pathTemplate] - For direct_open mode, e.g. '/co-phieu/{symbol}'
 *
 * @typedef {Object} SeedWalkerResult
 * @property {Array<import('./pageContentService.js').PageContent>} pages
 * @property {number} sitesProcessed
 * @property {number} sitesSkipped
 * @property {number} totalPagesOpened
 */
export async function walkSeedSites(symbol, seedSites, options = {}) {
  const {
    maxUrlsPerSite = DEFAULT_MAX_URLS_PER_SITE,
    pageTimeoutMs = DEFAULT_PAGE_TIMEOUT_MS,
    trustedDomains,
    correlationId = '',
    onProgress,
  } = options;

  if (!Array.isArray(seedSites) || seedSites.length === 0) {
    return { pages: [], sitesProcessed: 0, sitesSkipped: 0, totalPagesOpened: 0 };
  }

  const enabledSites = seedSites.filter(s => s.enabled && s.domain);
  const skipped = seedSites.length - enabledSites.length;

  const allPages = [];
  let totalOpened = 0;

  for (const site of enabledSites) {
    try {
      if (typeof onProgress === 'function') {
        onProgress(`Đang lấy dữ liệu từ ${site.domain}...`);
      }

      const pages = site.mode === 'direct_open'
        ? await walkDirectOpen(symbol, site, { pageTimeoutMs, correlationId })
        : await walkGoogleSiteSearch(symbol, site, { maxUrlsPerSite, pageTimeoutMs, trustedDomains, correlationId });

      allPages.push(...pages);
      totalOpened += pages.length;

      logger.info('Seed site walked', {
        domain: site.domain,
        mode: site.mode,
        pagesFound: pages.length,
        correlationId,
      });
    } catch (err) {
      logger.warn('Seed site walk failed', {
        domain: site.domain,
        error: err.message,
        correlationId,
      });
    }
  }

  return {
    pages: allPages,
    sitesProcessed: enabledSites.length,
    sitesSkipped: skipped,
    totalPagesOpened: totalOpened,
  };
}

// ===== INTERNAL STRATEGIES =====

/**
 * google_site_search mode:
 * Query "site:{domain} {symbol}" via Google, then extract top result pages.
 */
async function walkGoogleSiteSearch(symbol, site, options = {}) {
  const { maxUrlsPerSite = DEFAULT_MAX_URLS_PER_SITE, pageTimeoutMs, trustedDomains, correlationId } = options;

  const query = `site:${site.domain} ${symbol} cổ phiếu`;

  const searchResults = await searchGoogleWeb(query, {
    maxResults: maxUrlsPerSite + 2, // slight buffer for filtering
    timeoutMs: 15_000,
    trustedDomains,
    correlationId: `${correlationId}-seed-${site.domain}`,
  });

  if (!searchResults || searchResults.length === 0) {
    logger.info('No Google site-search results for seed', { domain: site.domain, symbol, correlationId });
    return [];
  }

  // Validate and limit URLs
  const validated = filterAndRankCandidates(
    searchResults.map(r => ({ url: r.url, title: r.title, score: r.score })),
    { trustedDomains }
  );
  const topUrls = validated.slice(0, maxUrlsPerSite);

  // Extract pages sequentially
  const pages = [];
  for (const candidate of topUrls) {
    const result = await extractPageContent(candidate.url, {
      timeoutMs: pageTimeoutMs,
      correlationId: `${correlationId}-seed-${site.domain}`,
    });
    if (result.success) {
      pages.push({ ...result, discoveryMethod: 'seed_google_site_search', seedDomain: site.domain });
    }
  }

  return pages;
}

/**
 * direct_open mode:
 * Open a constructed URL from template and extract content.
 */
async function walkDirectOpen(symbol, site, options = {}) {
  const { pageTimeoutMs, correlationId } = options;

  // Build URL from template or default pattern
  const path = site.pathTemplate
    ? site.pathTemplate.replace('{symbol}', symbol.toLowerCase())
    : `/${symbol.toLowerCase()}`;

  const url = `https://${site.domain}${path}`;

  const result = await extractPageContent(url, {
    timeoutMs: pageTimeoutMs,
    correlationId: `${correlationId}-seed-direct-${site.domain}`,
  });

  if (result.success) {
    return [{ ...result, discoveryMethod: 'seed_direct_open', seedDomain: site.domain }];
  }

  return [];
}
