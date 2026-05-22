/**
 * @fileoverview LLM Micro Tasks — Lightweight AI helpers for the agentic pipeline
 * Ticket: Agentic Web Research — Phase 3
 *
 * Wraps `llmClient.chat()` for small, focused AI operations:
 * - Keyword extraction
 * - Navigation / page-type detection
 * - DOM block classification
 * - Article summarization
 * - Text relevance classification
 *
 * Each function has a heuristic fallback when no API key is available.
 * Failure of a microtask never blocks the main pipeline.
 *
 * Stateless, MV3-safe.
 */

import { createLogger } from '../../../logger.js';
import { chat, getApiKey } from '../../../shared/llmClient.js';

const logger = createLogger('LlmMicroTasks');

// ===== INTERNAL HELPERS =====

/**
 * Check if LLM microtasks are available (API key exists).
 */
async function isLlmAvailable(options = {}) {
  try {
    const key = await getApiKey(options.provider || 'litellm', options);
    return !!key;
  } catch {
    return false;
  }
}

/**
 * Send a microtask prompt and parse JSON result.
 * Returns null on failure (caller should use heuristic fallback).
 */
async function llmJson(systemPrompt, userContent, options = {}) {
  const result = await chat(
    [{ role: 'user', content: userContent }],
    {
      systemPrompt,
      temperature: 0.2,
      maxTokens: options.maxTokens || 500,
      timeoutMs: options.timeoutMs || 20_000,
      maxRetries: 1,
      provider: options.provider || 'litellm',
      _readFromSupabase: options._readFromSupabase,
    }
  );

  if (!result.success || !result.data?.content) {
    return null;
  }

  // Extract JSON from response (may be wrapped in ```json ...```)
  const raw = result.data.content.trim();
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  try {
    return JSON.parse(jsonMatch[1].trim());
  } catch {
    logger.warn('Microtask JSON parse failed', { raw: raw.substring(0, 200) });
    return null;
  }
}

// ===== PUBLIC API =====

/**
 * Extract keywords for search query refinement.
 *
 * @param {Object} input
 * @param {string} input.symbol - Stock ticker
 * @param {string} [input.companyName]
 * @param {string[]} [input.headlines] - Fetched page titles
 * @param {Object} [options]
 * @returns {Promise<KeywordResult>}
 *
 * @typedef {Object} KeywordResult
 * @property {string[]} primary - Main keywords
 * @property {string[]} secondary - Supporting keywords
 * @property {string[]} negative - Keywords to exclude
 * @property {string[]} followUpQueries - Suggested refined queries
 */
export async function extractKeywords(input, options = {}) {
  const { symbol, companyName, headlines = [] } = input;

  if (await isLlmAvailable(options)) {
    const headlineText = headlines.length > 0
      ? `\n\nTiêu đề bài viết gần đây:\n${headlines.slice(0, 10).map(h => `- ${h}`).join('\n')}`
      : '';

    const result = await llmJson(
      'Bạn là trợ lý phân tích chứng khoán. Trích xuất keywords cho nghiên cứu cổ phiếu. Trả lời bằng JSON.',
      `Mã: ${symbol}${companyName ? ` (${companyName})` : ''}${headlineText}

Trả lời JSON:
{
  "primary": ["keyword1", "keyword2"],
  "secondary": ["keyword3"],
  "negative": ["keyword_to_exclude"],
  "followUpQueries": ["query gợi ý 1", "query gợi ý 2"]
}`,
      options,
    );

    if (result) return result;
  }

  // Heuristic fallback
  return heuristicKeywords(symbol, companyName, headlines);
}

/**
 * Detect the page type from text content.
 *
 * @param {string} textBlock - Page text or DOM fragment
 * @param {Object} [options]
 * @returns {Promise<NavigationResult>}
 *
 * @typedef {Object} NavigationResult
 * @property {string} pageType - 'article' | 'listing' | 'profile' | 'search' | 'navigation' | 'noise'
 * @property {boolean} isArticle - Whether this looks like article content
 */
export async function detectNavigation(textBlock, options = {}) {
  if (textBlock.length > 500 && await isLlmAvailable(options)) {
    const result = await llmJson(
      'Classify the page type from this text fragment. Respond with JSON only.',
      `Text (first 2000 chars):\n${textBlock.substring(0, 2000)}

JSON response:
{ "pageType": "article|listing|profile|search|navigation|noise", "isArticle": true/false }`,
      options,
    );

    if (result) return result;
  }

  // Heuristic fallback
  return heuristicPageType(textBlock);
}

/**
 * Summarize an article for the evidence pack.
 *
 * @param {string} text - Article text content
 * @param {string} symbol - Stock symbol for context
 * @param {Object} [options]
 * @returns {Promise<SummaryResult>}
 *
 * @typedef {Object} SummaryResult
 * @property {string} summary - Short summary (2-4 sentences)
 * @property {string[]} facts - Key facts extracted
 * @property {string[]} numbers - Financial numbers mentioned
 * @property {string[]} risks - Risk factors
 * @property {string[]} events - Key dates/events
 */
