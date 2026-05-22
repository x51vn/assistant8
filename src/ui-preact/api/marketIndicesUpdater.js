/**
 * marketIndicesUpdater.js - Market indices polling and update handler
 *
 * Handles:
 * - Polling lifecycle (start on mount, stop on unmount)
 * - Signal mutations for indices and timestamps
 * - Error state management
 */

import {
  marketIndices,
  setMarketIndices,
  indicesLoading,
  updateIndicesLoading,
  setIndicesError,
  clearIndicesError,
  setLastIndicesUpdateTime
} from '../state/marketIndicesState.js';
import { fetchMarketIndices } from './marketIndicesApi.js';

let pollingInterval = null;
let shouldContinuePolling = true;

/**
 * Start market indices polling (45-second interval)
 * Should be called in useEffect on component mount
 * @param {number} [intervalMs=45000] - Polling interval in milliseconds
 */
export function startIndicesPolling(intervalMs = 45000) {
  if (pollingInterval) {
    console.warn('[marketIndicesUpdater] Polling already active');
    return;
  }

  shouldContinuePolling = true;
  clearIndicesError();

  // Initial update immediately
  updateIndicesNow();

  // Then set interval
  pollingInterval = setInterval(() => {
    if (shouldContinuePolling) {
      updateIndicesNow();
    }
  }, intervalMs);
}

/**
 * Stop market indices polling
 * Should be called in useEffect cleanup on unmount
 */
export function stopIndicesPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    shouldContinuePolling = false;
  }
}

/**
 * Manually trigger indices update now
 * Async function that fetches indices and updates signals
 */
export async function updateIndicesNow() {
  updateIndicesLoading(true);
  clearIndicesError();

  try {
    const result = await fetchMarketIndices();

    if (result.error) {
      setIndicesError(result.error.message);
      console.error('[marketIndicesUpdater] Fetch failed:', result.error);
      return;
    }

    if (!result.indices || result.indices.length === 0) {
      setIndicesError('No index data available');
      return;
    }

    setMarketIndices(result.indices);
    setLastIndicesUpdateTime(Date.now());
  } catch (error) {
    const errorMsg = error.message || 'Failed to fetch market indices';
    setIndicesError(errorMsg);

    console.error('[marketIndicesUpdater] Update failed:', error);
  } finally {
    updateIndicesLoading(false);
  }
}

/**
 * Clear indices error state
 */
export function clearIndicesUpdateError() {
  clearIndicesError();
}
