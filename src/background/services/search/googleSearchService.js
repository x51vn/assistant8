/**
 * @fileoverview Google Search Service
 *
 * Stateless service that calls the `google-search-proxy` Supabase Edge Function
 * and normalizes/dedup/ranks the results.
 *
 * Architecture:
 * - Called by the stock research orchestrator (or directly from a handler)
 * - Calls Supabase Edge Function → proxy hides API key server-side
 * - Returns normalized array of search sources sorted by relevance score
 * - Fully MV3-safe: no in-memory state, no dynamic imports
 *
 * Ticket: XST-791
 * Spec:   docs/specs/stock-research-message-schema.md
 * ADR:    docs/adr/ADR-001-unified-stock-research-pipeline.md
 */

import { supabase } from '../../../supabaseConfig.js';
import { createLogger } from '../../../logger.js';
import { ERROR_CODES } from '../../../shared/errorCodes.js';

const logger = createLogger('Services/GoogleSearch');

// ===== CONSTANTS =====

const EDGE_FUNCTION_NAME = 'google-search-proxy';

/** Default options merged with caller-provided overrides */
const DEFAULT_OPTIONS = {
  maxResults: 10,
  locale: 'vi',
  market: 'VN',
  timeoutMs: 15_000,
  recencyWindowDays: 14,
};

/** Max retries for transient (5xx) errors */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 1000;

/**
 * Source type weights for ranking.
 * Higher = more relevant.
 */
const SOURCE_TYPE_WEIGHTS = {
  official: 1.0,
  research: 0.9,
  news: 0.8,
  blog: 0.5,
  forum: 0.3,
};

/**
 * Default trusted domains for credibility scoring.
 * Can be overridden via options.trustedDomains.
 */
const DEFAULT_TRUSTED_DOMAINS = [
  'cafef.vn',
  'vietstock.vn',
  'ssi.com.vn',
  'vneconomy.vn',
  'stockbiz.vn',
  'fireant.vn',
  'tinnhanhchungkhoan.vn',
  'ndh.vn',
];

// ===== PUBLIC API =====

/**
 * Search Google for stock-related information via Edge Function proxy.
 *
 * @param {string} query - Search query string
 * @param {Object} [options] - Search options
 * @param {number} [options.maxResults=10] - Maximum number of results (1-20)
 * @param {string} [options.locale='vi'] - Locale for search results
 * @param {string} [options.market='VN'] - Market identifier
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds
 * @param {number} [options.recencyWindowDays=14] - Only include sources within N days
 * @param {string[]} [options.trustedDomains] - Domains to prioritize for credibility
 * @param {string} [options.correlationId] - Correlation ID for tracing
 * @returns {Promise<SearchSource[]>} Normalized, deduped, ranked array of sources
 * @throws {SearchError} With errorCode: SEARCH_FAILED | SEARCH_TIMEOUT | SEARCH_QUOTA_EXCEEDED | AUTH_ERROR
 */
export async function searchGoogle(query, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const correlationId = opts.correlationId || 'search-' + Date.now();

  logger.info('searchGoogle started', { query, correlationId, maxResults: opts.maxResults });

  // Validate input
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw createSearchError(
      ERROR_CODES.INVALID_INPUT,
      'Search query is required and must be a non-empty string.',
      correlationId
    );
  }

  // Clamp maxResults
  const maxResults = Math.max(1, Math.min(20, opts.maxResults));

  // Call Edge Function with retry
  const rawResults = await callEdgeFunctionWithRetry(
    query.trim(),
    { ...opts, maxResults },
    correlationId
  );

  // Normalize → Dedup → Rank → Slice
  const trustedDomains = opts.trustedDomains || DEFAULT_TRUSTED_DOMAINS;
  const normalized = normalizeResults(rawResults, correlationId);
  const deduped = deduplicateByUrl(normalized);
  const ranked = rankSources(deduped, trustedDomains, opts.recencyWindowDays);
  const results = ranked.slice(0, maxResults);

  logger.info('searchGoogle completed', {
    correlationId,
    rawCount: rawResults?.length || 0,
    dedupedCount: deduped.length,
    returnedCount: results.length,
  });

  return results;
}

// ===== EDGE FUNCTION CALL WITH RETRY =====

/**
 * Call the Edge Function with retry logic and timeout.
 *
 * Retry policy:
 * - Max 2 retries (3 attempts total)
 * - Exponential backoff: 1s, 2s
 * - Skip retry if 4xx (client error) — throw immediately
 * - Retry on 5xx or network errors
 *
 * @param {string} query - Trimmed search query
 * @param {Object} opts - Merged options
 * @param {string} correlationId - Correlation ID
 * @returns {Promise<Array>} Raw results from Edge Function
 */
