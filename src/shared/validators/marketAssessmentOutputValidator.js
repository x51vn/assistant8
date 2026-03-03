/**
 * @fileoverview Market Assessment Output Validator
 * Validates LLM JSON output against the market assessment contract.
 *
 * Contract: 10 records, 2 distinct sectors, flat per-symbol model.
 * Supports AUTO (any sector) and CONSTRAINED (sectors from DB) modes.
 */

import { parseJsonResponse } from '../llm/parseJsonResponse.js';

const VALID_REGIME_STATES = ['ON', 'OFF'];
const VALID_SECTOR_TRENDS = ['UP', 'NEUTRAL', 'DOWN'];
const VALID_ACTIONS = ['BUY', 'HOLD', 'SELL', 'WATCH'];

// Vietnamese alias mapping for actions
const ACTION_ALIASES = {
  'MUA': 'BUY', 'MẠNH': 'BUY', 'TÍCH LŨY': 'BUY',
  'GIỮ': 'HOLD', 'NẮM GIỮ': 'HOLD', 'TRUNG LẬP': 'HOLD',
  'BÁN': 'SELL', 'GIẢM': 'SELL', 'THOÁT': 'SELL',
  'THEO DÕI': 'WATCH', 'CHỜ': 'WATCH', 'QUAN SÁT': 'WATCH'
};

const TREND_ALIASES = {
  'TĂNG': 'UP', 'LÊN': 'UP',
  'GIẢM': 'DOWN', 'XUỐNG': 'DOWN',
  'ĐI NGANG': 'NEUTRAL', 'TRUNG TÍNH': 'NEUTRAL', 'SIDEWAY': 'NEUTRAL'
};

/**
 * Validate market assessment LLM output
 *
 * @param {string} rawText - Raw LLM response text
 * @param {Object} options
 * @param {boolean} [options.strict=true] - Fail on any error
 * @param {string[]} [options.activeSectors] - Active sector names for CONSTRAINED mode
 * @param {number} [options.expectedRecords=10] - Expected number of records
 * @param {number} [options.expectedSectors=2] - Expected distinct sectors
 * @returns {{ valid: boolean, data: Object|null, errors: string[], warnings: string[], autoCorrections: string[] }}
 */
