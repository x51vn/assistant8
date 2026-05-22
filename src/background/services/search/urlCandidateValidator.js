/**
 * @fileoverview URL Candidate Validator
 * Ticket: Agentic Web Research — Phase 1
 *
 * Validates and filters URLs before opening them for content extraction.
 * Rejects known-bad patterns (Google cache, redirects, unsupported protocols).
 * Prioritizes trusted Vietnamese financial domains.
 *
 * Stateless — MV3-safe.
 */

import { createLogger } from '../../../logger.js';
import { DEFAULT_TRUSTED_DOMAINS, extractDomain } from './searchUtils.js';

const logger = createLogger('UrlCandidateValidator');

// ===== BLOCKED PATTERNS =====

/** Domains/patterns that should never be opened for content extraction */
const BLOCKED_DOMAINS = [
  'google.com',
  'google.com.vn',
  'googleapis.com',
  'gstatic.com',
  'youtube.com',
  'youtu.be',
  'webcache.googleusercontent.com',
  'translate.google.com',
  'accounts.google.com',
  'play.google.com',
  'maps.google.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
];

/** URL path patterns to reject */
const BLOCKED_PATH_PATTERNS = [
  /\/search\?/,        // Search result pages
  /\/login/i,          // Login pages
  /\/register/i,       // Registration pages
  /\/auth\//i,         // Auth flows
  /\/404/,             // Error pages
  /\/robots\.txt/,     // Robots files
  /\.pdf$/i,           // PDF files (can't DOM-extract)
  /\.xlsx?$/i,         // Excel files
  /\.docx?$/i,         // Word docs
  /\.zip$/i,           // Archive files
];

/** Supported URL protocols */
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

// ===== PUBLIC API =====

/**
 * Validate a single URL candidate for content extraction.
 *
 * @param {string} url - URL to validate
 * @param {Object} [options]
 * @param {boolean} [options.strictDomainMode=false] - Only allow trustedDomains
 * @param {string[]} [options.trustedDomains] - Trusted domain list
 * @returns {{ valid: boolean, reason?: string, domain: string, isTrusted: boolean }}
 */
export function validateUrlCandidate(url, options = {}) {
  const { strictDomainMode = false, trustedDomains = DEFAULT_TRUSTED_DOMAINS } = options;

  // Basic URL parse
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'invalid_url', domain: '', isTrusted: false };
  }

  const domain = parsed.hostname.replace(/^www\./, '');

  // Protocol check
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, reason: 'unsupported_protocol', domain, isTrusted: false };
  }

  // Blocked domain check
  if (BLOCKED_DOMAINS.some(bd => domain === bd || domain.endsWith('.' + bd))) {
    return { valid: false, reason: 'blocked_domain', domain, isTrusted: false };
  }

  // Blocked path pattern check
  const fullPath = parsed.pathname + parsed.search;
  if (BLOCKED_PATH_PATTERNS.some(pattern => pattern.test(fullPath))) {
    return { valid: false, reason: 'blocked_path', domain, isTrusted: false };
  }

  // Trusted domain check
  const isTrusted = trustedDomains.some(td => domain === td || domain.endsWith('.' + td));

  // Strict mode: only allow trusted domains
  if (strictDomainMode && !isTrusted) {
    return { valid: false, reason: 'not_in_allowed_domains', domain, isTrusted: false };
  }

  return { valid: true, domain, isTrusted };
}

/**
 * Filter and rank URL candidates from search results.
 * Returns only valid URLs, sorted by trust then original rank.
 *
 * @param {Array<{url: string, title?: string, score?: number}>} candidates
 * @param {Object} [options]
 * @param {number} [options.maxUrls=5] - Maximum URLs to return
 * @param {boolean} [options.strictDomainMode=false]
 * @param {string[]} [options.trustedDomains]
 * @returns {Array<{url: string, title: string, domain: string, isTrusted: boolean, rank: number}>}
 */
export function filterAndRankCandidates(candidates, options = {}) {
  const { maxUrls = 5, strictDomainMode = false, trustedDomains } = options;

  const validated = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const result = validateUrlCandidate(candidate.url, { strictDomainMode, trustedDomains });

    if (result.valid) {
      validated.push({
        url: candidate.url,
        title: candidate.title || '',
        domain: result.domain,
        isTrusted: result.isTrusted,
        originalRank: i,
        score: candidate.score || 0,
      });
    } else {
      logger.debug('URL rejected', { url: candidate.url, reason: result.reason });
    }
  }

  // Sort: trusted first, then by original score/rank
  validated.sort((a, b) => {
    if (a.isTrusted !== b.isTrusted) return a.isTrusted ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.originalRank - b.originalRank;
  });

  return validated.slice(0, maxUrls).map((item, i) => ({
    url: item.url,
    title: item.title,
    domain: item.domain,
    isTrusted: item.isTrusted,
    rank: i + 1,
  }));
}