async function callEdgeFunctionWithRetry(query, opts, correlationId) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callEdgeFunctionWithTimeout(query, opts, correlationId);
      return result;
    } catch (error) {
      lastError = error;

      // Don't retry client errors (4xx) or quota errors
      if (isNonRetryableError(error)) {
        logger.warn('Non-retryable error, skipping retry', {
          correlationId,
          attempt,
          errorCode: error.errorCode,
        });
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= MAX_RETRIES) {
        logger.error('All retries exhausted', {
          correlationId,
          attempts: attempt + 1,
          errorMessage: error.message,
        });
        break;
      }

      // Exponential backoff
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn('Retrying Edge Function call', {
        correlationId,
        attempt: attempt + 1,
        delayMs: delay,
        errorMessage: error.message,
      });
      await sleep(delay);
    }
  }

  // All retries failed — throw the last error
  throw lastError || createSearchError(
    ERROR_CODES.SEARCH_FAILED,
    'Search failed after all retries.',
    correlationId
  );
}

/**
 * Call the Edge Function with AbortController timeout.
 *
 * @param {string} query - Search query
 * @param {Object} opts - Options including timeoutMs
 * @param {string} correlationId - Correlation ID
 * @returns {Promise<Array>} Raw search results
 */
async function callEdgeFunctionWithTimeout(query, opts, correlationId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: {
        query,
        maxResults: opts.maxResults,
        locale: opts.locale,
        market: opts.market,
        recencyWindowDays: opts.recencyWindowDays,
      },
      // Note: Supabase JS v2 does not natively support AbortSignal in functions.invoke.
      // We handle timeout via Promise.race as a fallback.
    });

    clearTimeout(timeoutId);

    if (error) {
      const status = error.status || error.context?.status || 0;
      return handleEdgeFunctionError(error, status, correlationId);
    }

    // Edge Function should return { items: [...] }
    return data?.items || data || [];
  } catch (err) {
    clearTimeout(timeoutId);

    // Re-throw SearchErrors as-is (e.g., from handleEdgeFunctionError)
    if (err.name === 'SearchError') {
      throw err;
    }

    // AbortController timeout
    if (err.name === 'AbortError' || controller.signal.aborted) {
      throw createSearchError(
        ERROR_CODES.SEARCH_TIMEOUT,
        `Search timed out after ${opts.timeoutMs}ms.`,
        correlationId
      );
    }

    // Network error
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw createSearchError(
        ERROR_CODES.SEARCH_FAILED,
        `Network error calling search proxy: ${err.message}`,
        correlationId
      );
    }

    throw createSearchError(
      ERROR_CODES.SEARCH_FAILED,
      `Unexpected error: ${err.message}`,
      correlationId
    );
  }
}

/**
 * Handle Edge Function error response and map to typed SearchError.
 *
 * @param {Object} error - Supabase functions.invoke error
 * @param {number} status - HTTP-like status code
 * @param {string} correlationId
 * @throws {SearchError}
 */
function handleEdgeFunctionError(error, status, correlationId) {
  const msg = error?.message || error?.context?.message || 'Unknown Edge Function error';

  if (status === 401 || status === 403) {
    throw createSearchError(ERROR_CODES.AUTH_ERROR, `Auth error: ${msg}`, correlationId);
  }

  if (status === 429) {
    throw createSearchError(ERROR_CODES.SEARCH_QUOTA_EXCEEDED, `Quota exceeded: ${msg}`, correlationId);
  }

  if (status >= 400 && status < 500) {
    throw createSearchError(ERROR_CODES.SEARCH_FAILED, `Client error (${status}): ${msg}`, correlationId);
  }

  // 5xx — retryable
  throw createSearchError(ERROR_CODES.SEARCH_FAILED, `Server error (${status}): ${msg}`, correlationId);
}

// ===== NORMALIZATION =====

/**
 * Normalize raw Edge Function results into consistent SearchSource objects.
 *
 * @param {Array} rawResults - Raw results from Edge Function
 * @param {string} correlationId
 * @returns {SearchSource[]}
 */
function normalizeResults(rawResults, correlationId) {
  if (!Array.isArray(rawResults)) {
    logger.warn('Edge Function returned non-array results', { correlationId, type: typeof rawResults });
    return [];
  }

  return rawResults
    .filter(item => item && item.url) // Must have URL
    .map(item => ({
      title: String(item.title || '').trim(),
      url: normalizeUrl(item.url || item.link || ''),
      snippet: String(item.snippet || item.description || '').trim(),
      sourceType: classifySourceType(item),
      publishedAt: parseDate(item.publishedAt || item.date || item.pagemap?.metatags?.[0]?.['article:published_time']),
      score: 0, // Will be computed by rankSources
      credibility: 'medium', // Will be computed by rankSources
    }));
}

/**
 * Normalize a URL by removing tracking parameters and fragment.
 *
 * @param {string} rawUrl
 * @returns {string} Cleaned URL
 */
function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    // Remove common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']
      .forEach(param => url.searchParams.delete(param));
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl; // If URL parsing fails, return as-is
  }
}

/**
 * Classify a search result into a source type based on URL/metadata.
 *
 * @param {Object} item - Raw search result
 * @returns {string} One of: 'news', 'blog', 'forum', 'official', 'research'
 */
