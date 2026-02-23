/**
 * @fileoverview Search Utilities — Shared normalization, dedup, ranking functions
 * Ticket: XST-812
 *
 * Reusable helpers for search result normalization, deduplication, and ranking.
 * Used by googleSearchWebService.js (DOM automation).
 */

// ===== CONSTANTS =====

/**
 * Source type weights for ranking.
 * Higher = more relevant.
 */
export const SOURCE_TYPE_WEIGHTS = {
  official: 1.0,
  research: 0.9,
  news: 0.8,
  blog: 0.5,
  forum: 0.3,
  web: 0.6,
};

/**
 * Default trusted domains for credibility scoring (Vietnamese stock market).
 */
export const DEFAULT_TRUSTED_DOMAINS = [
  'cafef.vn',
  'vietstock.vn',
  'ssi.com.vn',
  'vneconomy.vn',
  'stockbiz.vn',
  'fireant.vn',
  'tinnhanhchungkhoan.vn',
  'ndh.vn',
  'simplize.vn',
];

// ===== NORMALIZATION =====

/**
 * Normalize raw search results into consistent SearchSource objects.
 *
 * @param {Array} rawResults - Raw results (from Edge Function or DOM scraping)
 * @param {string} correlationId
 * @returns {SearchSource[]}
 */
export function normalizeResults(rawResults, correlationId) {
  if (!Array.isArray(rawResults)) {
    return [];
  }

  return rawResults
    .filter(item => item && item.url)
    .map(item => ({
      title: String(item.title || '').trim(),
      url: normalizeUrl(item.url || item.link || ''),
      snippet: String(item.snippet || item.description || '').trim(),
      sourceType: classifySourceType(item),
      publishedAt: parseDate(item.publishedAt || item.date || null),
      score: 0,
      credibility: 'medium',
    }));
}

/**
 * Normalize a URL by removing tracking parameters and fragment.
 *
 * @param {string} rawUrl
 * @returns {string} Cleaned URL
 */
export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']
      .forEach(param => url.searchParams.delete(param));
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Classify a search result into a source type based on URL/metadata.
 *
 * @param {Object} item - Raw search result
 * @returns {string} One of: 'news', 'blog', 'forum', 'official', 'research', 'web'
 */
export function classifySourceType(item) {
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
export function parseDate(dateStr) {
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
export function deduplicateByUrl(sources) {
  const seen = new Set();
  return sources.filter(source => {
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
export function rankSources(sources, trustedDomains, recencyWindowDays) {
  const now = Date.now();
  const windowMs = recencyWindowDays * 24 * 60 * 60 * 1000;

  const scored = sources.map(source => {
    // 1. Source type score (0–1)
    const typeScore = SOURCE_TYPE_WEIGHTS[source.sourceType] || 0.5;

    // 2. Freshness score (0–1)
    let freshnessScore = 0.5;
    if (source.publishedAt) {
      const ageMs = now - new Date(source.publishedAt).getTime();
      if (ageMs <= 0) {
        freshnessScore = 1.0;
      } else if (ageMs >= windowMs) {
        freshnessScore = 0.1;
      } else {
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

  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Extract the domain from a URL string.
 *
 * @param {string} url
 * @returns {string} Domain (e.g., 'cafef.vn')
 */
export function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ===== HELPERS =====

/**
 * Create a structured SearchError.
 *
 * @param {string} errorCode - Error code from ERROR_CODES
 * @param {string} message - Technical error message
 * @param {string} correlationId
 * @returns {SearchError}
 */
export function createSearchError(errorCode, message, correlationId) {
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
