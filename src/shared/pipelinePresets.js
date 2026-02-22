/**
 * @fileoverview Pipeline Mode Presets — Conservative / Balanced / Aggressive
 * Ticket: XST-810 — Define and manage pipeline mode presets
 *
 * Each preset configures a set of pipeline parameters:
 *  - maxSources: Number of search results to collect
 *  - recencyWindowDays: How far back to search
 *  - strictValidation: Whether AI output must match JSON schema exactly
 *  - trustedDomains: Comma-separated list of trusted news domains (empty = no filter)
 *
 * Presets are used by:
 *  - StockResearchSection.jsx (Settings UI — radio cards)
 *  - stockResearch handler (resolve preset → merge into options)
 *  - StockResearchModal.jsx (Advanced Options — detect custom mode)
 */

// ===== PRESET DEFINITIONS =====

/**
 * Pipeline mode presets with Vietnamese descriptions.
 * Order matters for UI rendering.
 */
export const PIPELINE_PRESETS = {
  conservative: {
    key: 'conservative',
    label: 'Thận trọng',
    description: 'Chỉ tin tưởng nguồn lớn, dữ liệu gần nhất. Phù hợp khi cần quyết định nhanh.',
    params: {
      maxSources: 5,
      recencyWindowDays: 7,
      strictValidation: true,
      trustedDomains: 'cafef.vn, vietstock.vn, vneconomy.vn',
    },
  },
  balanced: {
    key: 'balanced',
    label: 'Cân bằng',
    description: 'Cân bằng giữa số lượng nguồn và chất lượng. Phù hợp cho phân tích thường ngày.',
    params: {
      maxSources: 8,
      recencyWindowDays: 14,
      strictValidation: true,
      trustedDomains: 'cafef.vn, vietstock.vn, vneconomy.vn, fireant.vn, simplize.vn, tinnhanhchungkhoan.vn',
    },
  },
  aggressive: {
    key: 'aggressive',
    label: 'Tích cực',
    description: 'Thu thập nhiều nguồn nhất có thể, bao gồm cả nguồn mới/nhỏ. Phù hợp cho deep research.',
    params: {
      maxSources: 15,
      recencyWindowDays: 30,
      strictValidation: false,
      trustedDomains: '',
    },
  },
};

/** Default preset key */
export const DEFAULT_PRESET = 'balanced';

/** Ordered list of preset keys for UI rendering */
export const PRESET_ORDER = ['conservative', 'balanced', 'aggressive'];

// ===== PUBLIC API =====

/**
 * Get the parameter set for a given preset name.
 * Returns balanced defaults if preset name is unknown.
 *
 * @param {string} presetName - One of 'conservative', 'balanced', 'aggressive'
 * @returns {{ maxSources: number, recencyWindowDays: number, strictValidation: boolean, trustedDomains: string }}
 */
export function getPresetConfig(presetName) {
  const preset = PIPELINE_PRESETS[presetName];
  if (!preset) return { ...PIPELINE_PRESETS[DEFAULT_PRESET].params };
  return { ...preset.params };
}

/**
 * Get all presets as an ordered array for UI rendering.
 * Each item has: { key, label, description, params }
 *
 * @returns {Array<{ key: string, label: string, description: string, params: Object }>}
 */
export function getPresetsForUI() {
  return PRESET_ORDER.map(key => ({
    ...PIPELINE_PRESETS[key],
    params: { ...PIPELINE_PRESETS[key].params },
  }));
}

/**
 * Detect whether current settings match a known preset or are "custom".
 * Compares maxSources, recencyWindowDays, strictValidation, trustedDomains.
 *
 * @param {Object} currentConfig - Current parameter values
 * @param {number} currentConfig.maxSources
 * @param {number} currentConfig.recencyWindowDays
 * @param {boolean} currentConfig.strictValidation
 * @param {string} currentConfig.trustedDomains
 * @returns {string} Preset key ('conservative'|'balanced'|'aggressive') or 'custom'
 */
export function detectPresetMode(currentConfig) {
  if (!currentConfig) return DEFAULT_PRESET;

  for (const key of PRESET_ORDER) {
    const preset = PIPELINE_PRESETS[key].params;
    if (
      Number(currentConfig.maxSources) === preset.maxSources &&
      Number(currentConfig.recencyWindowDays) === preset.recencyWindowDays &&
      Boolean(currentConfig.strictValidation) === preset.strictValidation &&
      normalizeDomains(currentConfig.trustedDomains) === normalizeDomains(preset.trustedDomains)
    ) {
      return key;
    }
  }

  return 'custom';
}

/**
 * Resolve pipeline options by merging preset defaults with user overrides.
 * Priority: explicit options > preset params > balanced defaults
 *
 * @param {string} presetName - Preset key from settings
 * @param {Object} [overrides={}] - User-provided options that override preset
 * @returns {Object} Merged pipeline parameters
 */
export function resolvePresetOptions(presetName, overrides = {}) {
  const presetParams = getPresetConfig(presetName);
  const merged = { ...presetParams };

  // Apply overrides — only truthy or explicitly set values
  if (overrides.maxSources !== undefined) merged.maxSources = Number(overrides.maxSources);
  if (overrides.recencyWindowDays !== undefined) merged.recencyWindowDays = Number(overrides.recencyWindowDays);
  if (overrides.strictValidation !== undefined) merged.strictValidation = Boolean(overrides.strictValidation);
  if (overrides.trustedDomains !== undefined) merged.trustedDomains = overrides.trustedDomains;

  return merged;
}

// ===== HELPERS =====

/**
 * Normalize domains string for comparison: lowercase, sort, trim whitespace.
 * @param {string} domains - Comma-separated domains
 * @returns {string} Normalized string
 */
function normalizeDomains(domains) {
  if (!domains) return '';
  return domains
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
}
