import { createLogger } from '../../../logger.js';
import { parseJsonResponse } from '../../../shared/llm/parseJsonResponse.js';

const logger = createLogger('Handlers/WatchlistEnrich');

/**
 * Parse JSON from LLM response — delegates to the shared 12-strategy extractor.
 * Throws if no parseable JSON is found (callers rely on throw for error handling).
 *
 * @param {string} responseText
 * @returns {Object} parsed JSON object
 * @throws {Error} if extraction fails after all strategies
 */
export function parseJsonFromResponse(responseText) {
  const result = parseJsonResponse(responseText);
  if (!result.success) {
    throw new Error(`JSON extraction failed: ${result.error}`);
  }
  if (result.partial) {
    logger.warn('parseJsonFromResponse: used field-regex fallback (partial data)', {
      strategy: result.strategy,
      keys: Object.keys(result.data || {}),
    });
  } else {
    logger.debug('parseJsonFromResponse: success', { strategy: result.strategy });
  }
  return result.data;
}

/**
 * Check if response text contains parseable JSON content
 */
export function hasJsonContent(text) {
  if (!text) return false;
  return /[{\[]/.test(text);
}

/**
 * Extract enrichment item from parsed response
 * Handles both flat format and nested { items: [...] } format
 */
export function extractEnrichmentItem(parsed, symbol) {
  // Format 1: Flat object with entry/target/stoploss directly
  if ('entry' in parsed || 'target' in parsed || 'stoploss' in parsed || 'investment_thesis' in parsed) {
    return parsed;
  }

  // Format 2: { items: [{ symbol, entry, target, ... }] }
  if (Array.isArray(parsed.items) && parsed.items.length > 0) {
    // Find matching symbol or take first item
    const match = parsed.items.find(
      item => item.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    return match || parsed.items[0];
  }

  return null;
}

/**
 * Validate enrichment data has at least one field to update
 */
export function validateEnrichmentData(data) {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('entry' in data || 'target' in data || 'stoploss' in data || 'investment_thesis' in data)
  );
}
