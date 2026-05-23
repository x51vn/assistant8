/**
 * @fileoverview Google Search Web Service — DOM scraping on google.com tabs
 * Ticket: XST-812 — Google Search Web Provider (no API key)
 *
 * Architecture:
 * 1. Open a google.com/search tab with the query
 * 2. Wait for tab to load completely
 * 3. Inject extraction function via chrome.scripting.executeScript
 * 4. Parse DOM → extract organic results (filter ads)
 * 5. Close tab
 * 6. Normalize → Dedup → Rank → Return
 *
 * MV3-safe: No in-memory state, no dynamic imports, stateless per call.
 * Uses chrome.scripting.executeScript({func}) for inline injection.
 */

import { createLogger } from '../../../logger.js';
import { ERROR_CODES } from '../../../shared/errorCodes.js';
import {
  normalizeResults,
  deduplicateByUrl,
  rankSources,
  createSearchError,
  DEFAULT_TRUSTED_DOMAINS,
} from './searchUtils.js';
import { SearchResultCache, getSearchCache } from './searchCache.js';
import { sleep } from '../../../shared/utils.js';

const logger = createLogger('Services/GoogleSearchWeb');

// ===== CONSTANTS =====

const DEFAULT_OPTIONS = {
  maxResults: 10,
  locale: 'vi',
  timeoutMs: 30_000,
  recencyWindowDays: 14,
};

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 2000;

// ===== PUBLIC API =====

/**
 * Search Google by opening a tab, scraping SERP DOM, and extracting results.
 * No API key needed — uses the user's browser session.
 *
 * @param {string} query - Search query string
 * @param {Object} [options] - Search options
 * @param {number} [options.maxResults=10] - Maximum results to return (1-20)
 * @param {string} [options.locale='vi'] - Locale for search results
 * @param {number} [options.timeoutMs=30000] - Timeout for tab load + extraction
 * @param {number} [options.recencyWindowDays=14] - Recency window for ranking
 * @param {string[]} [options.trustedDomains] - Trusted domains for ranking
 * @param {string} [options.correlationId] - Correlation ID for tracing
 * @returns {Promise<SearchSource[]>} Normalized, deduped, ranked sources
 * @throws {SearchError} With errorCode: SEARCH_FAILED | SEARCH_TIMEOUT
 */
export async function searchGoogleWeb(query, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const correlationId = opts.correlationId || 'gsearch-web-' + Date.now();
  const maxResults = Math.max(1, Math.min(20, opts.maxResults));

  logger.info('searchGoogleWeb started', { query, correlationId, maxResults });

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw createSearchError(
      ERROR_CODES.INVALID_INPUT,
      'Search query is required and must be a non-empty string.',
      correlationId
    );
  }

  // ===== CACHE CHECK (XST-805) =====
  const cache = getSearchCache();
  const cacheKey = SearchResultCache.buildKey(query, opts);

  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.info('searchGoogleWeb cache HIT — returning cached results', {
      query, correlationId, cacheKey, cachedCount: cached.length,
      cacheStats: cache.getStats(),
    });
    return cached.slice(0, maxResults);
  }
  logger.info('searchGoogleWeb cache MISS — fetching from web', {
    query, correlationId, cacheKey,
  });

  let rawResults;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info('Retrying search', { attempt, delay, correlationId });
        await sleep(delay);
      }

      rawResults = await executeSearchInTab(query.trim(), opts, correlationId);
      break; // Success
    } catch (err) {
      lastError = err;

      // Don't retry timeout errors
      if (err.errorCode === ERROR_CODES.SEARCH_TIMEOUT) {
        throw err;
      }

      if (attempt >= MAX_RETRIES) {
        logger.error('All search retries exhausted', {
          correlationId,
          attempts: attempt + 1,
          error: err.message,
        });
        break;
      }

      logger.warn('Search attempt failed, will retry', {
        correlationId,
        attempt: attempt + 1,
        error: err.message,
      });
    }
  }

  if (!rawResults) {
    throw lastError || createSearchError(
      ERROR_CODES.SEARCH_FAILED,
      'Search failed after all retries.',
      correlationId
    );
  }

  // Normalize → Dedup → Rank → Slice
  const trustedDomains = opts.trustedDomains || DEFAULT_TRUSTED_DOMAINS;
  const normalized = normalizeResults(rawResults, correlationId);
  const deduped = deduplicateByUrl(normalized);
  const ranked = rankSources(deduped, trustedDomains, opts.recencyWindowDays);
  const results = ranked.slice(0, maxResults);

  logger.info('searchGoogleWeb completed', {
    correlationId,
    rawCount: rawResults.length,
    dedupedCount: deduped.length,
    returnedCount: results.length,
  });

  // ===== CACHE STORE (XST-805) =====
  try {
    await cache.set(cacheKey, results);
    logger.info('searchGoogleWeb cached results', {
      correlationId, cacheKey, resultCount: results.length,
      cacheStats: cache.getStats(),
    });
  } catch (cacheErr) {
    // Cache store failure is non-fatal
    logger.warn('Failed to cache search results', { error: cacheErr.message, correlationId });
  }

  return results;
}

