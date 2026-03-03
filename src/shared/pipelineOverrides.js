/**
 * @fileoverview Pipeline Parameter Validation Engine
 * Ticket: XST-811 — Parameter override engine with validation
 *
 * Validates pipeline override parameters with:
 * - Range checking (maxSources 1-20, recencyWindowDays 1-90)
 * - Type validation (numbers, booleans, strings)
 * - Provider validation (must be in supported list)
 * - Real-time inline error messages (Vietnamese)
 *
 * Used by:
 * - StockResearchModal.jsx (Advanced Options panel)
 * - StockResearchSection.jsx (Settings page — already has inline validation)
 */

/** Supported LLM providers for validation */
const SUPPORTED_PROVIDERS = ['chatgpt', 'gemini', 'claude'];

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether all fields are valid
 * @property {Object<string, string>} errors - Field name → error message
 */

/**
 * Validate a single override field.
 * Returns error message string or null if valid.
 *
 * @param {string} field - Field name
 * @param {*} value - Field value
 * @returns {string|null} Error message or null
 */
export function validateOverrideField(field, value) {
  switch (field) {
    case 'maxSources': {
      if (value === undefined || value === '') return null; // Not set = OK
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) {
        return 'Số lượng nguồn phải là số nguyên';
      }
      if (num < 1 || num > 20) {
        return 'Số lượng nguồn phải từ 1 đến 20';
      }
      return null;
    }

    case 'recencyWindowDays': {
      if (value === undefined || value === '') return null;
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) {
        return 'Khung thời gian phải là số nguyên';
      }
      if (num < 1 || num > 90) {
        return 'Khung thời gian phải từ 1 đến 90 ngày';
      }
      return null;
    }

    case 'provider': {
      if (value === undefined || value === '') return null; // Use default
      if (!SUPPORTED_PROVIDERS.includes(value)) {
        return `Provider không hợp lệ. Chọn: ${SUPPORTED_PROVIDERS.join(', ')}`;
      }
      return null;
    }

    case 'strictValidation': {
      if (value === undefined) return null;
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return 'Giá trị phải là bật hoặc tắt';
      }
      return null;
    }

    case 'searchEnabled': {
      if (value === undefined) return null;
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return 'Giá trị phải là bật hoặc tắt';
      }
      return null;
    }

    default:
      return null; // Unknown fields are ignored
  }
}

/**
 * Validate all override fields at once.
 *
 * @param {Object} overrides - Override values to validate
 * @returns {ValidationResult} { valid, errors }
 */
export function validateOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return { valid: true, errors: {} };
  }

  const errors = {};

  for (const [field, value] of Object.entries(overrides)) {
    const error = validateOverrideField(field, value);
    if (error) {
      errors[field] = error;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Merge preset defaults with user overrides, applying type coercion.
 * Only override fields that are explicitly set (not undefined/empty).
 *
 * @param {Object} presetDefaults - Base params from preset
 * @param {Object} overrides - User overrides (may include empty strings)
 * @returns {Object} Merged config with proper types
 */
export function mergeOverrides(presetDefaults, overrides) {
  const merged = { ...presetDefaults };

  if (!overrides) return merged;

  if (overrides.maxSources !== undefined && overrides.maxSources !== '') {
    merged.maxSources = Number(overrides.maxSources);
  }
  if (overrides.recencyWindowDays !== undefined && overrides.recencyWindowDays !== '') {
    merged.recencyWindowDays = Number(overrides.recencyWindowDays);
  }
  if (overrides.strictValidation !== undefined) {
    merged.strictValidation = overrides.strictValidation === true || overrides.strictValidation === 'true';
  }
  if (overrides.searchEnabled !== undefined) {
    merged.searchEnabled = overrides.searchEnabled === true || overrides.searchEnabled === 'true';
  }
  if (overrides.provider && overrides.provider !== '') {
    merged.provider = overrides.provider;
  }

  return merged;
}

/**
 * Count how many overrides are active (differ from defaults).
 *
 * @param {Object} overrides - Current override values
 * @returns {number} Number of active overrides
 */
export function countActiveOverrides(overrides) {
  if (!overrides) return 0;
  let count = 0;
  for (const [, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== '' && value !== null) {
      count++;
    }
  }
  return count;
}

/**
 * Create empty overrides object (all fields undefined = use preset defaults).
 * @returns {Object}
 */
export function createEmptyOverrides() {
  return {
    maxSources: '',
    recencyWindowDays: '',
    strictValidation: undefined,
    searchEnabled: undefined,
    provider: '',
  };
}

export { SUPPORTED_PROVIDERS };
