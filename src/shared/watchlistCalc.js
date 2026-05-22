/**
 * @fileoverview Shared watchlist calculation utilities
 *
 * Used by:
 * - Background handlers (supabaseWatchlist.js, watchlistEnrich.js)
 * - UI (watchlistPriceUpdater.js, WatchlistTable.jsx)
 *
 * Formulas:
 *   ediff   = (price - entry) / price    — how far current price is above entry
 *   pprofit = (target - entry) / entry   — potential profit if target is reached
 */

/**
 * Calculate ediff: (price - entry) / price
 * @param {number|null} price  - Current market price
 * @param {number|null} entry  - Entry price
 * @returns {number|null}
 */
export function calcEdiff(price, entry) {
  if (price > 0 && entry > 0) {
    return (price - entry) / price;
  }
  return null;
}

/**
 * Calculate pprofit: (target - entry) / entry
 * @param {number|null} target - Target price
 * @param {number|null} entry  - Entry price
 * @returns {number|null}
 */
export function calcPprofit(target, entry) {
  if (target > 0 && entry > 0) {
    return (target - entry) / entry;
  }
  return null;
}

/**
 * Round to 4 decimal places (matches DECIMAL(10,4) in DB)
 * @param {number|null} value
 * @returns {number|null}
 */
export function round4(value) {
  if (value == null) return null;
  return Math.round(value * 10000) / 10000;
}
