/**
 * @fileoverview SSI iBoard Price Fetcher Utility
 * Handles batch stock price fetching from SSI API with rate limiting
 * 
 * Ticket: GPT-020 - SSI price fetcher (batch + concurrency)
 * Architecture: docs/ARCHITECTURE.md section "SSI API Integration"
 */

import { createLogger } from '../../logger.js';
import { SSI_BATCH_SIZE, SSI_BATCH_DELAY_MS, SSI_REQUEST_TIMEOUT_MS } from '../../shared/appConstants.js';

const logger = createLogger('SSI/PriceFetcher');

/**
 * SSI iBoard API endpoints
 */
const SSI_API_BASE = 'https://iboard-query.ssi.com.vn';

/**
 * Fetch stock price for a single symbol
 * @param {string} symbol - Stock symbol (e.g., VNM, VIC)
 * @param {Object} options - Fetch options
 * @returns {Promise<number|null>} Stock price or null if failed
 */
async function fetchSingleStockPrice(symbol, options = {}) {
  const { timeout = SSI_REQUEST_TIMEOUT_MS, correlationId = null } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    logger.debug(`Fetching price for ${symbol}`, { correlationId, symbol });
    
    const response = await fetch(`${SSI_API_BASE}/stock/price/${symbol}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.warn(`SSI API returned non-OK status for ${symbol}`, {
        correlationId,
        symbol,
        status: response.status,
        statusText: response.statusText
      });
      return null;
    }
    
    const data = await response.json();
    
    // SSI API structure may vary, adjust field name as needed
    const price = data.lastPrice || data.price || data.closePrice;
    
    if (typeof price === 'number' && price > 0) {
      logger.debug(`Price fetched for ${symbol}: ${price}`, { correlationId, symbol, price });
      return price;
    }
    
    logger.warn(`Invalid price data for ${symbol}`, { correlationId, symbol, data });
    return null;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.warn(`Timeout fetching price for ${symbol}`, { correlationId, symbol, timeout });
    } else {
      logger.warn(`Error fetching price for ${symbol}`, {
        correlationId,
        symbol,
        error: error.message
      });
    }
    
    return null;
  }
}

/**
 * Fetch stock prices for multiple symbols in batches
 * 
 * Features:
 * - Batch processing to avoid overwhelming SSI API
 * - Concurrency limit per batch
 * - Delay between batches to respect rate limits
 * - Individual symbol failures don't fail entire batch
 * - Returns price map with null for failed symbols
 * 
 * @param {string[]} symbols - Array of stock symbols
 * @param {Object} options - Fetch options
 * @param {number} [options.batchSize] - Number of symbols per batch
 * @param {number} [options.batchDelay] - Delay in ms between batches
 * @param {number} [options.timeout] - Timeout per request in ms
 * @param {string} [options.correlationId] - Request correlation ID
 * @returns {Promise<Object>} Map of symbol to price (null if failed)
 * 
 * @example
 * const prices = await fetchStockPricesBatch(['VNM', 'VIC', 'VHM']);
 * // { VNM: 85000, VIC: 98000, VHM: null }
 */
export async function fetchStockPricesBatch(symbols, options = {}) {
  const {
    batchSize = SSI_BATCH_SIZE,
    batchDelay = SSI_BATCH_DELAY_MS,
    timeout = SSI_REQUEST_TIMEOUT_MS,
    correlationId = null
  } = options;
  
  if (!Array.isArray(symbols) || symbols.length === 0) {
    logger.warn('No symbols provided for price fetch', { correlationId });
    return {};
  }
  
  // Normalize symbols (uppercase, trim, deduplicate)
  const normalizedSymbols = [...new Set(
    symbols
      .filter(s => s && typeof s === 'string')
      .map(s => s.trim().toUpperCase())
  )];
  
  if (normalizedSymbols.length === 0) {
    logger.warn('No valid symbols after normalization', { correlationId, symbols });
    return {};
  }
  
  logger.info('Starting batch price fetch', {
    correlationId,
    totalSymbols: normalizedSymbols.length,
    batchSize,
    batchCount: Math.ceil(normalizedSymbols.length / batchSize)
  });
  
  const priceMap = {};
  const startTime = Date.now();
  
  // Process symbols in batches
  for (let i = 0; i < normalizedSymbols.length; i += batchSize) {
    const batch = normalizedSymbols.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(normalizedSymbols.length / batchSize);
    
    logger.debug(`Processing batch ${batchNumber}/${totalBatches}`, {
      correlationId,
      batchNumber,
      batchSize: batch.length,
      symbols: batch
    });
    
    // Fetch all symbols in this batch concurrently
    const batchPromises = batch.map(symbol =>
      fetchSingleStockPrice(symbol, { timeout, correlationId })
        .then(price => ({ symbol, price }))
        .catch(error => {
          logger.error(`Batch promise failed for ${symbol}`, {
            correlationId,
            symbol,
            error: error.message
          });
          return { symbol, price: null };
        })
    );
    
    // Wait for all symbols in batch to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Add results to price map
    batchResults.forEach(({ symbol, price }) => {
      priceMap[symbol] = price;
    });
    
    // Delay before next batch (except for last batch)
    if (i + batchSize < normalizedSymbols.length) {
      logger.debug(`Waiting ${batchDelay}ms before next batch`, {
        correlationId,
        batchNumber,
        nextBatch: batchNumber + 1
      });
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }
  
  const duration = Date.now() - startTime;
  const successCount = Object.values(priceMap).filter(p => p !== null).length;
  const failCount = normalizedSymbols.length - successCount;
  
  logger.info('Batch price fetch completed', {
    correlationId,
    totalSymbols: normalizedSymbols.length,
    successCount,
    failCount,
    duration: `${duration}ms`
  });
  
  return priceMap;
}

/**
 * Fetch single stock price (convenience wrapper)
 * @param {string} symbol - Stock symbol
 * @param {Object} options - Fetch options
 * @returns {Promise<number|null>} Stock price or null
 */
export async function fetchStockPrice(symbol, options = {}) {
  if (!symbol || typeof symbol !== 'string') {
    return null;
  }
  
  const normalizedSymbol = symbol.trim().toUpperCase();
  const priceMap = await fetchStockPricesBatch([normalizedSymbol], options);
  
  return priceMap[normalizedSymbol] || null;
}

/**
 * Check if SSI API is reachable (health check)
 * @param {Object} options - Options
 * @returns {Promise<boolean>} True if API is reachable
 */
export async function checkSSIApiHealth(options = {}) {
  const { timeout = 5000, correlationId = null } = options;
  
  try {
    logger.debug('Checking SSI API health', { correlationId });
    
    // Use a common stock symbol for health check
    const testSymbol = 'VNM';
    const price = await fetchSingleStockPrice(testSymbol, { timeout, correlationId });
    
    const isHealthy = price !== null;
    
    logger.info('SSI API health check result', {
      correlationId,
      isHealthy,
      testSymbol,
      price
    });
    
    return isHealthy;
    
  } catch (error) {
    logger.error('SSI API health check failed', {
      correlationId,
      error: error.message
    });
    return false;
  }
}
