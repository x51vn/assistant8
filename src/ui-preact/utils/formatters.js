/**
 * Shared formatters for UI components.
 * Consolidates duplicate formatCurrency/formatPercent across components.
 *
 * @module ui-preact/utils/formatters
 */

/**
 * Format number as Vietnamese currency with symbol.
 * @param {number|null|undefined} value
 * @param {string} currency - Currency code (default: 'VND')
 * @returns {string} Formatted currency string or '-'
 */
export function formatCurrency(value, currency = 'VND') {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return '-';
  if (typeof value !== 'number') return '-';

  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === 'VND' ? 0 : 2
  }).format(value);
}

/**
 * Format number without currency symbol.
 * Used for watchlist tables where symbol is implicit.
 * @param {number|null|undefined} value
 * @returns {string} Formatted number or '-'
 */
export function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return new Intl.NumberFormat('vi-VN').format(Math.round(value));
}

/**
 * Format value as percentage.
 * @param {number|null|undefined} value
 * @param {Object} options
 * @param {boolean} options.fromDecimal - If true, multiply by 100 (0.15 → 15%). Default false.
 * @param {number} options.decimals - Decimal places. Default 1.
 * @returns {string} Formatted percentage or '-'
 */
export function formatPercent(value, { fromDecimal = false, decimals = 1 } = {}) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const pct = fromDecimal ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}
