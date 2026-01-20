/**
 * SSI iBoard Market Data Provider
 * 
 * Integrates with SSI's iBoard API to fetch stock prices, indices, and market data
 * API Documentation: https://iboard.ssi.com.vn/
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
  }

  /**
   * Get stock price data for a single stock
   * @param {string} symbol - Stock code (e.g., 'ACB')
   * @returns {Promise<StockPriceData>}
   */
  async getStockPrice(symbol) {
    try {
      // SSI iBoard API doesn't have a direct single stock endpoint
      // We fetch from price table and filter
      const priceTable = await this.getPriceTable(symbol);
      if (priceTable.stocks && priceTable.stocks.length > 0) {
        return priceTable.stocks[0];
      }
      throw new Error(`Stock ${symbol} not found`);
    } catch (error) {
      console.error('[SSI] Error fetching stock price:', error);
      throw error;
    }
  }

  /**
   * Get multiple stocks' data in one call
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
   * Get multiple indices at once
   * 
   * @param {string[]} indices - Array of index codes
   * @returns {Promise<IndexData[]>}
   */
  async getMultipleIndices(indices) {
    try {
      const body = {
        keys: indices
      };
      
      const url = `${this.baseUrl}/exchange-index/multiple`;
      const response = await this._fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      return (response.data || []).map(indexData => ({
        indexCode: indexData.indexCode,
        indexName: indexData.indexName || indexData.indexCode,
        currentValue: indexData.indexPoint || 0,
        change: indexData.change || 0,
        percentChange: indexData.percent || 0,
        volume: indexData.totalVol || 0,
        value: indexData.totalVal || 0,
        stats: {
          advances: indexData.advances || 0,
          declines: indexData.declines || 0,
          unchanged: indexData.unchanged || 0
        },
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('[SSI] Error fetching multiple indices:', error);
      throw error;
    }
  }

  /**
   * Get exchange statistics
   * 
   * @param {string} exchange - Exchange code ('hose', 'hnx')
   * @returns {Promise<ExchangeStats>}
   */
  async getExchangeStats(exchange) {
    try {
      const url = `${this.baseUrl}/market-stat/exchange/${exchange.toLowerCase()}`;
      
      const response = await this._fetch(url);
      
      return {
        exchange: exchange.toUpperCase(),
        totalVolume: response.totalVol || 0,
        totalValue: response.totalVal || 0,
        advanceCount: response.advances || 0,
        declineCount: response.declines || 0,
        unchangedCount: response.unchanged || 0,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SSI] Error fetching exchange stats:', error);
      throw error;
    }
  }

  /**
   * Get order book for a stock
   * Note: SSI's API doesn't provide direct order book endpoint in the public API
   * This would require additional integration with real-time data streams
   * 
   * @param {string} symbol - Stock code
   * @returns {Promise<OrderBook>}
   */
  async getOrderBook(symbol) {
    try {
      // Get price table which includes order book levels
      const priceTable = await this.getPriceTable(symbol);
      
      if (!priceTable.stocks || priceTable.stocks.length === 0) {
        throw new Error(`Stock ${symbol} not found`);
      }
      
      const stock = priceTable.stocks[0];
      
      return {
        symbol: symbol,
        bidLevels: stock.bidLevels || [],
        askLevels: stock.askLevels || [],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SSI] Error fetching order book:', error);
      throw error;
    }
  }

  /**
   * Get stock information (name, exchange, type)
   * 
   * @returns {Promise<StockInfo[]>} List of all stocks
   */
  async getStockInfo() {
    try {
      const url = `${this.baseUrl}/stock/stock-info`;
      const response = await this._fetch(url);
      
      return response.data || [];
    } catch (error) {
      console.error('[SSI] Error fetching stock info:', error);
      throw error;
    }
  }

  /**
   * Get system time from SSI server
   * Useful for time synchronization
   * 
   * @returns {Promise<number>} Server timestamp in milliseconds
   */
  async getSystemTime() {
    try {
      const url = `${this.baseUrl}/system/time`;
      const response = await this._fetch(url);
      
      return response.timestamp || Date.now();
    } catch (error) {
      console.error('[SSI] Error fetching system time:', error);
      return Date.now();
    }
  }

  /**
   * Check if SSI API is available
   * 
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
   * 
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Internal HTTP fetch wrapper with error handling
   * Uses background service worker as proxy to bypass CORS
   * 
   * @private
   * @param {string} url - API endpoint URL
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async _fetch(url, options = {}) {
    // Extract endpoint from URL (remove base URL)
    const endpoint = url.replace('https://iboard-query.ssi.com.vn', '');
    
    console.log(`[SSIProvider] Fetching via background proxy: ${endpoint}`);
    
    try {
      // Use background service worker as proxy to bypass CORS with v1 schema
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.CONTENT_EXTRACT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          action: 'fetch_ssi_api',
          endpoint: endpoint
        }
      });
      
      if (!response || response.type === MESSAGE_TYPES.ERROR) {
        throw new Error(response?.error?.message || 'No response from background service worker');
      }
      
      const data = response.payload?.data;
      
      if (!data) {
        throw new Error('No data in response');
      }
      
      // Check for API error response
      if (data.errorCode || data.httpCode >= 400) {
        throw new Error(data.message || `API Error: ${data.errorCode || data.httpCode}`);
      }
      
      return data;
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
