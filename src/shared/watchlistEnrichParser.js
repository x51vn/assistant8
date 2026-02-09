/**
 * @fileoverview Watchlist AI Enrichment JSON Parser & Validator
 * Parses ChatGPT JSON-only responses and validates enrichment items
 *
 * Supports:
 * 1. Pure JSON response → parse directly
 * 2. Code-fenced JSON (```json ... ```) → strip fence, parse inner
 * 3. Any other text → reject as INVALID_JSON_OUTPUT
 *
 * Validation rules (from docs/WATCHLIST_AI_ENRICHMENT_FEATURE.md §5.2):
 * - Root must be object with items array
 * - symbol: string, trimmed uppercase, matches ^[A-Z0-9]{1,10}$
 * - entry/target/stoploss: number | null (string numbers allowed → parse)
 * - investment_thesis: string | null (max 600 chars)
 */

const SYMBOL_REGEX = /^[A-Z0-9]{1,10}$/;
const MAX_THESIS_LENGTH = 600;

/**
 * Parse a JSON-only response text from ChatGPT
 * Handles pure JSON and code-fenced JSON
 *
 * @param {string} text - Raw response text from ChatGPT
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
export function parseJsonOnlyResponse(text) {
  if (!text || typeof text !== 'string') {
    return { success: false, error: 'INVALID_JSON_OUTPUT' };
  }

  const trimmed = text.trim();

  // Attempt 1: Parse as pure JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { success: true, data: parsed };
    }
    // If parsed but not object, fall through to error
  } catch (_) {
    // Not pure JSON, try code fence
  }

  // Attempt 2: Extract JSON from code fence ```json ... ``` or ``` ... ```
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch && codeFenceMatch[1]) {
    try {
      const inner = codeFenceMatch[1].trim();
      const parsed = JSON.parse(inner);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { success: true, data: parsed };
      }
    } catch (_) {
      // Code fence content is not valid JSON
    }
  }

  // Failed both attempts
  return { success: false, error: 'INVALID_JSON_OUTPUT' };
}

/**
 * Parse a value that should be a number, allowing string representations
 * @param {*} value - Value to parse
 * @returns {number|null} - Parsed number or null
 */
function parseNumericField(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

/**
 * Validate and normalize enrichment items from parsed JSON
 *
 * @param {Object} payload - Parsed JSON object (should have { items: [...] })
 * @param {string[]} [allowedSymbols] - Optional list of symbols in watchlist (for filtering)
 * @returns {{ valid: Array, invalid: Array, asOf: string|null }}
 *
 * Each valid item: { symbol, entry, target, stoploss, investment_thesis }
 * Each invalid item: { symbol, reason }
 */
export function validateEnrichItems(payload, allowedSymbols = null) {
  const result = { valid: [], invalid: [], asOf: null };

  if (!payload || typeof payload !== 'object') {
    result.invalid.push({ symbol: null, reason: 'Root payload is not an object' });
    return result;
  }

  // Extract as_of date
  if (typeof payload.as_of === 'string') {
    result.asOf = payload.as_of;
  }

  // Validate items array
  const items = payload.items;
  if (!Array.isArray(items)) {
    result.invalid.push({ symbol: null, reason: 'Missing or invalid "items" array' });
    return result;
  }

  const allowedSet = allowedSymbols
    ? new Set(allowedSymbols.map(s => s.trim().toUpperCase()))
    : null;

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      result.invalid.push({ symbol: null, reason: 'Item is not an object' });
      continue;
    }

    // Validate symbol
    const rawSymbol = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : null;
    if (!rawSymbol || !SYMBOL_REGEX.test(rawSymbol)) {
      result.invalid.push({
        symbol: item.symbol || null,
        reason: `Invalid symbol format: "${item.symbol}"`
      });
      continue;
    }

    // Check against allowed symbols (if provided)
    if (allowedSet && !allowedSet.has(rawSymbol)) {
      result.invalid.push({
        symbol: rawSymbol,
        reason: `Symbol not in watchlist: "${rawSymbol}"`
      });
      continue;
    }

    // Parse numeric fields
    const entry = parseNumericField(item.entry);
    const target = parseNumericField(item.target);
    const stoploss = parseNumericField(item.stoploss);

    // Parse investment_thesis
    let investmentThesis = null;
    if (typeof item.investment_thesis === 'string') {
      const trimmed = item.investment_thesis.trim();
      investmentThesis = trimmed.length > 0
        ? trimmed.slice(0, MAX_THESIS_LENGTH)
        : null;
    }

    // Build valid item (only non-null fields will be used for update)
    result.valid.push({
      symbol: rawSymbol,
      entry,
      target,
      stoploss,
      investment_thesis: investmentThesis
    });
  }

  return result;
}
