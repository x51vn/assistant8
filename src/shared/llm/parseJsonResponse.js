/**
 * @fileoverview Robust JSON extraction from LLM responses.
 *
 * LLM providers (ChatGPT, Gemini, Claude) can return text that wraps JSON in:
 *   - Markdown code fences  ```json … ``` or ``` … ```
 *   - Prose preamble / postamble ("Here is the result:\n{…}")
 *   - Web-search noise lines (site names, "+N" badges)
 *   - Literal control characters (0x00-0x1F) inside string values
 *   - Trailing commas, unquoted keys, truncated strings (jsonrepair handles these)
 *
 * Resolution cascade (stops at first success):
 *   1.  Direct JSON.parse on trimmed text
 *   2.  Code-fence extraction → JSON.parse
 *   3.  jsonrepair on full text → JSON.parse
 *   4.  Strip web-search noise → JSON.parse
 *   5.  Strip web-search noise → jsonrepair → JSON.parse
 *   6.  Greedy { … } extraction → JSON.parse
 *   7.  Greedy { … } extraction → jsonrepair → JSON.parse
 *   8.  Control-char sanitize → JSON.parse
 *   9.  Control-char sanitize → jsonrepair → JSON.parse
 *   10. Code-fence extraction → control-char sanitize → jsonrepair → JSON.parse
 *   11. Greedy [ … ] array extraction → jsonrepair → JSON.parse
 *   12. Field-by-field regex extraction (partial data, last resort)
 *
 * @module parseJsonResponse
 */

import { jsonrepair } from 'jsonrepair';

// ─── Web-search noise removal ────────────────────────────────────────────────

/**
 * Strip web-search noise injected by ChatGPT / Bing-grounding responses.
 * Removes: "+N" badge lines, standalone domain/site-name lines, known
 * Vietnamese financial site labels, and other non-content noise.
 *
 * @param {string} text
 * @returns {string}
 */
function stripWebSearchNoise(text) {
  if (!text) return '';
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      // "+2", "+5" type badges
      if (/^\+\d{1,2}$/.test(t)) return false;
      // Bare domain names like "cafef.vn" or "Investing.com Việt Nam"
      if (
        /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(\s.*)?$/.test(t) &&
        !t.includes('{') && !t.includes('[') && !t.includes(':')
      ) return false;
      // Known Vietnamese financial/news site labels (without TLD in text)
      if (/^(Chứng khoán|Investing|CafeF|VnExpress|Báo|Tin tức|Tài chính|VietStock|SSI|TCBS|StockBiz|Nhịp cầu đầu tư|Người đồng hành|Forbes|Bloomberg|Reuters)\b/i.test(t) &&
        !t.includes('{') && !t.includes('[') && t.length < 80
      ) return false;
      // Lines that are ONLY a short label (≤40 chars, no JSON markers)
      // typical of web-search source cards
      if (t.length <= 40 && !t.includes('{') && !t.includes('[') && !t.includes(':') &&
          !/\d{2,}/.test(t) && !/["']/.test(t)
      ) return false;
      return true;
    })
    .join('\n');
}

/**
 * Detect whether a response is made entirely of web-search noise
 * (no JSON-like content whatsoever after stripping).
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isNoiseOnlyResponse(text) {
  if (!text || typeof text !== 'string') return true;
  const stripped = stripWebSearchNoise(text);
  // After removing noise, check if any JSON-like chars remain
  return !stripped || !/[{\[]/.test(stripped);
}

// ─── Control-character sanitizer ─────────────────────────────────────────────

/**
 * Replace raw control chars (0x00-0x1F) inside JSON string literals with spaces.
 * Structural whitespace (newlines between tokens) is preserved.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitizeControlChars(raw) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const code = raw.charCodeAt(i);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString && code < 0x20) {
      // Replace control char with a space in string values
      result += ' ';
      continue;
    }
    result += ch;
  }
  return result;
}

// ─── Single-attempt parse helpers ────────────────────────────────────────────

/**
 * If value is an array of mixed content (strings + objects), extract the first
 * non-trivial object. This handles the common jsonrepair artefact where prose
 * around JSON becomes: ["Here is the result:", {…}, "That is all."]
 *
 * @param {*} v
 * @returns {Object|null}
 */
