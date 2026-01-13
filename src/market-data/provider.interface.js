/**
 * Base Provider Interface for Market Data
 * 
 * Defines the contract that all market data providers must implement
 * This allows easy extension with additional providers (Fireant, VietStock, etc.)
 */

export class MarketDataProvider {
  /**
   * Get price table data for a specific stock
   * @param {string} symbol - Stock code (e.g., 'ACB', 'VNM')
   * @returns {Promise<StockPriceData>} Stock price and order book data
   */
  async getStockPrice(symbol) {
    throw new Error('getStockPrice not implemented');
  }

  /**
   * Get multiple stocks' price data
   * @param {string[]} symbols - Array of stock codes
   * @returns {Promise<StockPriceData[]>} Array of price data
   */
  async getMultipleStocks(symbols) {
    throw new Error('getMultipleStocks not implemented');
  }

  /**
   * Get price table (bảng giá) for an exchange or group
   * @param {string} filter - Filter type ('VN30', 'HNX30', 'HOSE', 'HNX', 'UPCOM', etc.)
   * @returns {Promise<PriceTableData>} Price table data with multiple stocks
   */
  async getPriceTable(filter) {
    throw new Error('getPriceTable not implemented');
  }

  /**
   * Get exchange index data (VNINDEX, VN30, HNX30, etc.)
   * @param {string} indexCode - Index code
   * @param {boolean} includeHistory - Include historical data
   * @returns {Promise<IndexData>} Index data with current value and change
   */
  async getIndexData(indexCode, includeHistory = false) {
    throw new Error('getIndexData not implemented');
  }

  /**
   * Get multiple indices at once
   * @param {string[]} indices - Array of index codes
   * @returns {Promise<IndexData[]>} Array of index data
   */
  async getMultipleIndices(indices) {
    throw new Error('getMultipleIndices not implemented');
  }

  /**
   * Get market statistics for an exchange
   * @param {string} exchange - Exchange code ('hose', 'hnx')
   * @returns {Promise<ExchangeStats>} Exchange statistics
   */
  async getExchangeStats(exchange) {
    throw new Error('getExchangeStats not implemented');
  }

  /**
   * Get order book depth for a stock
   * @param {string} symbol - Stock code
   * @returns {Promise<OrderBook>} Order book data (buy/sell levels)
   */
  async getOrderBook(symbol) {
    throw new Error('getOrderBook not implemented');
  }

  /**
   * Get provider name
   * @returns {string} Provider name (e.g., 'SSI', 'Fireant', 'VietStock')
   */
  getName() {
    throw new Error('getName not implemented');
  }

  /**
   * Check if provider is available/connected
   * @returns {Promise<boolean>} Provider availability status
   */
  async isAvailable() {
    throw new Error('isAvailable not implemented');
  }
}

/**
 * Type definitions for market data responses
 */

/**
 * Stock price and order book data
 * @typedef {Object} StockPriceData
 * @property {string} symbol - Stock code
 * @property {string} name - Stock name
 * @property {string} exchange - Exchange code (HOSE, HNX, UPCOM)
 * @property {number} currentPrice - Current price
 * @property {number} change - Price change (absolute)
 * @property {number} percentChange - Price change percentage
 * @property {number} ceiling - Ceiling price
 * @property {number} floor - Floor price
 * @property {number} openPrice - Open price
 * @property {number} highPrice - High price
 * @property {number} lowPrice - Low price
 * @property {number} volume - Trading volume (in shares)
 * @property {number} value - Trading value (in VND)
 * @property {OrderLevel[]} bidLevels - Buy orders (3 levels)
 * @property {OrderLevel[]} askLevels - Sell orders (3 levels)
 * @property {ForeignInvestor} foreignInvestor - Foreign investor buy/sell volume
 * @property {number} timestamp - Data timestamp
 */

/**
 * Order level in order book
 * @typedef {Object} OrderLevel
 * @property {number} price - Price at this level
 * @property {number} volume - Volume at this level (in shares)
 */

/**
 * Foreign investor data
 * @typedef {Object} ForeignInvestor
 * @property {number} buyVolume - Foreign buy volume
 * @property {number} sellVolume - Foreign sell volume
 */

/**
 * Price table containing multiple stocks
 * @typedef {Object} PriceTableData
 * @property {string} filterType - Filter type applied
 * @property {StockPriceData[]} stocks - Array of stocks in the table
 * @property {number} timestamp - Data timestamp
 */

/**
 * Index data (VNINDEX, VN30, HNX30, etc.)
 * @typedef {Object} IndexData
 * @property {string} indexCode - Index code
 * @property {string} indexName - Index name (Vietnamese)
 * @property {number} currentValue - Current index value
 * @property {number} change - Change (absolute)
 * @property {number} percentChange - Change percentage
 * @property {number} volume - Total volume
 * @property {number} value - Total value (in billions VND)
 * @property {IndexStats} stats - Statistics (advances, declines, unchanged)
 * @property {number[]} history - Historical values (if requested)
 * @property {number} timestamp - Data timestamp
 */

/**
 * Index statistics
 * @typedef {Object} IndexStats
 * @property {number} advances - Number of advancing stocks
 * @property {number} declines - Number of declining stocks
 * @property {number} unchanged - Number of unchanged stocks
 */

/**
 * Exchange statistics
 * @typedef {Object} ExchangeStats
 * @property {string} exchange - Exchange code
 * @property {number} totalVolume - Total trading volume
 * @property {number} totalValue - Total trading value (in billions VND)
 * @property {number} advanceCount - Number of advancing stocks
 * @property {number} declineCount - Number of declining stocks
 * @property {number} unchangedCount - Number of unchanged stocks
 * @property {number} timestamp - Data timestamp
 */

/**
 * Full order book for a stock
 * @typedef {Object} OrderBook
 * @property {string} symbol - Stock code
 * @property {OrderLevel[]} bidLevels - All buy orders
 * @property {OrderLevel[]} askLevels - All sell orders
 * @property {number} timestamp - Data timestamp
 */
