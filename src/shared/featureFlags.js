/**
 * @fileoverview Feature Flags — Centralized feature flag definitions
 * Ticket: XST-800 — Feature flag stock_research_v2
 *
 * Feature flags are stored in Supabase `settings.config` (JSONB) per user.
 * Each flag has a key, default value, and description.
 *
 * Usage:
 *   import { FEATURE_FLAGS, getFeatureFlag } from './featureFlags.js';
 *
 *   // In handler:
 *   const config = await getUserSettingsConfig(userId);
 *   const enabled = getFeatureFlag('stock_research_v2', config);
 *
 * Storage:
 *   settings.config.stock_research_v2 = true/false
 *
 * UI: Toggle via SETTINGS_UPDATE message with { config: { stock_research_v2: true } }
 */

// ===== FEATURE FLAG DEFINITIONS =====

/**
 * All feature flags with their defaults and metadata.
 * @type {Object.<string, { default: boolean, description: string, ticket: string }>}
 */
export const FEATURE_FLAGS = {
  stock_research_v2: {
    default: false,
    description: 'Enable Stock Research Pipeline v2 (AI-powered analysis with Google Search)',
    ticket: 'XST-800',
  },
};

// ===== PUBLIC API =====

/**
 * Get the value of a feature flag from user settings config.
 * Returns the flag's default value if not explicitly set.
 *
 * @param {string} flagName - Feature flag name (key in FEATURE_FLAGS)
 * @param {Object} settingsConfig - User's settings.config object
 * @returns {boolean} Flag value
 */
export function getFeatureFlag(flagName, settingsConfig = {}) {
  const definition = FEATURE_FLAGS[flagName];
  if (!definition) {
    return false; // Unknown flag → disabled
  }

  const value = settingsConfig?.[flagName];
  if (typeof value === 'boolean') {
    return value;
  }

  return definition.default;
}

/**
 * Get all feature flags with their current values for a user.
 * Useful for the settings UI to display toggles.
 *
 * @param {Object} settingsConfig - User's settings.config object
 * @returns {Object.<string, { enabled: boolean, description: string, ticket: string }>}
 */
export function getAllFeatureFlags(settingsConfig = {}) {
  const result = {};

  for (const [key, def] of Object.entries(FEATURE_FLAGS)) {
    result[key] = {
      enabled: getFeatureFlag(key, settingsConfig),
      description: def.description,
      ticket: def.ticket,
    };
  }

  return result;
}

/**
 * Check if a feature flag key is known/defined.
 * @param {string} flagName
 * @returns {boolean}
 */
export function isKnownFlag(flagName) {
  return flagName in FEATURE_FLAGS;
}
