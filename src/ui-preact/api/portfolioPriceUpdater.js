/**
 * portfolioPriceUpdater.js - Price update handler with signal mutations
 * 
 * Handles:
 * - Polling lifecycle (start on mount, stop on unmount)
 * - Signal mutations for prices and timestamps
 * - Error state management
 * 
 * X51LABS-155: Task 3 - Real-time Pricing
 */

import { signal } from '@preact/signals';
import { portfolioItems, setPortfolioItems, updateError, clearError } from '../state/portfolioState.js';
import { fetchStockPricesWithRetry, classifyPricingError } from './portfolioPricing.js';

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
    console.warn('[portfolioPriceUpdater] Polling already active');
    return;
  }

  console.log('[portfolioPriceUpdater] Starting price polling...');
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
    console.log('[portfolioPriceUpdater] Price polling stopped');
  }
}

/**
 * Manually trigger price update now
 * Async function that updates prices and signals
 */
export async function updatePricesNow() {
  // Skip if portfolio empty
  if (!portfolioItems.value || portfolioItems.value.length === 0) {
    return;
  }

  isUpdatingPrices.value = true;
  clearError();

  try {
    // Get all symbols except CASH
    const symbols = portfolioItems.value
      .filter(item => item.symbol !== 'CASH')
      .map(item => item.symbol);

    if (symbols.length === 0) {
      isUpdatingPrices.value = false;
      return;
    }

    console.log('[portfolioPriceUpdater] Fetching prices for:', symbols);

    // Fetch prices with retry
    const prices = await fetchStockPricesWithRetry(symbols);

    // Update portfolio items with new prices
    const updatedItems = portfolioItems.value.map(item => {
      if (prices[item.symbol]) {
        return {
          ...item,
          current_price: prices[item.symbol]
        };
      }
      return item;
    });

    setPortfolioItems(updatedItems);
    lastUpdateTime.value = new Date();

    console.log('[portfolioPriceUpdater] Prices updated successfully:', prices);
  } catch (error) {
    // Classify error and set state
    const classified = classifyPricingError(error);
    priceUpdateError.value = classified;
    updateError(classified.userMessage);

    console.error('[portfolioPriceUpdater] Update failed:', error, classified);
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
 * @returns {string} e.g., "2 min ago" or "now"
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

/**
 * Get realtime status indicator
 * @returns {string} e.g., "🔴 Live" or "⚪ Paused"
 */
export function getRealtimeStatusIndicator() {
  if (priceUpdateError.value) {
    return `🔴 Lỗi: ${priceUpdateError.value.code}`;
  }
  if (isUpdatingPrices.value) {
    return '🟡 Đang cập nhật...';
  }
  if (shouldContinuePolling) {
    return '🟢 Cập nhật';
  }
  return '⚪ Dừng';
}
