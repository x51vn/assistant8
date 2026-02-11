/**
 * @fileoverview Market Hours Utility
 * Consolidated check for Vietnam stock market trading hours
 * Used by: xneewsPriceUpdate, alarms
 */

import { MARKET_OPEN_HOUR, MARKET_CLOSE_HOUR } from '../../shared/appConstants.js';

/**
 * Check if current time is during Vietnam stock market hours
 * Market: 9:00 AM - 3:00 PM (Mon-Fri, ICT timezone)
 *
 * @returns {boolean} True if current time is during market hours
 */
export function isMarketHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }

  // Market hours from appConstants (default 9-15)
  return hour >= MARKET_OPEN_HOUR && hour < MARKET_CLOSE_HOUR;
}