export function validateMarketAssessmentOutput(rawText, options = {}) {
  const {
    strict = true,
    activeSectors = [],
    expectedRecords = 10,
    expectedSectors = 2
  } = options;

  const result = {
    valid: false,
    data: null,
    errors: [],
    warnings: [],
    autoCorrections: []
  };

  // Step 1: Parse JSON
  let parsed;
  try {
    const parseResult = parseJsonResponse(rawText);
    if (!parseResult || (!parseResult.data && !parseResult)) {
      result.errors.push('Không thể parse JSON từ LLM response');
      return result;
    }
    parsed = parseResult.data || parseResult;
  } catch (e) {
    result.errors.push(`JSON parse error: ${e.message}`);
    return result;
  }

  // Step 2: Validate top-level structure
  if (!parsed || typeof parsed !== 'object') {
    result.errors.push('Output không phải object');
    return result;
  }

  // Auto-correct as_of_date
  let asOfDate = parsed.as_of_date;
  if (!asOfDate) {
    asOfDate = new Date().toISOString().split('T')[0];
    result.autoCorrections.push(`as_of_date missing, set to today: ${asOfDate}`);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    result.warnings.push(`as_of_date format invalid: ${asOfDate}`);
    asOfDate = new Date().toISOString().split('T')[0];
    result.autoCorrections.push(`as_of_date corrected to: ${asOfDate}`);
  }

  // Step 3: Validate records array
  const records = parsed.records;
  if (!Array.isArray(records)) {
    result.errors.push('Missing or invalid "records" array');
    return result;
  }

  if (records.length !== expectedRecords) {
    if (strict) {
      result.errors.push(`Expected ${expectedRecords} records, got ${records.length}`);
      return result;
    }
    result.warnings.push(`Expected ${expectedRecords} records, got ${records.length}`);
  }

  // Step 4: Validate each record
  const validatedRecords = [];
  const seenSymbols = new Set();
  const sectorNames = new Set();

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const recErrors = [];
    const recCorrections = [];

    if (!rec || typeof rec !== 'object') {
      result.errors.push(`Record ${i}: not an object`);
      continue;
    }

    // --- symbol ---
    let symbol = (rec.symbol || '').toString().toUpperCase().trim();
    if (!symbol || !/^[A-Z0-9]{1,10}$/.test(symbol)) {
      recErrors.push(`Record ${i}: invalid symbol "${rec.symbol}"`);
    }
    if (seenSymbols.has(symbol)) {
      recErrors.push(`Record ${i}: duplicate symbol "${symbol}"`);
    }
    seenSymbols.add(symbol);

    // --- sector_name ---
    const sectorName = (rec.sector_name || '').toString().trim();
    if (!sectorName) {
      recErrors.push(`Record ${i} (${symbol}): missing sector_name`);
    }
    sectorNames.add(sectorName);

    // --- market_regime_state ---
    let regimeState = (rec.market_regime_state || '').toString().toUpperCase().trim();
    if (!VALID_REGIME_STATES.includes(regimeState)) {
      // Try auto-correct
      if (['BẬT', 'MỞ', 'ACTIVE', 'YES', '1', 'TRUE'].includes(regimeState)) {
        regimeState = 'ON';
        recCorrections.push(`market_regime_state: "${rec.market_regime_state}" → "ON"`);
      } else if (['TẮT', 'ĐÓNG', 'INACTIVE', 'NO', '0', 'FALSE'].includes(regimeState)) {
        regimeState = 'OFF';
        recCorrections.push(`market_regime_state: "${rec.market_regime_state}" → "OFF"`);
      } else {
        recErrors.push(`Record ${i} (${symbol}): invalid market_regime_state "${rec.market_regime_state}"`);
      }
    }

    // --- market_regime_score ---
    let regimeScore = parseScore(rec.market_regime_score);
    if (regimeScore === null) {
      recErrors.push(`Record ${i} (${symbol}): invalid market_regime_score`);
    }

    // --- market_regime_explanation ---
    const regimeExplanation = (rec.market_regime_explanation || '').toString().trim();

    // --- sector_score ---
    let sectorScore = parseScore(rec.sector_score);
    if (sectorScore === null) {
      recErrors.push(`Record ${i} (${symbol}): invalid sector_score`);
    }

    // --- sector_trend ---
    let sectorTrend = (rec.sector_trend || '').toString().toUpperCase().trim();
    if (!VALID_SECTOR_TRENDS.includes(sectorTrend)) {
      const alias = TREND_ALIASES[sectorTrend];
      if (alias) {
        sectorTrend = alias;
        recCorrections.push(`sector_trend: "${rec.sector_trend}" → "${alias}"`);
      } else {
        recErrors.push(`Record ${i} (${symbol}): invalid sector_trend "${rec.sector_trend}"`);
      }
    }

    // --- sector_explanation ---
    const sectorExplanation = (rec.sector_explanation || '').toString().trim();

    // --- symbol_score ---
    let symbolScore = parseScore(rec.symbol_score);
    if (symbolScore === null) {
      recErrors.push(`Record ${i} (${symbol}): invalid symbol_score`);
    }

    // --- action ---
    let action = (rec.action || '').toString().toUpperCase().trim();
    if (!VALID_ACTIONS.includes(action)) {
      const alias = ACTION_ALIASES[action];
      if (alias) {
        action = alias;
        recCorrections.push(`action: "${rec.action}" → "${alias}"`);
      } else {
        recErrors.push(`Record ${i} (${symbol}): invalid action "${rec.action}"`);
      }
    }

    // --- symbol_explanation ---
    const symbolExplanation = (rec.symbol_explanation || '').toString().trim();

    // Collect errors for this record
    if (recErrors.length > 0) {
      result.errors.push(...recErrors);
      if (strict) continue; // skip this record in strict mode
    }

    result.autoCorrections.push(...recCorrections);

    validatedRecords.push({
      symbol,
      sector_name: sectorName,
      market_regime_state: regimeState,
      market_regime_score: regimeScore ?? 0,
      market_regime_explanation: regimeExplanation,
      sector_score: sectorScore ?? 0,
      sector_trend: sectorTrend,
      sector_explanation: sectorExplanation,
      symbol_score: symbolScore ?? 0,
      action,
      symbol_explanation: symbolExplanation,
      raw_record: rec
    });
  }

  // Step 5: Validate distinct sectors count
  if (strict && sectorNames.size !== expectedSectors) {
    result.errors.push(`Expected ${expectedSectors} distinct sectors, got ${sectorNames.size}: [${[...sectorNames].join(', ')}]`);
  } else if (sectorNames.size !== expectedSectors) {
    result.warnings.push(`Expected ${expectedSectors} distinct sectors, got ${sectorNames.size}`);
  }

  // Step 6: CONSTRAINED mode — validate against active sectors
  if (activeSectors.length > 0) {
    const activeSectorSet = new Set(activeSectors.map(s => s.toLowerCase()));
    for (const sn of sectorNames) {
      if (!activeSectorSet.has(sn.toLowerCase())) {
        result.errors.push(`Sector "${sn}" không nằm trong danh sách ngành active: [${activeSectors.join(', ')}]`);
      }
    }
  }

  // Final result
  if (result.errors.length > 0 && strict) {
    return result;
  }

  if (validatedRecords.length === 0) {
    result.errors.push('No valid records after validation');
    return result;
  }

  result.valid = true;
  result.data = {
    as_of_date: asOfDate,
    records: validatedRecords
  };

  return result;
}

/**
 * Build a corrective prompt for retry
 *
 * @param {string[]} errors - List of validation errors
 * @returns {string}
 */
export function buildCorrectivePrompt(errors) {
  return `Output JSON trước đó không hợp lệ. Lỗi:\n${errors.map(e => `- ${e}`).join('\n')}\n\nHãy trả lại JSON hợp lệ theo đúng contract. CHỈ JSON, KHÔNG markdown.`;
}

// ─── Internal helpers ───

function parseScore(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (isNaN(n)) return null;
  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, Math.round(n)));
}
