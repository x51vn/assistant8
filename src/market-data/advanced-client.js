/**
 * Advanced Market Data Client
 * Unified interface supporting real-time streaming and REST polling
 * 
 * Features:
 * - Automatic provider selection (realtime preferred, fallback to REST)
 * - Real-time subscriptions with callbacks
 * - Batch operations for efficiency
 * - Caching with TTL
 * - Error handling and retries
 * - Multi-provider support
 */

import { MarketDataClient } from './client.js';
import { SSIRealtimeProvider } from './ssi-realtime.provider.js';

class AdvancedMarketDataClient extends MarketDataClient {
  constructor(config = {}) {
    // Initialize with REST provider as fallback
    super(config);
    
    this.realtimeConfig = {
      enabled: config.realtimeEnabled !== false,
      provider: config.realtimeProvider || new SSIRealtimeProvider(config),
      usePrimaryOnly: config.usePrimaryOnly || false,
      minUpdateInterval: config.minUpdateInterval || 500, // ms
    };

    this.realtimeProvider = null;
    this.subscriptions = new Map(); // symbol -> { callback, type }
    this.isRealtimeConnected = false;
    this.lastUpdateTimes = new Map(); // symbol -> timestamp
    this.realtimeStats = {
      subscribedSymbols: 0,
      activeSubscriptions: 0,
      messagesReceived: 0,
      averageLatency: 0
    };

    // Initialize realtime provider if enabled
    if (this.realtimeConfig.enabled) {
      this.initRealtimeProvider();
    }
  }

  /**
   * Initialize the realtime provider
   */
  async initRealtimeProvider() {
    try {
      this.realtimeProvider = this.realtimeConfig.provider;
      await this.realtimeProvider.connect();
      this.isRealtimeConnected = true;
      console.log('Advanced Market Data Client: Realtime provider connected');
    } catch (error) {
      console.error('Failed to connect realtime provider:', error);
      this.isRealtimeConnected = false;
      // Fall back to REST API
    }
  }

  /**
   * Subscribe to real-time updates for a symbol
   * @param {string} symbol - Stock symbol (e.g., 'ACB')
   * @param {Function} callback - Callback function(data)
   * @param {string} type - Subscription type: 'tick', 'orderbook', 'trades'
   * @returns {Function} Unsubscribe function
   * 
   * Example:
   * const unsubscribe = client.subscribe('ACB', (data) => {
   *   console.log(`ACB: ${data.price} (${data.changePercent}%)`);
   * }, 'tick');
   */
  subscribe(symbol, callback, type = 'tick') {
    if (!this.isRealtimeConnected) {
      console.warn(`Realtime not available for ${symbol}, falling back to polling`);
      // Implement polling fallback
      return this.subscribePoll(symbol, callback);
    }

    const key = `${symbol}:${type}`;
    this.subscriptions.set(key, { callback, type, symbol });

    try {
      const unsubscribeRealtime = this.realtimeProvider.subscribe(
        symbol,
        callback,
        type
      );

      // Return unsubscribe function
      return () => {
        this.subscriptions.delete(key);
        unsubscribeRealtime();
      };
    } catch (error) {
      console.error(`Error subscribing to ${symbol}:`, error);
      return () => {}; // No-op unsubscribe
    }
  }

  /**
   * Subscribe with polling fallback
   */
  subscribePoll(symbol, callback) {
    const pollInterval = this.realtimeConfig.minUpdateInterval;
    
    const poll = async () => {
      try {
        const data = await this.getStockInfo(symbol);
        const now = Date.now();
        const lastUpdate = this.lastUpdateTimes.get(symbol) || 0;

        // Respect minimum update interval
        if (now - lastUpdate >= pollInterval) {
          callback(data);
          this.lastUpdateTimes.set(symbol, now);
        }
      } catch (error) {
        console.error(`Error polling ${symbol}:`, error);
      }
    };

    const interval = setInterval(poll, pollInterval);
    
    return () => clearInterval(interval);
  }

