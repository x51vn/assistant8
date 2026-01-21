/**
 * SSI iBoard Market Data Provider
 * 
 * Optimized integration with SSI's iBoard API
 * Uses verified endpoints from network analysis
 * 
 * API Endpoints:
 * - GET /stock/{SYMBOL} - Individual stock data
 * - GET /stock/group/{GROUP} - All stocks in a group
 * - POST /exchange-index/multiple - Multiple indices
 * - GET /system/time - Server time
 * - GET /market-stat/exchange/{EXCHANGE} - Exchange statistics
 * 
 * Groups: VN30, HOSE, HNX, UPCOM, FUND, CW, ETF, VN30F1M, BOND
 */

import { MarketDataProvider } from './provider.interface.js';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export class SSIProvider extends MarketDataProvider {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || 'https://iboard-query.ssi.com.vn';
    this.timeout = options.timeout || 5000;
    this.name = 'SSI iBoard';
    
    // Known stock groups for efficient searching
    this.stockGroups = ['VN30', 'HOSE', 'HNX', 'UPCOM', 'FUND', 'CW', 'ETF', 'VN30F1M', 'BOND'];
    this.groupCache = new Map(); // group -> timestamp for quick lookups
  }

  /**
   * Get stock price data for a single stock
   * Direct endpoint: GET /stock/{SYMBOL}
   * @param {string} symbol - Stock code (e.g., 'ACB')
   * @returns {Promise<StockPriceData>}
   */
  async getStockPrice(symbol) {
    try {
      // Use direct stock endpoint
      const data = await this._fetch(`${this.baseUrl}/stock/${symbol}`);
      
      if (!data || !data.data) {
        throw new Error(`No data returned for symbol ${symbol}`);
      }

      return this.transformStockData(data.data);
    } catch (error) {
      console.error(`[SSI] Error fetching stock ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple stocks' data efficiently
   * Uses Promise.all for parallel requests
   * @param {string[]} symbols - Array of stock codes
   * @returns {Promise<StockPriceData[]>}
   */
  async getMultipleStocks(symbols) {
    try {
      const promises = symbols.map(symbol => 
        this.getStockPrice(symbol).catch(() => null)
      );
      const results = await Promise.all(promises);
      return results.filter(stock => stock !== null);
    } catch (error) {
      console.error('[SSI] Error fetching multiple stocks:', error);
      throw error;
    }
  }

  /**
   * Get all stocks in a group efficiently
   * Endpoint: GET /stock/group/{GROUP}
   * @param {string} group - Group code (VN30, HOSE, HNX, etc.)
   * @returns {Promise<StockPriceData[]>}
   */
  async getStocksInGroup(group) {
    try {
      if (!this.stockGroups.includes(group)) {
        throw new Error(`Unknown stock group: ${group}. Valid groups: ${this.stockGroups.join(', ')}`);
      }

      const data = await this._fetch(`${this.baseUrl}/stock/group/${group}`);
      
      if (!data || !data.data || !Array.isArray(data.data)) {
        return [];
      }

      return data.data.map(stock => this.transformStockData(stock));
    } catch (error) {
      console.error(`[SSI] Error fetching group ${group}:`, error);
      throw error;
    }
  }

  /**
   * Get price table (bảng giá) - full listing of stocks
   * 
   * Supported filters:
   * - 'VN30', 'HNX30': Group/Index filters
   * - 'HOSE', 'HNX', 'UPCOM': Exchange filters
   * - Any stock code: Returns that stock's data
   * 
   * @param {string} filter - Filter for the price table
   * @returns {Promise<PriceTableData>}
   */
  async getPriceTable(filter = 'VN30') {
    try {
      const url = `${this.baseUrl}/stock/group/${filter}`;
      
      const response = await this._fetch(url);
      
      // Parse the API response into our standard format
      return {
        filterType: filter,
        stocks: response.data || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SSI] Error fetching price table:', error);
      throw error;
    }
  }

  /**
   * Get index data (VNINDEX, VN30, HNX30, HNXIndex, etc.)
   * 
   * @param {string} indexCode - Index code
   * @param {boolean} includeHistory - Include historical data
   * @returns {Promise<IndexData>}
   */
  async getIndexData(indexCode, includeHistory = false) {
    try {
      const params = includeHistory ? '?hasHistory=true' : '';
      const url = `${this.baseUrl}/exchange-index/${indexCode}${params}`;
      
      const response = await this._fetch(url);
      
      return {
        indexCode: indexCode,
        indexName: response.indexName || indexCode,
        currentValue: response.indexPoint || 0,
        change: response.indexPoint - (response.yesterdayPoint || response.indexPoint),
        percentChange: ((response.indexPoint - (response.yesterdayPoint || response.indexPoint)) / (response.yesterdayPoint || response.indexPoint) * 100) || 0,
        volume: response.totalVol || 0,
        value: response.totalVal || 0,
        stats: {
          advances: response.advances || 0,
          declines: response.declines || 0,
          unchanged: response.unchanged || 0
        },
        history: response.history || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SSI] Error fetching index data:', error);
      throw error;
    }
  }


  /**
   * Get all indices data efficiently
   * Endpoint: POST /exchange-index/multiple
   * @param {string[]} indexCodes - Array of index codes
   * @returns {Promise<any[]>}
   */
  async getMultipleIndices(indexCodes) {
    try {
      const data = await this._fetch(`${this.baseUrl}/exchange-index/multiple`, {
        method: 'POST',
        body: { keys: indexCodes }
      });
      
      return data.data || [];
    } catch (error) {
      console.error('[SSI] Error fetching multiple indices:', error);
      throw error;
    }
  }

  /**
   * Get exchange market statistics
   * Endpoint: GET /market-stat/exchange/{EXCHANGE}
   * @param {string} exchange - Exchange code (hose, hnx)
   * @returns {Promise<any>}
   */
  async getExchangeStats(exchange) {
    try {
      const data = await this._fetch(`${this.baseUrl}/market-stat/exchange/${exchange}`);
      return data;
    } catch (error) {
      console.error(`[SSI] Error fetching exchange ${exchange} stats:`, error);
      throw error;
    }
  }

  /**
   * Get system time from SSI server
   * Endpoint: GET /system/time
   * @returns {Promise<number>}
   */
  async getSystemTime() {
    try {
      const data = await this._fetch(`${this.baseUrl}/system/time`);
      return data.timestamp || Date.now();
    } catch (error) {
      console.error('[SSI] Error fetching system time:', error);
      return Date.now();
    }
  }

  /**
   * Check if SSI API is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      await this.getSystemTime();
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
   * Transform raw SSI stock data to standard format
   * Maps SSI API fields to common data structure
   * @private
   * @param {Object} stock - Raw stock data from SSI API
   * @returns {Object} Transformed stock data
   */
  transformStockData(stock) {
    return {
      symbol: stock.stockSymbol || stock.symbol,
      price: stock.matchedPrice || stock.priceClose || 0,
      change: stock.priceChange || 0,
      changePercent: stock.priceChangePercent || 0,
      volume: stock.nmTotalTradedQty || stock.stockVol || 0,
      value: stock.nmTotalTradedValue || 0,
      bid: stock.best1Bid || 0,
      bidVolume: stock.best1BidVol || 0,
      ask: stock.best1Offer || 0,
      askVolume: stock.best1OfferVol || 0,
      high: stock.highest || 0,
      low: stock.lowest || 0,
      open: stock.openPrice || 0,
      reference: stock.refPrice || 0,
      ceiling: stock.ceiling || 0,
      floor: stock.floor || 0,
      foreignBuy: stock.buyForeignQtty || 0,
      foreignSell: stock.sellForeignQtty || 0,
      timestamp: Date.now()
    };
  }

  /**
   * Internal HTTP fetch wrapper with error handling
   * Uses background service worker as proxy to bypass CORS
   * @private
   * @param {string} url - API endpoint URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async _fetch(url, options = {}) {
    const endpoint = url.replace('https://iboard-query.ssi.com.vn', '');
    
    console.log(`[SSIProvider] Fetching: ${endpoint}`);
    
    try {
      // Use background service worker as proxy to bypass CORS
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.CONTENT_EXTRACT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          action: 'fetch_ssi_api',
          endpoint: endpoint,
          method: options.method || 'GET',
          body: options.body
        }
      });

      if (!response || response.type === MESSAGE_TYPES.ERROR) {
        const errorMessage = response?.error?.message || response?.error || `Failed to fetch ${endpoint}`;
        throw new Error(errorMessage);
      }

      const apiResponse = response.payload?.data ?? response.data ?? response.payload;

      if (!apiResponse) {
        throw new Error(`No data in response from ${endpoint}`);
      }

      return apiResponse;
    } catch (error) {
      console.error(`[SSIProvider] Fetch error for ${endpoint}:`, error);
      throw error;
    }
  }
}

/**
 * Factory function to create SSI provider with default options
 * 
 * @param {Object} options - Configuration options
 * @returns {SSIProvider}
 */
export function createSSIProvider(options = {}) {
  return new SSIProvider(options);
}
