/**
 * Market Indices State - Preact Signals
 * Centralized reactive state for live stock market indices
 * Displays: VNI, VN30, HNX, UPCOM
 */

import { signal } from '@preact/signals';

// ===== MARKET INDICES DATA SIGNALS =====

/**
 * Array of market index objects
 * Structure: {
 *   symbol: string (e.g., 'VNI', 'VN30', 'HNX', 'UPCOM')
 *   name: string (display name)
 *   value: number (current index value)
 *   change: number (point change)
 *   changePercent: number (percent change)
 *   updatedAt: ISO timestamp
 * }
 */
export const marketIndices = signal([]);

// ===== UI STATE SIGNALS =====
export const indicesLoading = signal(false);
export const indicesError = signal(null);
export const lastIndicesUpdateTime = signal(null);

// ===== HELPER FUNCTIONS (Mutations) =====

/**
 * Set entire market indices array
 * @param {Array} indices - Array of index objects
 */
export function setMarketIndices(indices) {
  marketIndices.value = Array.isArray(indices) ? indices : [];
}

/**
 * Set loading state for indices
 * @param {boolean} isLoading
 */
export function updateIndicesLoading(isLoading) {
  indicesLoading.value = isLoading;
}

/**
 * Set error state for indices
 * @param {string|null} errorMsg
 */
export function setIndicesError(errorMsg) {
  indicesError.value = errorMsg || null;
}

/**
 * Clear error state
 */
export function clearIndicesError() {
  indicesError.value = null;
}

/**
 * Update last indices fetch timestamp
 * @param {string|number} timestamp - ISO timestamp or milliseconds
 */
export function setLastIndicesUpdateTime(timestamp) {
  lastIndicesUpdateTime.value = timestamp;
}

/**
 * Get human-readable time since last update
 * @returns {string} e.g., "1 min ago", "just now"
 */
export function getFormattedLastUpdateTime() {
  if (!lastIndicesUpdateTime.value) {
    return 'never';
  }

  const timestamp = typeof lastIndicesUpdateTime.value === 'string'
    ? new Date(lastIndicesUpdateTime.value).getTime()
    : lastIndicesUpdateTime.value;

  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} min ago`;
  } else {
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h ago`;
  }
}
