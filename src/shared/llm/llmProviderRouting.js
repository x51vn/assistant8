/**
 * @fileoverview LLM Provider Routing — Feature-based provider selection
 * Ticket: XST-799 — LLM Provider Routing Standardization
 *
 * All providers use Web/DOM automation (no API keys required).
 * Routing selects which provider handles each feature independently.
 *
 * Enables different features to use different LLM providers.
 * Users can configure per-feature provider overrides in settings:
 *   settings.config.llm_provider = 'chatgpt'           // default
 *   settings.config.llm_provider_stock_research = 'gemini'  // override for stock research
 *   settings.config.llm_provider_watchlist_enrich = 'claude' // override for enrichment
 *
 * Usage:
 *   import { getProviderForFeature, FEATURE_TYPES } from './llmProviderRouting.js';
 *   const providerConfig = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, settingsConfig);
 */

import { ERROR_CODES } from '../errorCodes.js';

// ===== FEATURE TYPES =====

/**
 * Supported feature types for LLM routing.
 * Each feature can have an independent provider override.
 * @enum {string}
 */
export const FEATURE_TYPES = {
  CHAT: 'chat',
  STOCK_RESEARCH: 'stock-research',
  WATCHLIST_ENRICH: 'watchlist-enrich',
};

/**
 * Settings key suffix for per-feature provider override.
 * Full key = `llm_provider_${FEATURE_SETTINGS_KEY[feature]}`
 */
const FEATURE_SETTINGS_KEY = {
  [FEATURE_TYPES.CHAT]: null, // uses default llm_provider
  [FEATURE_TYPES.STOCK_RESEARCH]: 'stock_research',
  [FEATURE_TYPES.WATCHLIST_ENRICH]: 'watchlist_enrich',
};

/**
 * Default provider recommendations per feature.
 * Used when no per-feature override exists AND no global default is set.
 */
const FEATURE_DEFAULTS = {
  [FEATURE_TYPES.CHAT]: 'chatgpt',
  [FEATURE_TYPES.STOCK_RESEARCH]: 'chatgpt',
  [FEATURE_TYPES.WATCHLIST_ENRICH]: 'chatgpt',
};

// ===== PUBLIC API =====

/**
 * Resolve which LLM provider to use for a specific feature.
 *
 * Resolution order:
 * 1. Per-feature override: settings.config.llm_provider_<feature>
 * 2. Global default: settings.config.llm_provider
 * 3. Feature default: FEATURE_DEFAULTS[feature]
 *
 * @param {string} feature - Feature type from FEATURE_TYPES
 * @param {Object} settingsConfig - User's settings.config object
 * @returns {import('./LLMProviderFactory.js').ProviderConfig} Provider config
 */
export function getProviderForFeature(feature, settingsConfig = {}) {
  const config = settingsConfig || {};

  // 1. Check per-feature override
  const featureKey = FEATURE_SETTINGS_KEY[feature];
  let provider;

  if (featureKey) {
    provider = config[`llm_provider_${featureKey}`];
  }

  // 2. Fall back to global default
  if (!provider) {
    provider = config.llm_provider;
  }

  // 3. Fall back to feature default
  if (!provider) {
    provider = FEATURE_DEFAULTS[feature] || 'chatgpt';
  }

  return { provider };
}

/**
 * Map LLM-related errors to standardized ERROR_CODES.
 *
 * @param {Error} error - The error from LLM provider
 * @returns {{ errorCode: string, retryable: boolean }}
 */
export function classifyLLMError(error) {
  const message = error?.message?.toLowerCase() || '';
  const status = error?.status || error?.statusCode || 0;

  // Timeout
  if (message.includes('timeout') || message.includes('timed out') || status === 504) {
    return { errorCode: ERROR_CODES.LLM_TIMEOUT, retryable: true };
  }

  // Quota / rate limit
  if (message.includes('quota') || message.includes('rate limit') || status === 429) {
    return { errorCode: ERROR_CODES.LLM_QUOTA_EXCEEDED, retryable: false };
  }

  // Auth errors
  if (message.includes('unauthorized') || message.includes('api key') || status === 401 || status === 403) {
    return { errorCode: ERROR_CODES.AUTH_ERROR, retryable: false };
  }

  // Parse / validation
  if (message.includes('parse') || message.includes('json') || message.includes('format')) {
    return { errorCode: ERROR_CODES.PARSE_ERROR, retryable: true };
  }

  // General LLM error
  return { errorCode: ERROR_CODES.LLM_ERROR, retryable: true };
}

/**
 * Check if a feature type is valid.
 * @param {string} feature
 * @returns {boolean}
 */
export function isValidFeature(feature) {
  return Object.values(FEATURE_TYPES).includes(feature);
}
