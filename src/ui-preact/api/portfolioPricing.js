/**
 * portfolioPricing.js - SSI iBoard API integration for real-time stock prices
 * 
 * Handles:
 * - Fetching stock prices from SSI API
 * - Batch processing (max 5 stocks, 1s delay between batches)
 * - Error handling (network, rate limit, validation)
 * - Exponential backoff for rate limiting
 * - 404 handling for unsupported symbols (ETFs, funds)
 * 
 * X51LABS-155: Task 3 - Real-time Pricing
 * 
 * ⚠️ SSI API Limitations:
 * - ETF codes (e.g., E1VFVN30, FUEVFVND) return 404
 * - Mutual fund codes return 404
 * - Only supports regular stocks
 */

const SSI_API_BASE = 'https://iboard-query.ssi.com.vn';
const MAX_BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Check if symbol is likely unsupported by SSI API
 * Common patterns:
 * - ETF codes: E1VFVN30, FUEVFVND (contain 'VF', 'VN', start with E1)
 * - Fund codes: Often contain 'FU', 'FUND'
 * - Bonds: Start with 'BOND'
 * 
 * Note: This is heuristic. Some may still return 404.
 * 
 * @param {string} symbol - Stock symbol
 * @returns {boolean} True if likely unsupported
 */
export function isLikelyUnsupportedSymbol(symbol) {
  const upper = symbol.toUpperCase();
  
  // ETF patterns
  if (upper.includes('VF') || upper.includes('ETF')) return true;
  if (upper.startsWith('E1') || upper.startsWith('VFMV')) return true;
  
  // Fund patterns
  if (upper.includes('FUND') || upper.includes('FU')) return true;
  
  // Bond patterns
  if (upper.startsWith('BOND')) return true;
  
  return false;
}

/**
 * Fetch stock price from SSI iBoard API
 * @param {string} symbol - Stock symbol (e.g., 'VNM')
 * @returns {Promise<number|null>} Current price or null on error
 */
export async function fetchStockPrice(symbol) {
  try {
    const response = await fetch(
      `${SSI_API_BASE}/stock/price/${symbol.toUpperCase()}`,
      { timeout: 5000 }
    );
    
    if (!response.ok) {
      if (response.status === 429) {
        throw { code: 'RATE_LIMIT', status: 429, message: 'API rate limited' };
      }
      if (response.status === 404) {
        // 404 means symbol not found in SSI database
        // This is normal for ETFs, funds, or invalid symbols
        throw { code: 'NOT_FOUND', status: 404, message: `Symbol ${symbol} not found in SSI database` };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const price = data?.lastPrice || data?.priceClose;
    
    if (typeof price !== 'number' || price <= 0) {
      throw new Error('Invalid price data');
    }
    
    return price;
  } catch (error) {
    // Only log as error if it's NOT a 404
    if (error.status === 404) {
      console.warn(`[portfolioPricing] Symbol ${symbol} not found (404) - possibly ETF/fund or invalid code`);
    } else {
      console.error(`[portfolioPricing] Fetch ${symbol} failed:`, error);
    }
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
          error: result.reason
        });
      }
    });
    
    // Delay between batches (except last batch)
    if (i + MAX_BATCH_SIZE < symbols.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  
  // Log failures
  if (failedSymbols.length > 0) {
    console.warn('[portfolioPricing] Failed symbols:', failedSymbols);
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
  const message = String(error.message).toLowerCase();
  return message.includes('network') || 
         message.includes('fetch') || 
         message.includes('timeout') ||
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
 * @returns {Object} { code, userMessage }
 */
export function classifyPricingError(error) {
  if (!error) {
    return { code: 'UNKNOWN', userMessage: 'Lỗi không xác định' };
  }
  
  const message = String(error.message).toLowerCase();
  
  // Symbol not found (404) - normal for ETFs/funds
  if (error.code === 'NOT_FOUND' || error.status === 404 || message.includes('not found')) {
    return {
      code: 'SYMBOL_NOT_FOUND',
      userMessage: 'Mã không được SSI API hỗ trợ (có thể là ETF/quỹ)',
      severity: 'info',
      canRetry: false
    };
  }
  
  // Rate limit
  if (error.code === 'RATE_LIMIT' || error.status === 429) {
    return {
      code: 'RATE_LIMIT',
      userMessage: 'Quá nhiều yêu cầu. Vui lòng thử lại sau'
    };
  }
  
  // Network
  if (isNetworkError(error)) {
    return {
      code: 'NETWORK_ERROR',
      userMessage: 'Không có kết nối mạng. Vui lòng kiểm tra internet'
    };
  }
  
  // Validation
  if (message.includes('invalid')) {
    return {
      code: 'VALIDATION_ERROR',
      userMessage: 'Dữ liệu giá không hợp lệ'
    };
  }
  
  // Timeout
  if (message.includes('timeout')) {
    return {
      code: 'TIMEOUT',
      userMessage: 'Yêu cầu hết thời gian. Vui lòng thử lại'
    };
  }
  
  // Default
  return {
    code: 'API_ERROR',
    userMessage: `Lỗi API: ${message.substring(0, 50)}`
  };
}
