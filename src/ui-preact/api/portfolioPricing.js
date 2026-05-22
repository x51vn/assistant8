/**
 * portfolioPricing.js - Vietnamese Stock Price API integration
 * 
 * Generic provider discovery pattern:
 * - Auto-discovers all providers from market-data registry
 * - Tries providers in priority order with automatic failover
 * - Adding new provider requires only updating the registry
 * 
 * Features:
 * - Batch processing (max 5 stocks, 1s delay between batches)
 * - Exponential backoff for rate limiting
 * - Unified interface via MarketDataClient
 * 
 * X51LABS-155: Task 3 - Real-time Pricing
 */

import { MarketDataClient, createAllProviders, getProviderRegistry } from '../../market-data/index.js';

const MAX_BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Singleton MarketDataClient instance with providers configured
 * @type {MarketDataClient|null}
 */
let marketDataClient = null;

/**
 * Get or create the MarketDataClient singleton
 * Auto-discovers and registers all available providers from market-data folder
 * 
 * @returns {MarketDataClient}
 */
function getMarketDataClient() {
  if (!marketDataClient) {
    // Auto-discover all providers from registry (sorted by priority)
    const providers = createAllProviders();
    
    if (providers.length === 0) {
      console.error('[portfolioPricing] No providers available!');
      throw new Error('No market data providers available');
    }
    
    marketDataClient = new MarketDataClient(providers);
    marketDataClient.cacheEnabled = false; // Disable cache for real-time prices
    
    // Log discovered providers
    const registry = getProviderRegistry();
    console.log('[portfolioPricing] Auto-discovered providers:', 
      registry.map(p => `${p.name}(p${p.priority})`).join(' → '));
  }
  return marketDataClient;
}

/**
 * Check if symbol is likely unsupported by APIs
 * 
 * @param {string} symbol - Stock symbol
 * @returns {boolean} True if likely unsupported
 */
export function isLikelyUnsupportedSymbol(symbol) {
  const upper = symbol.toUpperCase();
  
  // Bond patterns (not supported)
  if (upper.startsWith('BOND')) return true;
  
  // Special codes with numbers in middle (like VBA121033) - bonds
  if (/^[A-Z]{3}\d{6}$/.test(upper)) return true;
  
  return false;
}

/**
 * Fetch stock price using MarketDataClient with failover
 * 
 * @param {string} symbol - Stock symbol (e.g., 'VNM')
 * @returns {Promise<number>} Current price in VND
 */
export async function fetchStockPrice(symbol) {
  const client = getMarketDataClient();
  
  try {
    const stockData = await client.getStockPrice(symbol);
    
    if (!stockData || typeof stockData.price !== 'number' || stockData.price <= 0) {
      throw { code: 'INVALID_DATA', message: `Invalid price data for ${symbol}` };
    }
    
    return stockData.price;
  } catch (error) {
    // Enhance error with symbol info
    if (error.code === 'NOT_FOUND' || error.status === 404) {
      console.warn(`[portfolioPricing] Symbol ${symbol} not found in any provider`);
      throw { 
        code: 'NOT_FOUND', 
        status: 404, 
        message: `Symbol ${symbol} not found`,
        symbol 
      };
    }
    
    console.error(`[portfolioPricing] Failed to fetch ${symbol}:`, error.message || error);
    throw error;
  }
}

/**
 * Fetch prices for multiple stocks with batching
 * @param {Array<string>} symbols - Array of stock symbols
 * @returns {Promise<Object>} { VNM: 85000, VIC: 120000, ... }
 */