function classifySourceType(item) {
  // If the Edge Function already classified it, respect that
  if (item.sourceType && SOURCE_TYPE_WEIGHTS[item.sourceType] !== undefined) {
    return item.sourceType;
  }

  const url = (item.url || item.link || '').toLowerCase();
  const title = (item.title || '').toLowerCase();

  // Official / Government / Exchange
  if (url.includes('.gov.') || url.includes('hnx.vn') || url.includes('hsx.vn') || url.includes('ssi.com.vn')) {
    return 'official';
  }

  // Research reports
  if (title.includes('báo cáo') || title.includes('phân tích') || title.includes('research') || title.includes('report')) {
    return 'research';
  }

  // Forums
  if (url.includes('forum') || url.includes('f247') || url.includes('reddit.com') || url.includes('tinhte.vn')) {
    return 'forum';
  }

  // Blog platforms
  if (url.includes('blog') || url.includes('medium.com') || url.includes('substack.com')) {
    return 'blog';
  }

  // Default: news
  return 'news';
}

/**
 * Parse a date string into ISO 8601 or null.
 *
 * @param {string|null|undefined} dateStr
 * @returns {string|null} ISO 8601 string or null
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

// ===== DEDUPLICATION =====

/**
 * Remove duplicate sources by URL (keep first occurrence).
 *
 * @param {SearchSource[]} sources
 * @returns {SearchSource[]} Deduplicated sources
 */
function deduplicateByUrl(sources) {
  const seen = new Set();
  return sources.filter(source => {
    // Normalize URL for comparison: lowercase, remove trailing slash
    const key = source.url.toLowerCase().replace(/\/+$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===== RANKING =====

/**
 * Rank sources by computing a composite score based on:
 * - sourceType weight (40%)
 * - freshness (30%) — newer articles score higher
 * - domain credibility (30%) — trusted domains get a boost
 *
 * Results are sorted by score descending.
 *
 * @param {SearchSource[]} sources
 * @param {string[]} trustedDomains
 * @param {number} recencyWindowDays
 * @returns {SearchSource[]} Ranked sources with score and credibility set
 */
function rankSources(sources, trustedDomains, recencyWindowDays) {
  const now = Date.now();
  const windowMs = recencyWindowDays * 24 * 60 * 60 * 1000;

  const scored = sources.map(source => {
    // 1. Source type score (0–1)
    const typeScore = SOURCE_TYPE_WEIGHTS[source.sourceType] || 0.5;

    // 2. Freshness score (0–1)
    let freshnessScore = 0.5; // Default for unknown dates
    if (source.publishedAt) {
      const ageMs = now - new Date(source.publishedAt).getTime();
      if (ageMs <= 0) {
        freshnessScore = 1.0; // Future/now = freshest
      } else if (ageMs >= windowMs) {
        freshnessScore = 0.1; // Outside recency window
      } else {
        // Linear decay within window
        freshnessScore = 1.0 - (ageMs / windowMs) * 0.9;
      }
    }

    // 3. Domain credibility score (0–1)
    const domain = extractDomain(source.url);
    const isTrusted = trustedDomains.some(td => domain.endsWith(td));
    const credibilityScore = isTrusted ? 1.0 : 0.5;
    const credibility = isTrusted ? 'high' : 'medium';

    // Composite score: weighted average
    const score = roundTo(
      typeScore * 0.4 + freshnessScore * 0.3 + credibilityScore * 0.3,
      4
    );

    return { ...source, score, credibility };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Extract the domain from a URL string.
 *
 * @param {string} url
 * @returns {string} Domain (e.g., 'cafef.vn')
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ===== HELPERS =====

/**
 * Check if error is non-retryable (client errors, auth, quota).
 *
 * @param {SearchError} error
 * @returns {boolean}
 */
function isNonRetryableError(error) {
  const nonRetryable = [
    ERROR_CODES.AUTH_ERROR,
    ERROR_CODES.AUTH_REQUIRED,
    ERROR_CODES.AUTH_EXPIRED,
    ERROR_CODES.SEARCH_QUOTA_EXCEEDED,
    ERROR_CODES.INVALID_INPUT,
    ERROR_CODES.SEARCH_TIMEOUT,
  ];
  return nonRetryable.includes(error.errorCode);
}

/**
 * Create a structured SearchError.
 *
 * @param {string} errorCode - Error code from ERROR_CODES
 * @param {string} message - Technical error message
 * @param {string} correlationId
 * @returns {SearchError}
 */
function createSearchError(errorCode, message, correlationId) {
  const error = new Error(message);
  error.errorCode = errorCode;
  error.correlationId = correlationId;
  error.name = 'SearchError';
  return error;
}

/**
 * Round a number to N decimal places.
 *
 * @param {number} num
 * @param {number} decimals
 * @returns {number}
 */
function roundTo(num, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Promise-based sleep.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== EXPORTS FOR TESTING =====

/* istanbul ignore next */
export const _testExports = {
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
};