// ===== TAB AUTOMATION =====

/**
 * Execute search by opening a Google tab, extracting DOM results, and closing tab.
 *
 * @param {string} query - Trimmed search query
 * @param {Object} opts - Options
 * @param {string} correlationId
 * @returns {Promise<Array>} Raw extracted results
 */
async function executeSearchInTab(query, opts, correlationId) {
  const searchUrl = buildSearchUrl(query, opts);
  let tabId = null;

  try {
    // 1. Create tab (inactive to avoid stealing focus)
    const tab = await chrome.tabs.create({
      url: searchUrl,
      active: false,
    });
    tabId = tab.id;

    logger.info('Google Search tab created', { tabId, url: searchUrl, correlationId });

    // 2. Wait for tab to complete loading
    await waitForTabLoad(tabId, opts.timeoutMs);

    // 3. Brief delay for DOM to settle (Google renders progressively)
    await sleep(500);

    // 4. Inject extraction function and execute
    const results = await injectAndExtract(tabId, correlationId);

    logger.info('Search results extracted', {
      tabId,
      count: results.length,
      correlationId,
    });

    return results;
  } finally {
    // 5. Always close the tab
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
        logger.info('Google Search tab closed', { tabId, correlationId });
      } catch (closeErr) {
        logger.warn('Failed to close search tab', { tabId, error: closeErr.message });
      }
    }
  }
}

/**
 * Build Google Search URL with encoded query and params.
 *
 * @param {string} query
 * @param {Object} opts
 * @returns {string}
 */
function buildSearchUrl(query, opts) {
  const params = new URLSearchParams({
    q: query,
    num: String(Math.min(opts.maxResults + 5, 20)), // Request extra to account for ads
    hl: opts.locale || 'vi',
  });
  return `https://www.google.com/search?${params.toString()}`;
}

/**
 * Wait for a tab to finish loading.
 *
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let resolved = false;

    const cleanup = () => {
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeoutId);
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete' && !resolved) {
        cleanup();
        resolve();
      }
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(createSearchError(
          ERROR_CODES.SEARCH_TIMEOUT,
          `Google Search tab did not load within ${timeoutMs}ms`,
          'tab-load-timeout'
        ));
      }
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(listener);

    // Check if already complete (edge case: very fast load)
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete' && !resolved) {
        cleanup();
        resolve();
      }
    }).catch(err => {
      if (!resolved) {
        cleanup();
        reject(createSearchError(
          ERROR_CODES.SEARCH_FAILED,
          `Tab check failed: ${err.message}`,
          'tab-check-error'
        ));
      }
    });
  });
}

/**
 * Inject the extraction function into the Google Search tab and return results.
 * Uses chrome.scripting.executeScript with inline func (MV3-safe, no dynamic import).
 *
 * @param {number} tabId
 * @param {string} correlationId
 * @returns {Promise<Array>} Extracted search results
 */
async function injectAndExtract(tabId, correlationId) {
  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractSearchResultsFromDOM,
      // No args needed — function reads from document directly
    });

    // chrome.scripting.executeScript returns array of InjectionResults
    const result = injectionResults?.[0]?.result;

    if (!result || !Array.isArray(result)) {
      throw createSearchError(
        ERROR_CODES.SEARCH_FAILED,
        'Extraction returned no results. Google page structure may have changed.',
        correlationId
      );
    }

    return result;
  } catch (err) {
    // Re-throw SearchErrors
    if (err.name === 'SearchError') throw err;

    throw createSearchError(
      ERROR_CODES.SEARCH_FAILED,
      `Script injection failed: ${err.message}`,
      correlationId
    );
  }
}

// ===== DOM EXTRACTION FUNCTION =====
// This function is injected into the Google page context via chrome.scripting.executeScript.
// It must be completely self-contained (no imports, no closures over outer scope).

/**
 * Extract organic search results from Google SERP DOM.
 * This function runs inside the google.com page context.
 *
 * @returns {Array<{title: string, url: string, snippet: string, publishedAt: string|null}>}
 */
