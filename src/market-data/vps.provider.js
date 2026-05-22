/**
 * VPS Market Data Provider
 * 
 * Integration with VPS's public API for stock data
 * Supports stocks + ETFs (better coverage than SSI for ETFs)
 * 
 * API Endpoints:
 * - GET /getliststockdata/{SYMBOL} - Individual stock data
 * - GET /getliststockdata/{SYMBOLS} - Multiple stocks (comma-separated)
 * 
 * Note: VPS prices are in 1000 VND units (e.g., 104.5 = 104,500 VND)
 */

import { MarketDataProvider } from './provider.interface.js';

export class VPSProvider extends MarketDataProvider {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || 'https://bgapidatafeed.vps.com.vn';
    this.timeout = options.timeout || 5000;
    this.name = 'VPS';
  }

  /**
   * Get stock price data for a single stock
   * @param {string} symbol - Stock code (e.g., 'FPT')
   * @returns {Promise<StockPriceData>}
   */
  async getStockPrice(symbol) {
    try {
      const data = await this._fetch(`/getliststockdata/${symbol.toUpperCase()}`);
      
      // VPS returns array of objects
      if (!Array.isArray(data) || data.length === 0) {
        throw { code: 'NOT_FOUND', status: 404, message: `Symbol ${symbol} not found` };
      }

      return this.transformStockData(data[0]);
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error;
      console.error(`[VPS] Error fetching stock ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple stocks' data efficiently
   * VPS supports comma-separated symbols in single request
   * @param {string[]} symbols - Array of stock codes
   * @returns {Promise<StockPriceData[]>}
   */
  async getMultipleStocks(symbols) {
    try {
      // VPS supports batch request with comma-separated symbols
      const symbolList = symbols.map(s => s.toUpperCase()).join(',');
      const data = await this._fetch(`/getliststockdata/${symbolList}`);
      
      if (!Array.isArray(data)) {
        return [];
      }

      return data.map(stock => this.transformStockData(stock));
    } catch (error) {
      console.error('[VPS] Error fetching multiple stocks:', error);
      throw error;
    }
  }

  /**
   * Get price table - VPS doesn't have group endpoint, use multiple stocks
   * @param {string} filter - Filter (not directly supported, returns empty)
   * @returns {Promise<PriceTableData>}
   */
  async getPriceTable(filter = 'VN30') {
    // VPS doesn't have group listing endpoint
    // Would need to maintain our own list of stocks per group
    console.warn('[VPS] getPriceTable not fully supported, returning empty');
    return {
      filterType: filter,
      stocks: [],
      timestamp: Date.now()
    };
  }

  /**
   * Get index data - VPS doesn't support indices
   * @param {string} indexCode - Index code
   * @returns {Promise<IndexData>}
   */
  async getIndexData(indexCode, includeHistory = false) {
    throw new Error('VPS provider does not support index data');
  }

  /**
   * Get multiple indices - not supported
   * @param {string[]} indexCodes - Array of index codes
   * @returns {Promise<any[]>}
   */
  async getMultipleIndices(indexCodes) {
    throw new Error('VPS provider does not support indices');
  }

  /**
   * Get exchange stats - not supported
   * @param {string} exchange - Exchange code
   * @returns {Promise<any>}
   */
  async getExchangeStats(exchange) {
    throw new Error('VPS provider does not support exchange stats');
  }

  /**
   * Check if VPS API is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      // Try fetching a known stock
      await this._fetch('/getliststockdata/VNM');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Transform raw VPS stock data to standard format
   * Maps VPS API fields to common data structure
   * @private
   * @param {Object} stock - Raw stock data from VPS API
   * @returns {Object} Transformed stock data
   */
  transformStockData(stock) {
    // VPS prices are in 1000 VND units, multiply by 1000
    const priceMultiplier = 1000;
    
    return {
      symbol: stock.sym || stock.symbol,
      // Main price - multiply by 1000 to get VND
      price: (stock.lastPrice || stock.c || 0) * priceMultiplier,
      change: (stock.ot || 0) * priceMultiplier,
      changePercent: stock.changePc || 0,
      volume: stock.lastVolume || stock.lot || 0,
      value: stock.val || 0,
      bid: (stock.g1 || 0) * priceMultiplier,
      bidVolume: stock.g1Vol || 0,
      ask: (stock.g2 || 0) * priceMultiplier,
      askVolume: stock.g2Vol || 0,
      high: (stock.highPrice || stock.h || 0) * priceMultiplier,
      low: (stock.lowPrice || stock.l || 0) * priceMultiplier,
      open: (stock.o || 0) * priceMultiplier,
      reference: (stock.r || 0) * priceMultiplier,
      ceiling: (stock.c || 0) * priceMultiplier, // ceiling = c field
      floor: (stock.f || 0) * priceMultiplier,
      foreignBuy: stock.fBuyVol || 0,
      foreignSell: stock.fSellVol || 0,
      timestamp: Date.now()
    };
  }

  /**
   * Internal HTTP fetch wrapper
   * VPS API is public and doesn't require CORS proxy
   * @private
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async _fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Accept': 'application/json',
          ...options.headers
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw { code: 'NOT_FOUND', status: 404, message: `Not found: ${endpoint}` };
        }
        if (response.status === 429) {
          throw { code: 'RATE_LIMIT', status: 429, message: 'Rate limited' };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error.code) throw error; // Re-throw our errors
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw { code: 'TIMEOUT', message: 'Request timed out' };
      }
      throw error;
    }
  }
}

/**
 * Factory function to create VPS provider with default options
 * 
 * @param {Object} options - Configuration options
 * @returns {VPSProvider}
 */
export function createVPSProvider(options = {}) {
  return new VPSProvider(options);
}
