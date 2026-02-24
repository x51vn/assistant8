/**
 * watchlistPriceUpdater.js - Watchlist price update handler with signal mutations
 *
 * Handles:
 * - Polling lifecycle (start on mount, stop on unmount)
 * - Signal mutations for prices and timestamps
 * - Error state management
 * - Recalculates ediff = (price - entry) / price
 *
 * Pattern: Mirrors portfolioPriceUpdater.js (X51LABS-155)
 * Reuses: fetchStockPricesWithRetry from portfolioPricing.js
 *
 * Ticket: XST-744
 */

import { signal } from '@preact/signals';
import { watchlistItems, setWatchlistItems } from '../state/watchlistState.js';
import { fetchStockPricesWithRetry, classifyPricingError } from './portfolioPricing.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

// Polling state signals
export const lastUpdateTime = signal(null);
export const isUpdatingPrices = signal(false);
export const priceUpdateError = signal(null);

let pollingInterval = null;
let shouldContinuePolling = true;

/**
 * Start price polling (60-second interval)
 * Should be called in useEffect on component mount
 */
export function startPricePolling() {
  if (pollingInterval) {
    console.warn('[watchlistPriceUpdater] Polling already active');
    return;
  }

  shouldContinuePolling = true;

  // Initial update immediately
  updatePricesNow();

  // Then set interval for 60 seconds
  pollingInterval = setInterval(() => {
    if (shouldContinuePolling) {
      updatePricesNow();
    }
  }, 60000); // 60 seconds
}

/**
 * Stop price polling
 * Should be called in useEffect cleanup on unmount
 */
export function stopPricePolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    shouldContinuePolling = false;
  }
}

/**
 * Manually trigger price update now
 * Async function that updates prices and signals
 */
export async function updatePricesNow() {
  // Skip if watchlist empty
  if (!watchlistItems.value || watchlistItems.value.length === 0) {
    return;
  }

  isUpdatingPrices.value = true;
  priceUpdateError.value = null;

  try {
    // Get all symbols
    const symbols = watchlistItems.value.map(item => item.symbol);

    if (symbols.length === 0) {
      isUpdatingPrices.value = false;
      return;
    }

    // Fetch prices with retry (reuses portfolioPricing.js)
    const prices = await fetchStockPricesWithRetry(symbols);

    // Update watchlist items with new prices and recalculate ediff
    const updatedItems = watchlistItems.value.map(item => {
      if (prices[item.symbol] !== undefined) {
        const newPrice = prices[item.symbol];
        // ediff = (price - entry) / price (when both price and entry exist)
        const newEdiff = (newPrice && item.entry)
          ? (newPrice - item.entry) / newPrice
          : item.ediff;

        return {
          ...item,
          price: newPrice,
          ediff: newEdiff
        };
      }
      return item;
    });

    setWatchlistItems(updatedItems);
    lastUpdateTime.value = new Date();

    // Persist updated prices to Supabase (fire-and-forget)
    const priceUpdates = {};
    updatedItems.forEach(item => {
      if (prices[item.symbol] !== undefined) {
        priceUpdates[item.symbol] = {
          price: item.price,
          ediff: item.ediff
        };
      }
    });

    if (Object.keys(priceUpdates).length > 0) {
      chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.XNEEWS_WATCHLIST_BATCH_UPDATE_PRICES,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { prices: priceUpdates }
      }).catch(err => {
        console.warn('[watchlistPriceUpdater] Failed to persist prices to DB:', err);
      });
    }
  } catch (error) {
    // Classify error and set state
    const classified = classifyPricingError(error);
    priceUpdateError.value = classified;

    console.error('[watchlistPriceUpdater] Update failed:', error, classified);
  } finally {
    isUpdatingPrices.value = false;
  }
}

/**
 * Clear error state
 */
export function clearPriceUpdateError() {
  priceUpdateError.value = null;
}

/**
 * Get last update time formatted
 * @returns {string} e.g., "2 phút trước" or "Vừa mới"
 */
export function getLastUpdateTimeFormatted() {
  if (!lastUpdateTime.value) {
    return 'Chưa cập nhật';
  }

  const diff = Date.now() - lastUpdateTime.value.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'Vừa mới';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;

  return lastUpdateTime.value.toLocaleString('vi-VN');
}
