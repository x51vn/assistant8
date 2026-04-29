/**
 * @fileoverview Stock Research Output Validator & Parser
 * Ticket: XST-798 — Structured Output JSON Validator & Parser
 *
 * Validates LLM output against the StockAnalysisOutput contract
 * defined in docs/specs/stock-research-message-schema.md §3.
 *
 * Supports:
 * 1. Pure JSON parsing
 * 2. Code-fenced JSON (```json ... ```) extraction
 * 3. Auto-correction of common LLM mistakes (enum casing, bounds clamping)
 * 4. Strict mode (all required fields) and partial mode (best-effort)
 *
 * Pattern: Follows watchlistEnrichParser.js parsing conventions
 */

import { parseJsonResponse } from '../llm/parseJsonResponse.js';

// ===== CONSTANTS =====

const SYMBOL_REGEX = /^[A-Z0-9]{1,10}$/;

const VALID_RECOMMENDATIONS = ['BUY', 'HOLD', 'SELL', 'WATCH'];

const VALID_TIME_HORIZONS = ['1w', '1m', '1-3m', '3-6m', '6-12m', '1y+'];

const VALID_CREDIBILITIES = ['high', 'medium', 'low'];

const REQUIRED_FIELDS = [
  'symbol',
  'recommendation',
  'confidence',
  'thesis',
  'risks',
  'supportingEvidence',
  'counterEvidence',
  'invalidConditions',
  'sources',
];

const MAX_ARRAY_ITEMS = 5;

const MAX_SOURCE_ITEMS = 10;

/**
 * Common LLM recommendation aliases → canonical value.
 * LLMs often output variations of the enum values.
 */
const RECOMMENDATION_ALIASES = {
  'STRONG_BUY': 'BUY',
  'STRONG BUY': 'BUY',
  'STRONG-BUY': 'BUY',
  'OUTPERFORM': 'BUY',
  'OVERWEIGHT': 'BUY',
  'ACCUMULATE': 'BUY',
  'MUA': 'BUY',
  'MUA MẠNH': 'BUY',
  'STRONG_SELL': 'SELL',
  'STRONG SELL': 'SELL',
  'STRONG-SELL': 'SELL',
  'UNDERPERFORM': 'SELL',
  'UNDERWEIGHT': 'SELL',
  'BÁN': 'SELL',
  'BÁN MẠNH': 'SELL',
  'NEUTRAL': 'HOLD',
  'MARKET_PERFORM': 'HOLD',
  'NẮM GIỮ': 'HOLD',
  'GIỮ': 'HOLD',
  'THEO DÕI': 'WATCH',
  'MONITOR': 'WATCH',
};

// ===== PUBLIC API =====

/**
 * Parse and validate raw LLM text output against StockAnalysisOutput schema.
 *
 * @param {string} rawText - Raw text response from LLM
 * @param {{ strict?: boolean }} [options] - Validation options
 * @param {boolean} [options.strict=true] - If true, all required fields must be present
 * @returns {ValidationResult}
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the output passes validation
 * @property {Object|null} data - Parsed and auto-corrected data (null if invalid in strict mode)
 * @property {string[]} errors - List of validation error messages
 * @property {string[]} warnings - List of auto-correction warnings
 * @property {boolean} autoCorrections - Whether any auto-corrections were applied
 */