export async function fetchStockPricesBatch(symbols) {
  if (!symbols || symbols.length === 0) {
    return {};
  }

  const prices = {};
  const failedSymbols = [];
  
  // Process in batches
  for (let i = 0; i < symbols.length; i += MAX_BATCH_SIZE) {
    const batch = symbols.slice(i, i + MAX_BATCH_SIZE);
    
    // Fetch batch in parallel
    const results = await Promise.allSettled(
      batch.map(symbol => fetchStockPrice(symbol))
    );
    
    // Process results
    results.forEach((result, idx) => {
      const symbol = batch[idx];
      if (result.status === 'fulfilled') {
        prices[symbol] = result.value;
      } else {
        failedSymbols.push({
          symbol,
          code: result.reason?.code || 'UNKNOWN',
          message: result.reason?.message || String(result.reason)
        });
      }
    });
    
    // Delay between batches (except last batch)
    if (i + MAX_BATCH_SIZE < symbols.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  
  // Log failures with proper formatting
  if (failedSymbols.length > 0) {
    console.warn('[portfolioPricing] Failed symbols:', 
      failedSymbols.map(f => `${f.symbol}(${f.code})`).join(', '));
  }
  
  return prices;
}

/**
 * Fetch prices with retry logic for transient errors
 * @param {Array<string>} symbols - Stock symbols
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object>} Prices map
 */
export async function fetchStockPricesWithRetry(symbols, retryCount = 0) {
  try {
    return await fetchStockPricesBatch(symbols);
  } catch (error) {
    // Rate limit: exponential backoff
    if (error.code === 'RATE_LIMIT' && retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.warn(`[portfolioPricing] Rate limited, retrying in ${delay}ms`);
      await sleep(delay);
      return fetchStockPricesWithRetry(symbols, retryCount + 1);
    }
    
    // Network error: retry once
    if (isNetworkError(error) && retryCount < 1) {
      console.warn('[portfolioPricing] Network error, retrying');
      await sleep(2000);
      return fetchStockPricesWithRetry(symbols, retryCount + 1);
    }
    
    // Give up
    throw error;
  }
}

/**
 * Check if error is network-related
 * @param {Error} error - Error object
 * @returns {boolean}
 */
function isNetworkError(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return message.includes('network') || 
         message.includes('fetch') || 
         message.includes('timeout') ||
         message.includes('abort') ||
         message.includes('econnrefused') ||
         message.includes('enotfound');
}

/**
 * Sleep helper
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Classify error for user display
 * @param {Error|Object} error - Error to classify
 * @returns {Object} { code, userMessage, severity, canRetry }
 */
export function classifyPricingError(error) {
  if (!error) {
    return { code: 'UNKNOWN', userMessage: 'Lỗi không xác định' };
  }
  
  const message = String(error.message || '').toLowerCase();
  const code = error.code || '';
  
  // Symbol not found (404)
  if (code === 'NOT_FOUND' || error.status === 404 || message.includes('not found')) {
    return {
      code: 'SYMBOL_NOT_FOUND',
      userMessage: 'Mã không tồn tại hoặc không được hỗ trợ',
      severity: 'info',
      canRetry: false
    };
  }
  
  // All providers failed
  if (code === 'ALL_PROVIDERS_FAILED' || message.includes('any provider')) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      userMessage: 'Tất cả dịch vụ giá đều không khả dụng. Vui lòng thử lại sau',
      severity: 'warning',
      canRetry: true
    };
  }
  
  // Rate limit
  if (code === 'RATE_LIMIT' || error.status === 429) {
    return {
      code: 'RATE_LIMIT',
      userMessage: 'Quá nhiều yêu cầu. Vui lòng thử lại sau',
      severity: 'warning',
      canRetry: true
    };
  }
  
  // Network
  if (isNetworkError(error)) {
    return {
      code: 'NETWORK_ERROR',
      userMessage: 'Không có kết nối mạng. Vui lòng kiểm tra internet',
      severity: 'error',
      canRetry: true
    };
  }
  
  // Validation
  if (code === 'INVALID_DATA' || message.includes('invalid')) {
    return {
      code: 'VALIDATION_ERROR',
      userMessage: 'Dữ liệu giá không hợp lệ',
      severity: 'warning',
      canRetry: true
    };
  }
  
  // Timeout
  if (code === 'TIMEOUT' || message.includes('timeout') || message.includes('abort')) {
    return {
      code: 'TIMEOUT',
      userMessage: 'Yêu cầu hết thời gian. Vui lòng thử lại',
      severity: 'warning',
      canRetry: true
    };
  }
  
  // Default
  return {
    code: 'API_ERROR',
    userMessage: `Lỗi lấy giá: ${message.substring(0, 50)}`,
    severity: 'error',
    canRetry: true
  };
}

/**
 * Get list of available price providers
 * @returns {string[]} Provider names
 */
export function getAvailableProviders() {
  const client = getMarketDataClient();
  return client.getAvailableProviders();
}

/**
 * Get detailed provider registry information
 * @returns {Object[]} Provider configs with id, name, priority, capabilities
 */
export function getProviderInfo() {
  return getProviderRegistry();
}

/**
 * Reset the MarketDataClient (for testing)
 */
export function resetMarketDataClient() {
  marketDataClient = null;
}