function extractSearchResultsFromDOM() {
  const results = [];

  // ===== Selector chains with fallbacks (Google DOM changes frequently) =====

  // Primary: standard organic result containers
  const selectorChains = [
    'div.g:not([data-text-ad]):not([data-ad-slot])',                 // Standard results
    'div[data-sokoban-container] div.g',                            // Container variation
    'div.MjjYud div.g',                                             // 2024 layout
    '#rso > div > div.g',                                           // Direct children
    '#search div.g',                                                // Fallback search container
  ];

  // Ad selectors to exclude
  const adSelectors = [
    '[data-text-ad]',
    '[data-ad-slot]',
    '[aria-label*="Ad"]',
    '[aria-label*="Quảng cáo"]',
    '[aria-label*="Sponsored"]',
    '.commercial-unit-desktop-top',
    '.ads-ad',
    '#tads',
    '#bottomads',
  ];

  // Check if an element is an ad
  function isAd(el) {
    for (const sel of adSelectors) {
      if (el.matches(sel) || el.closest(sel)) return true;
    }
    return false;
  }

  // Try each selector chain until we find results
  let resultElements = [];
  for (const selector of selectorChains) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        resultElements = Array.from(elements);
        break;
      }
    } catch {
      // Selector parse error — skip
    }
  }

  // Process each result element
  for (const el of resultElements) {
    try {
      // Skip ads
      if (isAd(el)) continue;

      // Extract title — multiple selector fallbacks
      const titleEl = el.querySelector('h3')
        || el.querySelector('.LC20lb')
        || el.querySelector('a[data-ved] h3')
        || el.querySelector('[role="heading"]');

      if (!titleEl) continue; // No title = not a valid result

      const title = titleEl.textContent?.trim() || '';
      if (!title) continue;

      // Extract URL — from the anchor wrapping the title
      const linkEl = el.querySelector('a[href]')
        || titleEl.closest('a[href]');

      if (!linkEl) continue;

      let url = linkEl.href || '';

      // Skip Google internal URLs
      if (url.includes('google.com/search') ||
          url.includes('google.com/url?') ||
          url.startsWith('javascript:') ||
          url.startsWith('#')) {
        // Try to extract actual URL from data attribute or redirect
        const actualUrl = linkEl.getAttribute('data-href')
          || linkEl.getAttribute('ping');
        if (actualUrl && !actualUrl.includes('google.com')) {
          url = actualUrl;
        } else if (url.includes('google.com/url?')) {
          // Parse redirect URL
          try {
            const parsed = new URL(url);
            url = parsed.searchParams.get('q') || parsed.searchParams.get('url') || url;
          } catch { /* keep original */ }
        } else {
          continue; // Skip internal links
        }
      }

      if (!url || url.startsWith('#')) continue;

      // Extract snippet
      const snippetEl = el.querySelector('.VwiC3b')
        || el.querySelector('[data-sncf]')
        || el.querySelector('.lEBKkf span')
        || el.querySelector('.IsZvec')
        || el.querySelector('.s .st')
        || el.querySelector('[data-content-feature="1"]');

      const snippet = snippetEl?.textContent?.trim() || '';

      // Extract date from snippet (Google often prepends dates)
      let publishedAt = null;
      const datePatterns = [
        /^(\d{1,2})\s+(thg|tháng)\s+(\d{1,2}),?\s*(\d{4})/, // Vietnamese: "5 thg 1, 2024"
        /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i, // English
        /^(\d{4})-(\d{2})-(\d{2})/,   // ISO date
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // DD/MM/YYYY
      ];

      // Check cite/date area
      const dateEl = el.querySelector('.LEwnzc span')
        || el.querySelector('span.MUxGbd');
      const dateText = dateEl?.textContent || '';

      for (const pattern of datePatterns) {
        const match = dateText.match(pattern) || snippet.match(pattern);
        if (match) {
          try {
            const d = new Date(match[0]);
            if (!isNaN(d.getTime())) {
              publishedAt = d.toISOString();
            }
          } catch { /* ignore */ }
          break;
        }
      }

      results.push({ title, url, snippet, publishedAt });

      // Cap at 15 results (more than needed, will be sliced later)
      if (results.length >= 15) break;
    } catch {
      // Skip malformed result elements
    }
  }

  return results;
}

// ===== HELPERS =====

// ===== EXPORTS FOR TESTING =====

/* istanbul ignore next */
export const _testExports = {
  executeSearchInTab,
  buildSearchUrl,
  waitForTabLoad,
  injectAndExtract,
  extractSearchResultsFromDOM,
};