export function validateStockResearchOutput(rawText, options = {}) {
  const { strict = true } = options;
  const errors = [];
  const warnings = [];
  let autoCorrections = false;

  // Step 1: Parse JSON from raw text
  const parseResult = extractJSON(rawText);
  if (!parseResult.success) {
    return {
      valid: false,
      data: null,
      errors: [parseResult.error],
      warnings: [],
      autoCorrections: false,
    };
  }

  if (parseResult.partial) {
    warnings.push(`JSON extracted via field-regex fallback (strategy: ${parseResult.strategy}) — data may be incomplete`);
    autoCorrections = true;
  }

  const raw = parseResult.data;

  // Step 2: Validate and auto-correct each field
  const data = {};

  // --- symbol (required) ---
  if (raw.symbol && typeof raw.symbol === 'string') {
    const sym = raw.symbol.trim().toUpperCase();
    if (SYMBOL_REGEX.test(sym)) {
      data.symbol = sym;
      if (sym !== raw.symbol) {
        warnings.push(`symbol auto-corrected: "${raw.symbol}" → "${sym}"`);
        autoCorrections = true;
      }
    } else {
      errors.push(`symbol "${raw.symbol}" does not match pattern ^[A-Z0-9]{1,10}$`);
    }
  } else {
    errors.push('Missing required field: symbol');
  }

  // --- recommendation (required) ---
  if (raw.recommendation !== undefined) {
    const rec = String(raw.recommendation).trim().toUpperCase();
    if (VALID_RECOMMENDATIONS.includes(rec)) {
      data.recommendation = rec;
    } else if (RECOMMENDATION_ALIASES[rec]) {
      data.recommendation = RECOMMENDATION_ALIASES[rec];
      warnings.push(`recommendation auto-corrected: "${raw.recommendation}" → "${data.recommendation}"`);
      autoCorrections = true;
    } else {
      errors.push(`recommendation "${raw.recommendation}" not in [${VALID_RECOMMENDATIONS.join(', ')}]`);
    }
  } else {
    errors.push('Missing required field: recommendation');
  }

  // --- confidence (required, 0-100) ---
  if (raw.confidence !== undefined) {
    const conf = Number(raw.confidence);
    if (!Number.isFinite(conf)) {
      errors.push(`confidence "${raw.confidence}" is not a valid number`);
    } else if (conf < 0 || conf > 100) {
      // Auto-clamp
      data.confidence = Math.max(0, Math.min(100, Math.round(conf)));
      warnings.push(`confidence clamped: ${conf} → ${data.confidence} (valid range 0-100)`);
      autoCorrections = true;
    } else {
      data.confidence = Math.round(conf);
    }
  } else {
    errors.push('Missing required field: confidence');
  }

  // --- targetPrice (optional, number >= 0) ---
  if (raw.targetPrice !== undefined && raw.targetPrice !== null) {
    const tp = parseNumericField(raw.targetPrice);
    if (tp !== null && tp >= 0) {
      data.targetPrice = tp;
    } else {
      warnings.push(`targetPrice "${raw.targetPrice}" invalid, ignored`);
    }
  } else if (raw.target_price !== undefined && raw.target_price !== null) {
    // snake_case fallback
    const tp = parseNumericField(raw.target_price);
    if (tp !== null && tp >= 0) {
      data.targetPrice = tp;
      autoCorrections = true;
      warnings.push('target_price auto-mapped to targetPrice');
    }
  }

  // --- stopLoss (optional, number >= 0) ---
  if (raw.stopLoss !== undefined && raw.stopLoss !== null) {
    const sl = parseNumericField(raw.stopLoss);
    if (sl !== null && sl >= 0) {
      data.stopLoss = sl;
    } else {
      warnings.push(`stopLoss "${raw.stopLoss}" invalid, ignored`);
    }
  } else if (raw.stop_loss !== undefined && raw.stop_loss !== null) {
    const sl = parseNumericField(raw.stop_loss);
    if (sl !== null && sl >= 0) {
      data.stopLoss = sl;
      autoCorrections = true;
      warnings.push('stop_loss auto-mapped to stopLoss');
    }
  }

  // --- timeHorizon (optional, enum) ---
  if (raw.timeHorizon !== undefined || raw.time_horizon !== undefined) {
    const th = String(raw.timeHorizon || raw.time_horizon).trim().toLowerCase();
    if (VALID_TIME_HORIZONS.includes(th)) {
      data.timeHorizon = th;
    } else {
      warnings.push(`timeHorizon "${th}" not recognized, ignored`);
    }
    if (raw.time_horizon !== undefined && raw.timeHorizon === undefined) {
      autoCorrections = true;
      warnings.push('time_horizon auto-mapped to timeHorizon');
    }
  }

  // --- thesis (required, string array, 1-5 items) ---
  const thesisResult = validateStringArray(raw.thesis, 'thesis', { minItems: 1, maxItems: MAX_ARRAY_ITEMS });
  if (thesisResult.valid) {
    data.thesis = thesisResult.items;
  } else {
    errors.push(...thesisResult.errors);
  }

  // --- risks (required, string array, 1-5 items) ---
  const risksResult = validateStringArray(raw.risks, 'risks', { minItems: 1, maxItems: MAX_ARRAY_ITEMS });
  if (risksResult.valid) {
    data.risks = risksResult.items;
  } else {
    errors.push(...risksResult.errors);
  }

  // --- catalysts (optional, string array, max 5) ---
  if (raw.catalysts !== undefined) {
    const catResult = validateStringArray(raw.catalysts, 'catalysts', { minItems: 0, maxItems: MAX_ARRAY_ITEMS });
    if (catResult.valid && catResult.items.length > 0) {
      data.catalysts = catResult.items;
    } else if (!catResult.valid) {
      warnings.push(...catResult.errors.map(e => `catalysts: ${e}`));
    }
  }

  // --- Explainable v2 fields ---
  // supportingEvidence (required, array<string>)
  const supportingEvidenceRaw = raw.supportingEvidence ?? raw.supporting_evidence;
  const supportingResult = supportingEvidenceRaw !== undefined
    ? validateStringArray(supportingEvidenceRaw, 'supportingEvidence', { minItems: 1, maxItems: MAX_ARRAY_ITEMS })
    : { valid: true, items: (data.thesis || []).slice(0, MAX_ARRAY_ITEMS), errors: [] };

  if (supportingResult.valid && supportingResult.items.length > 0) {
    data.supportingEvidence = supportingResult.items;
  } else {
    errors.push(...(supportingResult.errors || []));
  }
  if (supportingEvidenceRaw === undefined) {
    warnings.push('supportingEvidence missing, auto-mapped from thesis');
    autoCorrections = true;
  }
  if (raw.supporting_evidence !== undefined && raw.supportingEvidence === undefined) {
    warnings.push('supporting_evidence auto-mapped to supportingEvidence');
    autoCorrections = true;
  }

  // counterEvidence (required, array<string>)
  const counterEvidenceRaw = raw.counterEvidence ?? raw.counter_evidence;
  const counterResult = counterEvidenceRaw !== undefined
    ? validateStringArray(counterEvidenceRaw, 'counterEvidence', { minItems: 1, maxItems: MAX_ARRAY_ITEMS })
    : { valid: true, items: (data.risks || []).slice(0, MAX_ARRAY_ITEMS), errors: [] };

  if (counterResult.valid && counterResult.items.length > 0) {
    data.counterEvidence = counterResult.items;
  } else {
    errors.push(...(counterResult.errors || []));
  }
  if (counterEvidenceRaw === undefined) {
    warnings.push('counterEvidence missing, auto-mapped from risks');
    autoCorrections = true;
  }
  if (raw.counter_evidence !== undefined && raw.counterEvidence === undefined) {
    warnings.push('counter_evidence auto-mapped to counterEvidence');
    autoCorrections = true;
  }

  // invalidConditions (required, array<string>, allow fallback)
  const invalidConditionsRaw = raw.invalidConditions ?? raw.invalid_conditions;
  const invalidResult = invalidConditionsRaw !== undefined
    ? validateStringArray(invalidConditionsRaw, 'invalidConditions', { minItems: 1, maxItems: MAX_ARRAY_ITEMS })
    : { valid: true, items: (data.risks || []).slice(0, MAX_ARRAY_ITEMS), errors: [] };

  if (invalidResult.valid && invalidResult.items.length > 0) {
    data.invalidConditions = invalidResult.items;
  } else {
    errors.push(...(invalidResult.errors || []));
  }
  if (invalidConditionsRaw === undefined) {
    warnings.push('invalidConditions missing, auto-mapped from risks');
    autoCorrections = true;
  }
  if (raw.invalid_conditions !== undefined && raw.invalidConditions === undefined) {
    warnings.push('invalid_conditions auto-mapped to invalidConditions');
    autoCorrections = true;
  }

  // --- sources (optional, array of {url, reason, credibility?}) ---
  if (raw.sources !== undefined) {
    const sourcesResult = validateSources(raw.sources);
    data.sources = sourcesResult.items;
    if (sourcesResult.warnings.length > 0) {
      warnings.push(...sourcesResult.warnings);
    }
  } else {
    data.sources = [];
    warnings.push('sources missing, defaulted to empty array');
    autoCorrections = true;
  }

  // Step 3: Determine validity
  const missingRequired = REQUIRED_FIELDS.filter(f => !(f in data));

  if (strict) {
    if (missingRequired.length > 0) {
      return {
        valid: false,
        data: null,
        errors: [...errors, ...missingRequired.map(f => `Missing required field: ${f}`)],
        warnings,
        autoCorrections,
      };
    }
    if (errors.length > 0) {
      return { valid: false, data: null, errors, warnings, autoCorrections };
    }
    return { valid: true, data, errors: [], warnings, autoCorrections };
  }

  // Partial mode: return whatever we could parse
  return {
    valid: errors.length === 0 && missingRequired.length === 0,
    data: Object.keys(data).length > 0 ? data : null,
    errors: [...errors, ...missingRequired.map(f => `Missing required field: ${f}`)],
    warnings,
    autoCorrections,
  };
}

