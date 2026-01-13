/**
 * SSI Real-time Provider
 * REST API polling implementation for SSI iBoard market data
 * 
 * Uses REST polling every 60 seconds for price updates
 * Simple and reliable without WebSocket complexity
 * 
 * API Endpoint: https://iboard-query.ssi.com.vn
 */

import { RealtimeProvider } from './realtime.provider.js';

class SSIRealtimeProvider extends RealtimeProvider {
  constructor(config = {}) {
    super({
      fallbackUrl: config.fallbackUrl || 'https://iboard-query.ssi.com.vn',
      pollInterval: config.pollInterval || 60000, // Poll every 60 seconds
      cacheTTL: config.cacheTTL || 30000,
      debug: config.debug || false
    });

    this.baseUrl = this.config.fallbackUrl;
  }

  /**
   * Implement fetchSymbolData for the base class
   * Fetches data for a single symbol from SSI API
   */
  async fetchSymbolData(symbol) {
    return await this.getStockInfo(symbol);
  }

  /**
   * Get stock information from SSI API
   * Data structure example:
   * {
   *   symbol: "ACB",
   *   price: 25.30,
   *   volume: 4390700,
   *   bid: 25.25,
   *   ask: 25.35,
   *   change: -0.10,
   *   changePercent: -0.39,
   *   high: 25.50,
   *   low: 25.00,
   *   open: 25.40,
   *   foreignBuy: 184689,
   *   foreignSell: 823872,
   *   totalValue: 111234567890
   * }
   */
  async getStockInfo(symbol) {
    try {
      // Use background service worker as proxy to bypass CORS
      const response = await chrome.runtime.sendMessage({
        action: 'fetch_ssi_api',
        endpoint: `/stock/${symbol}`
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'API request failed');
      }

      // API returns: { code: "SUCCESS", message: "...", data: {...} }
      // Actual stock data is in response.data.data
      const apiData = response.data;
      const stockData = apiData.data || apiData; // Handle both structures
      
      return this.transformStockData(symbol, stockData);
    } catch (error) {
      this.log(`Error fetching stock info for ${symbol}`, error);
      throw error;
    }
  }



  /**
   * Transform SSI API response to standard format
   * Based on actual API response structure from /stock/group/VN30
   * 
   * Key mappings (verified from real data):
   * - matchedPrice: Current matched price (MAIN PRICE)
   * - priceChange: Price change from reference
   * - priceChangePercent: % change
   * - nmTotalTradedQty: Total traded quantity
   * - nmTotalTradedValue: Total traded value
   * - highest/lowest/openPrice: High/Low/Open
   * - best1Bid/best1Offer: Best bid/ask prices
   * - best1BidVol/best1OfferVol: Best bid/ask volumes
   */
  transformStockData(symbol, data) {
    return {
      symbol: symbol || data.stockSymbol || data.symbol,
      
      // MAIN PRICE - matchedPrice is the current price
      price: parseFloat(data.matchedPrice || data.lastPrice || data.close || 0),
      
      // Volume data
      volume: parseInt(data.nmTotalTradedQty || data.matchedVolume || data.totalVolume || 0),
      totalValue: parseFloat(data.nmTotalTradedValue || data.totalValue || 0),
      
      // Bid/Ask
      bid: parseFloat(data.best1Bid || data.bid || 0),
      ask: parseFloat(data.best1Offer || data.ask || 0),
      bidVolume: parseInt(data.best1BidVol || data.bidVolume || 0),
      askVolume: parseInt(data.best1OfferVol || data.askVolume || 0),
      
      // Price changes
      change: parseFloat(data.priceChange || data.change || 0),
      changePercent: parseFloat(data.priceChangePercent || data.changePercent || 0),
      
      // High/Low/Open
      high: parseFloat(data.highest || data.high || 0),
      low: parseFloat(data.lowest || data.low || 0),
      open: parseFloat(data.openPrice || data.open || 0),
      close: parseFloat(data.priorClosePrice || data.refPrice || data.close || 0),
      
      // Reference prices
      ceiling: parseFloat(data.ceiling || 0),
      floor: parseFloat(data.floor || 0),
      refPrice: parseFloat(data.refPrice || 0),
      
      // Foreign trading
      foreignBuy: parseInt(data.buyForeignQtty || data.foreignBuy || 0),
      foreignSell: parseInt(data.sellForeignQtty || data.foreignSell || 0),
      
      // Timestamp
      timestamp: data.expectedLastUpdate || data.timestamp || Date.now()
    };
  }
}

export { SSIRealtimeProvider };