function unwrapMixedArray(v) {
  if (!Array.isArray(v)) return null;
  for (const item of v) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length > 0) {
      return item;
    }
  }
  return null;
}

function tryParse(text) {
  try {
    const v = JSON.parse(text);
    if (v !== null && typeof v === 'object') {
      // If it's a plain object, great
      if (!Array.isArray(v)) return { ok: true, data: v };
      // If it's a "clean" array (no mixed prose), return as-is
      // A clean array = all elements are the same type or all objects
      const hasObjects = v.some(i => i !== null && typeof i === 'object');
      const hasStrings = v.some(i => typeof i === 'string');
      if (hasObjects && hasStrings) {
        // Mixed array — likely jsonrepair artefact; extract first object
        const extracted = unwrapMixedArray(v);
        if (extracted) return { ok: true, data: extracted };
      }
      return { ok: true, data: v };
    }
  } catch { /* fall through */ }
  return { ok: false };
}

function tryRepairAndParse(text) {
  try {
    const repaired = jsonrepair(text);
    const v = JSON.parse(repaired);
    if (v !== null && typeof v === 'object') {
      if (!Array.isArray(v)) return { ok: true, data: v };
      // Handle mixed arrays from jsonrepair wrapping prose + JSON together
      const hasObjects = v.some(i => i !== null && typeof i === 'object');
      const hasStrings = v.some(i => typeof i === 'string');
      if (hasObjects && hasStrings) {
        const extracted = unwrapMixedArray(v);
        if (extracted) return { ok: true, data: extracted };
      }
      // Reject arrays of pure strings — they're prose, not useful data
      if (!hasObjects) return { ok: false };
      return { ok: true, data: v };
    }
  } catch { /* fall through */ }
  return { ok: false };
}

// ─── Extract JSON-looking substrings ─────────────────────────────────────────

/**
 * Pull the broadest `{ … }` span from text (first brace to last brace).
 * @param {string} text
 * @returns {string|null}
 */