  /**
   * Subscribe to multiple symbols at once
   */
  subscribeMultiple(symbols, callback, type = 'tick') {
    const unsubscribers = symbols.map(symbol => 
      this.subscribe(symbol, callback, type)
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Subscribe to index real-time updates
   */
  subscribeIndex(indexCode, callback) {
    if (!this.isRealtimeConnected) {
      console.warn(`Realtime not available for ${indexCode}`);
      return () => {};
    }

    return this.realtimeProvider.subscribe(indexCode, callback, 'index');
  }

  /**
   * Subscribe to order book updates
   */
  subscribeOrderBook(symbol, callback, depth = 5) {
    if (!this.isRealtimeConnected) {
      console.warn(`Realtime not available for orderbook:${symbol}`);
      return () => {};
    }

    return this.realtimeProvider.subscribe(
      `${symbol}:orderbook`,
      callback,
      'orderbook'
    );
  }

  /**
   * Subscribe to trade updates
   */
  subscribeTrades(symbol, callback) {
    if (!this.isRealtimeConnected) {
      console.warn(`Realtime not available for trades:${symbol}`);
      return () => {};
    }

    return this.realtimeProvider.subscribe(
      `${symbol}:trades`,
      callback,
      'trades'
    );
  }

  /**
   * Get current subscriptions
   */
  getActiveSubscriptions() {
    return {
      count: this.subscriptions.size,
      subscriptions: Array.from(this.subscriptions.entries()).map(([key, data]) => ({
        key,
        symbol: data.symbol,
        type: data.type
      })),
      realtime: this.isRealtimeConnected ? 
        this.realtimeProvider.getStats() : 
        null
    };
  }

  /**
   * Override getStockInfo to check realtime cache first
   */
  async getStockInfo(symbol) {
    if (this.isRealtimeConnected) {
      try {
        return await this.realtimeProvider.getStockInfo(symbol);
      } catch (error) {
        console.warn(`Realtime getStockInfo failed for ${symbol}:`, error);
      }
    }

    // Fallback to REST provider
    return super.getStockInfo(symbol);
  }

  /**
   * Get multiple stocks with realtime support
   */
  async getStockInfoBatch(symbols) {
    if (this.isRealtimeConnected && this.realtimeProvider.getStocksBatch) {
      try {
        const results = await this.realtimeProvider.getStocksBatch(symbols);
        // Convert Map to object if needed
        return results instanceof Map ? 
          Object.fromEntries(results) : 
          results;
      } catch (error) {
        console.warn('Realtime batch failed:', error);
      }
    }

    // Fallback: fetch from REST provider
    const results = {};
    for (const symbol of symbols) {
      try {
        results[symbol] = await this.getStockInfo(symbol);
      } catch (error) {
        console.warn(`Error fetching ${symbol}:`, error);
      }
    }
    return results;
  }

  /**
   * Override getIndexInfo to check realtime cache
   */
  async getIndexInfo(indexCode) {
    if (this.isRealtimeConnected && this.realtimeProvider.getIndexInfo) {
      try {
        return await this.realtimeProvider.getIndexInfo(indexCode);
      } catch (error) {
        console.warn(`Realtime getIndexInfo failed:`, error);
      }
    }

    // Fallback to REST provider
    return super.getIndexInfo(indexCode);
  }

  /**
   * Get multiple indices with realtime support
   */
  async getIndicesBatch(indices) {
    if (this.isRealtimeConnected && this.realtimeProvider.getIndicesBatch) {
      try {
        const results = await this.realtimeProvider.getIndicesBatch(indices);
        return results instanceof Map ? 
          Object.fromEntries(results) : 
          results;
      } catch (error) {
        console.warn('Realtime indices batch failed:', error);
      }
    }

    // Fallback
    const results = {};
    for (const index of indices) {
      try {
        results[index] = await this.getIndexInfo(index);
      } catch (error) {
        console.warn(`Error fetching ${index}:`, error);
      }
    }
    return results;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      realtimeConnected: this.isRealtimeConnected,
      realtimeProvider: this.realtimeProvider ? this.realtimeProvider.name : null,
      subscriptions: this.subscriptions.size,
      stats: this.isRealtimeConnected ? 
        this.realtimeProvider.getStats() : 
        null,
      primaryProviders: this.providers.map(p => ({
        name: p.name,
        type: p.constructor.name
      }))
    };
  }

  /**
   * Disconnect realtime provider
   */
  async disconnect() {
    if (this.realtimeProvider) {
      await this.realtimeProvider.disconnect();
      this.isRealtimeConnected = false;
    }
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    await this.disconnect();
    this.subscriptions.clear();
    this.lastUpdateTimes.clear();
  }
}

export { AdvancedMarketDataClient };
