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
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

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
    // Check cache first
    const cached = this.getCachedData(symbol);
    if (cached) {
      this.log(`[SSI] Cache hit for ${symbol}`);
      return cached;
    }

    try {
      // Determine the exchange/group for this symbol
      // Try VN30 first (most liquid stocks), then exchanges, ETFs, and covered warrants
      // Note: ETF symbols may be in 'FUND' group, covered warrants in 'CW'
      const groups = ['VN30', 'HOSE', 'HNX', 'UPCOM', 'FUND', 'CW', 'ETF', 'VN30F1M', 'BOND'];
      
      const triedGroups = [];
      
      for (const group of groups) {
        try {
          this.log(`[SSI] Trying group ${group} for symbol ${symbol}`);
          
          // Use background service worker as proxy to bypass CORS with v1 schema
          const response = await chrome.runtime.sendMessage({
            v: 1,
            type: MESSAGE_TYPES.CONTENT_EXTRACT,
            correlationId: generateCorrelationId(),
            timestamp: Date.now(),
            payload: {
              action: 'fetch_ssi_api',
              endpoint: `/stock/group/${group}`
            }
          });

          triedGroups.push(group);

          if (!response || response.type === MESSAGE_TYPES.ERROR) {
            this.log(`[SSI] Group ${group} returned error, trying next`);
            continue; // Try next group
          }

          // Handler returns: response.payload.data = { code: "SUCCESS", message: "...", data: [...] }
          const apiResponse = response.payload?.data;
          
          if (!apiResponse || !apiResponse.data || !Array.isArray(apiResponse.data)) {
            this.log(`[SSI] Group ${group} has no data array, trying next`);
            continue; // Try next group
          }
          
          // Filter for the specific symbol in the group data
          const stockData = apiResponse.data.find(stock => 
            stock.stockSymbol === symbol || stock.symbol === symbol
          );
          
          if (stockData) {
            // Found the symbol! Transform and return
            this.log(`[SSI] Found ${symbol} in group ${group}`);
            const transformed = this.transformStockData(symbol, stockData);
            
            // Cache the result for future requests
            this.cacheData(symbol, transformed);
            
            return transformed;
          } else {
            this.log(`[SSI] Symbol ${symbol} not found in group ${group} (has ${apiResponse.data.length} stocks)`);
          }
        } catch (error) {
          this.log(`[SSI] Error fetching group ${group}:`, error.message);
          // Continue to next group
          continue;
        }
      }
      
      // Symbol not found in any group - provide helpful error
      const errorMsg = `Symbol ${symbol} not available. Tried groups: ${triedGroups.join(', ')}. This symbol may not be supported by SSI API or may be delisted.`;
      this.log(`[SSI] ${errorMsg}`);
      throw new Error(errorMsg);
    } catch (error) {
      this.log(`[SSI] Error fetching stock info for ${symbol}`, error);
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
