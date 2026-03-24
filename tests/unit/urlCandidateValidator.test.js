/**
 * @fileoverview Tests for URL Candidate Validator
 * Agentic Web Research — Phase 1
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import {
  validateUrlCandidate,
  filterAndRankCandidates,
} from '../../src/background/services/search/urlCandidateValidator.js';

// ===== validateUrlCandidate =====

describe('validateUrlCandidate', () => {
  it('accepts a valid HTTPS URL', () => {
    const res = validateUrlCandidate('https://cafef.vn/fpt-20250101.chn');
    expect(res.valid).toBe(true);
    expect(res.domain).toBe('cafef.vn');
    expect(res.isTrusted).toBe(true);
  });

  it('accepts HTTP URL', () => {
    const res = validateUrlCandidate('http://example.com/article');
    expect(res.valid).toBe(true);
  });

  it('rejects malformed URL', () => {
    const res = validateUrlCandidate('not-a-url');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('invalid_url');
  });

  it('rejects ftp protocol', () => {
    const res = validateUrlCandidate('ftp://files.example.com/data');
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('unsupported_protocol');
  });

  it('rejects Google domains', () => {
    for (const url of [
      'https://google.com/search?q=test',
      'https://www.google.com.vn/search',
      'https://translate.google.com/page',
      'https://webcache.googleusercontent.com/search',
    ]) {
      expect(validateUrlCandidate(url).valid).toBe(false);
    }
  });

  it('rejects social media domains', () => {
    for (const url of [
      'https://facebook.com/page',
      'https://twitter.com/user',
      'https://x.com/post',
      'https://instagram.com/p/abc',
      'https://tiktok.com/@user/video',
      'https://youtube.com/watch?v=abc',
    ]) {
      const res = validateUrlCandidate(url);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('blocked_domain');
    }
  });

  it('rejects blocked path patterns', () => {
    expect(validateUrlCandidate('https://cafef.vn/login').valid).toBe(false);
    expect(validateUrlCandidate('https://cafef.vn/report.pdf').valid).toBe(false);
    expect(validateUrlCandidate('https://cafef.vn/data.xlsx').valid).toBe(false);
    expect(validateUrlCandidate('https://example.com/auth/callback').valid).toBe(false);
  });

  it('marks trusted Vietnamese finance domains', () => {
    const trusted = validateUrlCandidate('https://vietstock.vn/article');
    expect(trusted.valid).toBe(true);
    expect(trusted.isTrusted).toBe(true);

    const untrusted = validateUrlCandidate('https://random-blog.com/article');
    expect(untrusted.valid).toBe(true);
    expect(untrusted.isTrusted).toBe(false);
  });

  it('strict domain mode rejects non-trusted', () => {
    const res = validateUrlCandidate('https://random.com/article', {
      strictDomainMode: true,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('not_in_allowed_domains');
  });

  it('strict domain mode accepts trusted', () => {
    const res = validateUrlCandidate('https://cafef.vn/fpt.html', {
      strictDomainMode: true,
    });
    expect(res.valid).toBe(true);
  });

  it('strips www. prefix for domain matching', () => {
    const res = validateUrlCandidate('https://www.cafef.vn/fpt.html');
    expect(res.domain).toBe('cafef.vn');
    expect(res.isTrusted).toBe(true);
  });

  it('supports custom trustedDomains', () => {
    const res = validateUrlCandidate('https://custom-site.vn/page', {
      trustedDomains: ['custom-site.vn'],
    });
    expect(res.valid).toBe(true);
    expect(res.isTrusted).toBe(true);
  });
});

// ===== filterAndRankCandidates =====

describe('filterAndRankCandidates', () => {
  const candidates = [
    { url: 'https://random-blog.com/post', title: 'Blog post' },
    { url: 'https://cafef.vn/fpt.html', title: 'CafeF FPT' },
    { url: 'https://google.com/search?q=test', title: 'Google' },
    { url: 'https://vietstock.vn/analysis', title: 'Vietstock' },
    { url: 'not-a-url', title: 'Bad' },
    { url: 'https://example.com/article', title: 'Example', score: 10 },
  ];

  it('filters out invalid URLs', () => {
    const result = filterAndRankCandidates(candidates);
    const urls = result.map(r => r.url);
    expect(urls).not.toContain('https://google.com/search?q=test');
    expect(urls).not.toContain('not-a-url');
  });

  it('sorts trusted domains first', () => {
    const result = filterAndRankCandidates(candidates);
    // cafef.vn and vietstock.vn are trusted, should appear first
    expect(result[0].isTrusted).toBe(true);
    expect(result[1].isTrusted).toBe(true);
  });

  it('respects maxUrls', () => {
    const result = filterAndRankCandidates(candidates, { maxUrls: 2 });
    expect(result).toHaveLength(2);
  });

  it('assigns sequential ranks starting from 1', () => {
    const result = filterAndRankCandidates(candidates);
    result.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
    });
  });

  it('returns empty array for empty input', () => {
    expect(filterAndRankCandidates([])).toEqual([]);
  });

  it('returns empty array when all candidates are invalid', () => {
    const bad = [
      { url: 'https://google.com/search?q=x', title: 'G' },
      { url: 'invalid', title: 'Bad' },
    ];
    expect(filterAndRankCandidates(bad)).toEqual([]);
  });
});