export async function summarizeArticle(text, symbol, options = {}) {
  if (text.length > 200 && await isLlmAvailable(options)) {
    const result = await llmJson(
      `Bạn là trợ lý phân tích chứng khoán chuyên tóm tắt bài viết. Tóm tắt nội dung liên quan đến mã ${symbol}. Trả lời bằng JSON.`,
      `Nội dung bài viết (tối đa 8000 ký tự):
${text.substring(0, 8000)}

Trả lời JSON:
{
  "summary": "tóm tắt 2-4 câu",
  "facts": ["sự kiện/thông tin 1", "..."],
  "numbers": ["con số tài chính 1", "..."],
  "risks": ["rủi ro 1", "..."],
  "events": ["ngày/sự kiện quan trọng 1", "..."]
}`,
      { ...options, maxTokens: 800 },
    );

    if (result) return result;
  }

  // Heuristic fallback
  return heuristicSummary(text, symbol);
}

/**
 * Classify article relevance to a stock symbol.
 *
 * @param {string} text - Article text
 * @param {string} symbol - Stock ticker
 * @param {Object} [options]
 * @returns {Promise<ClassificationResult>}
 *
 * @typedef {Object} ClassificationResult
 * @property {string} relevance - 'high' | 'medium' | 'low'
 * @property {string} category - 'company_specific' | 'sector' | 'macro' | 'rumor' | 'unrelated'
 */
export async function classifyArticle(text, symbol, options = {}) {
  if (text.length > 200 && await isLlmAvailable(options)) {
    const result = await llmJson(
      'Classify article relevance for stock analysis. Respond with JSON only.',
      `Symbol: ${symbol}
Text (first 3000 chars):
${text.substring(0, 3000)}

JSON response:
{ "relevance": "high|medium|low", "category": "company_specific|sector|macro|rumor|unrelated" }`,
      options,
    );

    if (result) return result;
  }

  // Heuristic fallback
  return heuristicClassify(text, symbol);
}

// ===== HEURISTIC FALLBACKS =====

function heuristicKeywords(symbol, companyName, headlines) {
  const primary = [symbol, `${symbol} cổ phiếu`];
  if (companyName) primary.push(companyName);

  const secondary = ['phân tích', 'đánh giá', 'kết quả kinh doanh'];
  const negative = ['tuyển dụng', 'bất động sản'];

  const year = new Date().getFullYear();
  const followUpQueries = [
    `${symbol} phân tích kỹ thuật ${year}`,
    `${symbol} kết quả kinh doanh quý`,
  ];

  return { primary, secondary, negative, followUpQueries };
}

function heuristicPageType(textBlock) {
  const text = textBlock.toLowerCase();
  const paragraphs = (textBlock.match(/\n\n/g) || []).length;
  const hasLongText = textBlock.length > 1000;

  if (paragraphs > 3 && hasLongText) {
    return { pageType: 'article', isArticle: true };
  }

  if (text.includes('danh sách') || text.includes('kết quả tìm') || text.includes('results for')) {
    return { pageType: 'listing', isArticle: false };
  }

  if (text.includes('đăng nhập') || text.includes('login') || text.includes('sign in')) {
    return { pageType: 'navigation', isArticle: false };
  }

  if (textBlock.length < 300) {
    return { pageType: 'noise', isArticle: false };
  }

  return { pageType: 'article', isArticle: hasLongText };
}

function heuristicSummary(text, symbol) {
  const symbolLower = symbol.toLowerCase();
  const sentences = text.split(/[.!?]\s+/).filter(s => s.trim().length > 20);

  // Find sentences mentioning the symbol
  const relevant = sentences.filter(s => s.toLowerCase().includes(symbolLower));
  const summary = relevant.length > 0
    ? relevant.slice(0, 3).join('. ') + '.'
    : sentences.slice(0, 3).join('. ') + '.';

  // Extract numbers (monetary/percentage)
  const numberPattern = /[\d,.]+\s*(%|tỷ|triệu|nghìn|VND|đồng|USD)/gi;
  const numbers = [...new Set((text.match(numberPattern) || []).slice(0, 10))];

  return {
    summary: summary.substring(0, 500),
    facts: [],
    numbers,
    risks: [],
    events: [],
  };
}

function heuristicClassify(text, symbol) {
  const textLower = text.toLowerCase();
  const symbolLower = symbol.toLowerCase();

  const mentionCount = (textLower.match(new RegExp(symbolLower, 'g')) || []).length;

  if (mentionCount >= 5) {
    return { relevance: 'high', category: 'company_specific' };
  }

  if (mentionCount >= 2) {
    return { relevance: 'medium', category: 'company_specific' };
  }

  // Check for sector/macro keywords
  const sectorKeywords = ['ngành', 'sector', 'thị trường', 'vnindex', 'vn-index'];
  const isSector = sectorKeywords.some(kw => textLower.includes(kw));
  if (isSector) {
    return { relevance: 'medium', category: 'sector' };
  }

  const macroKeywords = ['lãi suất', 'fed', 'gdp', 'lạm phát', 'tỷ giá'];
  const isMacro = macroKeywords.some(kw => textLower.includes(kw));
  if (isMacro) {
    return { relevance: 'low', category: 'macro' };
  }

  return { relevance: 'low', category: mentionCount > 0 ? 'sector' : 'unrelated' };
}