function extractObjectSpan(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

/**
 * Pull the broadest `[ … ]` span from text.
 * @param {string} text
 * @returns {string|null}
 */
function extractArraySpan(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

/**
 * Extract content from the first markdown code fence (``` or ```json).
 * @param {string} text
 * @returns {string|null}
 */
function extractCodeFence(text) {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return m ? m[1].trim() : null;
}

// ─── Last-resort field regex extractor ───────────────────────────────────────

/**
 * When JSON is too broken to repair, extract individual key:"value" pairs using
 * loose regex. Returns a partial object — callers should mark this as degraded.
 *
 * @param {string} text
 * @returns {{ ok: boolean, data: object|null, partial: boolean }}
 */
function extractFieldsViaRegex(text) {
  const obj = {};

  // Match "key": "string value" or "key": number/bool/null
  const strPattern = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const numPattern = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const boolPattern = /"([^"]+)"\s*:\s*(true|false|null)/g;

  let m;
  while ((m = strPattern.exec(text)) !== null) obj[m[1]] = m[2];
  while ((m = numPattern.exec(text)) !== null) {
    if (!(m[1] in obj)) obj[m[1]] = Number(m[2]);
  }
  while ((m = boolPattern.exec(text)) !== null) {
    if (!(m[1] in obj)) {
      obj[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : null;
    }
  }

  if (Object.keys(obj).length > 0) return { ok: true, data: obj, partial: true };
  return { ok: false, data: null, partial: false };
}

// ─── Last-resort: prose-based financial field extractor ──────────────────────

/**
 * NUMBER_PATTERN matches Vietnamese-style numbers: 42000, 42.000, 42,000, 42000đ
 * Returns the raw numeric value (strips separators and currency suffixes).
 */
const NUM_RX = /[\d][.\d,]*\d/;

/**
 * Parse a Vietnamese-style number string: "42.000" → 42000, "50,500" → 50500
 * @param {string} raw
 * @returns {number|null}
 */
function parseVietnameseNumber(raw) {
  if (!raw) return null;
  let cleaned = raw.replace(/[đ₫VND\s]/gi, '');

  // Vietnamese convention: dot = thousands separator (42.000 = 42000)
  // If there's a dot and the part after the last dot is exactly 3 digits, treat dots as thousands sep
  const dotParts = cleaned.split('.');
  if (dotParts.length > 1 && dotParts[dotParts.length - 1].length === 3) {
    cleaned = cleaned.replace(/\./g, '');
  }

  // Comma can be thousands separator too (42,000)
  const commaParts = cleaned.split(',');
  if (commaParts.length > 1 && commaParts[commaParts.length - 1].length === 3) {
    cleaned = cleaned.replace(/,/g, '');
  }

  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Extract entry/target/stoploss and investment_thesis from prose text
 * using Vietnamese and English keyword patterns.
 *
 * Handles patterns like:
 *   - "Entry: 42,000đ"       / "Giá mua vào: 42.000"
 *   - "Target: 50000"        / "Mục tiêu: 50,000 VND"
 *   - "Stoploss: 38000"      / "Cắt lỗ: 38.000đ"
 *   - "Luận điểm đầu tư: …" / "Investment thesis: …"
 *
 * @param {string} text
 * @returns {{ ok: boolean, data: object|null, partial: boolean }}
 */
export function extractFinancialFieldsFromProse(text) {
  if (!text || typeof text !== 'string') return { ok: false, data: null, partial: false };

  const obj = {};

  // ── Entry price ──
  const entryPatterns = [
    /(?:entry|giá\s*(?:mua|vào|entry)|điểm\s*mua|mua\s*vào|giá\s*khuyến\s*nghị)\s*[:=]?\s*([\d][.\d,]*\d)\s*[đ₫]?/i,
    /(?:entry\s*(?:price|point))\s*[:=]?\s*([\d][.\d,]*\d)/i,
  ];
  for (const pat of entryPatterns) {
    const m = text.match(pat);
    if (m) { obj.entry = parseVietnameseNumber(m[1]); break; }
  }

  // ── Target price ──
  const targetPatterns = [
    /(?:target|mục\s*tiêu|giá\s*(?:mục\s*tiêu|target|kỳ\s*vọng)|tp)\s*[:=]?\s*([\d][.\d,]*\d)\s*[đ₫]?/i,
    /(?:target\s*(?:price|point))\s*[:=]?\s*([\d][.\d,]*\d)/i,
  ];
  for (const pat of targetPatterns) {
    const m = text.match(pat);
    if (m) { obj.target = parseVietnameseNumber(m[1]); break; }
  }

  // ── Stoploss ──
  const stoplossPatterns = [
    /(?:stop\s*loss|stoploss|cắt\s*lỗ|sl|giá\s*(?:cắt\s*lỗ|stop))\s*[:=]?\s*([\d][.\d,]*\d)\s*[đ₫]?/i,
  ];
  for (const pat of stoplossPatterns) {
    const m = text.match(pat);
    if (m) { obj.stoploss = parseVietnameseNumber(m[1]); break; }
  }

  // ── Investment thesis (grab the sentence/paragraph after the label) ──
  const thesisPatterns = [
    /(?:investment[\s_]*thesis|luận\s*điểm(?:\s*đầu\s*tư)?|nhận\s*định|đánh\s*giá\s*chung)\s*[:=]\s*(.+)/i,
  ];
  for (const pat of thesisPatterns) {
    const m = text.match(pat);
    if (m) {
      // Take up to 500 chars, trim at sentence boundary if possible
      let thesis = m[1].trim().substring(0, 500);
      const sentenceEnd = thesis.search(/[.!?]\s/);
      if (sentenceEnd > 20) thesis = thesis.substring(0, sentenceEnd + 1);
      obj.investment_thesis = thesis;
      break;
    }
  }

  // Remove null values
  for (const k of Object.keys(obj)) {
    if (obj[k] === null || obj[k] === undefined) delete obj[k];
  }

  if (Object.keys(obj).length > 0) return { ok: true, data: obj, partial: true };
  return { ok: false, data: null, partial: false };
}

// ─── Main public API ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} ParseResult
 * @property {boolean} success     - Whether any JSON was extracted
 * @property {Object|null} data    - Parsed object (may be partial)
 * @property {boolean} partial     - True when data was assembled via regex (last resort)
 * @property {string} strategy     - Name of the strategy that succeeded
 * @property {string|null} error   - Error description when success=false
 * @property {string} rawText      - The original input text (for debugging)
 */

/**
 * Extract and parse a JSON object from an LLM response string.
 *
 * Tries up to 13 escalating strategies before giving up.
 *
 * @param {string} rawText - Full text response from the LLM
 * @returns {ParseResult}
 */
export function parseJsonResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, data: null, partial: false, strategy: 'none', error: 'Empty or non-string input', rawText: String(rawText ?? '') };
  }

  const t = rawText.trim();

  // ── Strategy 1: Direct parse ──────────────────────────────────────────────
  {
    const r = tryParse(t);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'direct-parse', error: null, rawText };
  }

  // ── Strategy 2: Code fence ────────────────────────────────────────────────
  {
    const fenced = extractCodeFence(t);
    if (fenced) {
      const r = tryParse(fenced);
      if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'code-fence', error: null, rawText };
    }
  }

  // ── Strategy 3: jsonrepair on full text ───────────────────────────────────
  {
    const r = tryRepairAndParse(t);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'repair-full', error: null, rawText };
  }

  // ── Strategy 4: Strip noise → parse ──────────────────────────────────────
  const noisy = stripWebSearchNoise(t);
  if (noisy !== t) {
    const r = tryParse(noisy);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'strip-noise', error: null, rawText };
  }

  // ── Strategy 5: Strip noise → repair ─────────────────────────────────────
  {
    const r = tryRepairAndParse(noisy);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'strip-noise+repair', error: null, rawText };
  }

  // ── Strategy 6: Greedy { } → parse ───────────────────────────────────────
  const objSpan = extractObjectSpan(noisy) || extractObjectSpan(t);
  if (objSpan) {
    const r = tryParse(objSpan);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'object-span', error: null, rawText };
  }

  // ── Strategy 7: Greedy { } → repair ──────────────────────────────────────
  if (objSpan) {
    const r = tryRepairAndParse(objSpan);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'object-span+repair', error: null, rawText };
  }

  // ── Strategy 8: Control-char sanitize → parse ────────────────────────────
  const sanitized = sanitizeControlChars(t);
  if (sanitized !== t) {
    const r = tryParse(sanitized);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'sanitize', error: null, rawText };
  }

  // ── Strategy 9: Sanitize → repair ────────────────────────────────────────
  {
    const r = tryRepairAndParse(sanitized);
    if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'sanitize+repair', error: null, rawText };
  }

  // ── Strategy 10: Code fence → sanitize → repair ───────────────────────────
  {
    const fenced = extractCodeFence(t);
    if (fenced) {
      const r = tryRepairAndParse(sanitizeControlChars(fenced));
      if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'code-fence+sanitize+repair', error: null, rawText };
    }
  }

  // ── Strategy 11: Greedy [ ] array → repair ──────────────────────────────
  {
    const arrSpan = extractArraySpan(noisy) || extractArraySpan(t);
    if (arrSpan) {
      const r = tryRepairAndParse(arrSpan);
      if (r.ok) return { success: true, data: r.data, partial: false, strategy: 'array-span+repair', error: null, rawText };
    }
  }

  // ── Strategy 12: Field-by-field regex (partial, last resort) ─────────────
  {
    const r = extractFieldsViaRegex(t);
    if (r.ok) {
      return { success: true, data: r.data, partial: true, strategy: 'field-regex', error: null, rawText };
    }
  }

  // ── Strategy 13: Prose-based financial field extraction (entry/target/stoploss) ──
  {
    const r = extractFinancialFieldsFromProse(t);
    if (r.ok) {
      return { success: true, data: r.data, partial: true, strategy: 'prose-financial', error: null, rawText };
    }
  }

  return {
    success: false,
    data: null,
    partial: false,
    strategy: 'none',
    error: 'No valid JSON found after 13 extraction strategies',
    rawText,
  };
}

/**
 * Convenience wrapper that extracts a JSON *object* (not array) — mirrors the
 * old `extractJSON()` signature used by stockResearchOutputValidator.
 *
 * @param {string} text
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
export function extractJSON(text) {
  const result = parseJsonResponse(text);
  if (!result.success) return { success: false, error: result.error };

  // Unwrap common envelope shapes: { items: [...] }, [{ … }]
  let data = result.data;

  // If we got an array back (from strategy 11), return as-is — callers can handle
  if (Array.isArray(data)) {
    return { success: true, data };
  }

  return { success: true, data };
}