// ===== INTERNAL HELPERS =====

/**
 * Extract JSON object from raw text.
 * Delegates to the shared 12-strategy parseJsonResponse utility
 * which handles code fences, control chars, web-search noise,
 * jsonrepair, and field-by-field regex fallback.
 *
 * @param {string} text
 * @returns {{ success: boolean, data?: Object, error?: string, partial?: boolean, strategy?: string }}
 */
export function extractJSON(text) {
  const result = parseJsonResponse(text);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return {
    success: true,
    data: result.data,
    partial: result.partial,
    strategy: result.strategy,
  };
}

/**
 * Parse a value that should be a number.
 * @param {*} value
 * @returns {number|null}
 */
function parseNumericField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Validate an array of strings.
 * @param {*} arr
 * @param {string} fieldName
 * @param {{ minItems?: number, maxItems?: number }} constraints
 * @returns {{ valid: boolean, items: string[], errors: string[] }}
 */
function validateStringArray(arr, fieldName, { minItems = 0, maxItems = 5 } = {}) {
  if (!Array.isArray(arr)) {
    if (minItems > 0) {
      return { valid: false, items: [], errors: [`${fieldName} must be an array`] };
    }
    return { valid: true, items: [], errors: [] };
  }

  const items = arr
    .filter(item => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, maxItems);

  if (items.length < minItems) {
    return {
      valid: false,
      items,
      errors: [`${fieldName} requires at least ${minItems} item(s), got ${items.length}`],
    };
  }

  return { valid: true, items, errors: [] };
}

/**
 * Validate sources array.
 * @param {*} sources
 * @returns {{ items: Object[], warnings: string[] }}
 */
function validateSources(sources) {
  const items = [];
  const warnings = [];

  if (!Array.isArray(sources)) {
    return { items: [], warnings: ['sources is not an array, ignored'] };
  }

  for (const src of sources.slice(0, MAX_SOURCE_ITEMS)) {
    if (!src || typeof src !== 'object') {
      warnings.push('Skipped non-object source entry');
      continue;
    }

    // url is required
    if (!src.url || typeof src.url !== 'string') {
      warnings.push('Skipped source without url');
      continue;
    }

    const item = {
      url: src.url.trim(),
      reason: typeof src.reason === 'string' ? src.reason.trim() : '',
    };

    // credibility (optional enum)
    if (src.credibility) {
      const cred = String(src.credibility).trim().toLowerCase();
      if (VALID_CREDIBILITIES.includes(cred)) {
        item.credibility = cred;
      } else {
        warnings.push(`Source credibility "${src.credibility}" not recognized, defaulting to "medium"`);
        item.credibility = 'medium';
      }
    }

    items.push(item);
  }

  return { items, warnings };
}
