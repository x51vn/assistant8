/**
 * @fileoverview Fetch with retry + exponential backoff
 * Consolidated utility for all background handlers
 * Uses AbortController for proper timeout handling
 *
 * Pattern: 1s → 2s → 4s (max 3 attempts)
 */

import { createLogger } from '../../logger.js';

const logger = createLogger('Utils/FetchRetry');

/**
 * Fetch with retry and exponential backoff
 * @param {string} url - API endpoint URL
 * @param {Object} options - fetch options
 * @param {number} [maxRetries=3] - Max retry attempts
 * @param {number} [timeoutMs=10000] - Timeout per attempt in ms
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, options, maxRetries = 3, timeoutMs = 10000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Don't retry client errors (4xx) — likely permanent
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry server errors (5xx) with exponential backoff
      if (!response.ok && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('Fetch failed, retrying', {
          attempt: attempt + 1,
          delay,
          status: response.status,
          url: url.split('?')[0] // Log URL without query params
        });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      // Last attempt — throw
      if (attempt === maxRetries - 1) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000;
      logger.warn('Fetch error, retrying', {
        attempt: attempt + 1,
        delay,
        error: error.message
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
