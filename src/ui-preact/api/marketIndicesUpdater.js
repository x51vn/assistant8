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

  console.log('[marketIndicesUpdater] Starting indices polling...');
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
    console.log('[marketIndicesUpdater] Indices polling stopped');
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
    console.log('[marketIndicesUpdater] Fetching market indices...');

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

    console.log('[marketIndicesUpdater] Indices updated successfully:', result.indices);
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
