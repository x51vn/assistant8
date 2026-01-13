/**
 * Market Data Client
 * 
 * Unified interface for accessing market data from multiple providers
 * Supports provider switching, caching, and fallback mechanisms
 */

export class MarketDataClient {
  constructor(providers = []) {
    /**
     * Array of market data providers in priority order
     * @type {MarketDataProvider[]}
     */
    this.providers = providers;
    
    /**
     * Cache for market data to reduce API calls
     * @type {Map<string, CachedData>}
     */
    this.cache = new Map();
    
    /**
     * Cache TTL in milliseconds (default 30 seconds)
     * @type {number}
     */
    this.cacheTTL = 30000;
    
    /**
     * Enable/disable caching
     * @type {boolean}
     */
    this.cacheEnabled = true;

    /**
     * Current active provider
     * @type {MarketDataProvider|null}
     */
    this.activeProvider = null;
  }

  /**
   * Add a provider to the client
   * 
   * @param {MarketDataProvider} provider - Provider instance
   * @param {boolean} makeActive - Set as active provider
   */
  addProvider(provider, makeActive = false) {
    this.providers.push(provider);
    if (makeActive || this.activeProvider === null) {
      this.activeProvider = provider;
    }
  }

  /**
   * Set which provider to use (by name)
   * 
   * @param {string} providerName - Provider name
   * @returns {boolean} True if provider was found and set
   */
  setActiveProvider(providerName) {
    const provider = this.providers.find(p => p.getName() === providerName);
    if (provider) {
      this.activeProvider = provider;
      return true;
    }
    return false;
  }

  /**
   * Get list of available providers
   * 
   * @returns {string[]} Array of provider names
   */
  getAvailableProviders() {
    return this.providers.map(p => p.getName());
  }

  /**
   * Get stock price with fallback to multiple providers
   * 
   * @param {string} symbol - Stock code
   * @param {Object} options - Options
   * @returns {Promise<StockPriceData>}
   */
  async getStockPrice(symbol, options = {}) {
    const cacheKey = `stock:${symbol}`;
    
    // Check cache first
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    // Try active provider first, then fallback to others
    const providersToTry = this.activeProvider 
      ? [this.activeProvider, ...this.providers.filter(p => p !== this.activeProvider)]
      : this.providers;

    for (const provider of providersToTry) {
      try {
        console.log(`[MarketDataClient] Fetching ${symbol} from ${provider.getName()}`);
        const data = await provider.getStockPrice(symbol);
        
        // Cache the result
        this._setCached(cacheKey, data);
        
        return data;
      } catch (error) {
        console.warn(`[MarketDataClient] ${provider.getName()} failed:`, error.message);
        // Continue to next provider
      }
    }

    throw new Error(`Could not fetch stock price for ${symbol} from any provider`);
  }

  /**
   * Get multiple stocks' prices
   * 
   * @param {string[]} symbols - Array of stock codes
   * @param {Object} options - Options
   * @returns {Promise<StockPriceData[]>}
   */
  async getMultipleStocks(symbols, options = {}) {
    try {
      if (!this.activeProvider) {
        throw new Error('No active provider set');
      }

      const data = await this.activeProvider.getMultipleStocks(symbols);
      
      // Cache each stock individually
      data.forEach(stock => {
        this._setCached(`stock:${stock.symbol}`, stock);
      });
      
      return data;
    } catch (error) {
      console.error('[MarketDataClient] Error fetching multiple stocks:', error);
      throw error;
    }
  }

  /**
   * Get price table (bảng giá)
   * 
   * @param {string} filter - Filter type (e.g., 'VN30', 'HOSE')
   * @param {Object} options - Options
   * @returns {Promise<PriceTableData>}
   */
  async getPriceTable(filter = 'VN30', options = {}) {
    const cacheKey = `table:${filter}`;
    
    // Check cache
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      if (!this.activeProvider) {
        throw new Error('No active provider set');
      }

      const data = await this.activeProvider.getPriceTable(filter);
      
      // Cache the result
      this._setCached(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('[MarketDataClient] Error fetching price table:', error);
      throw error;
    }
  }

  /**
   * Get index data
   * 
   * @param {string} indexCode - Index code (e.g., 'VNINDEX')
   * @param {Object} options - Options
   * @returns {Promise<IndexData>}
   */
  async getIndexData(indexCode, options = {}) {
    const cacheKey = `index:${indexCode}`;
    
    // Check cache
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      if (!this.activeProvider) {
        throw new Error('No active provider set');
      }

      const data = await this.activeProvider.getIndexData(
        indexCode,
        options.includeHistory || false
      );
      
      // Cache the result
      this._setCached(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('[MarketDataClient] Error fetching index data:', error);
      throw error;
    }
  }

  /**
   * Get multiple indices
   * 
   * @param {string[]} indices - Array of index codes
   * @param {Object} options - Options
   * @returns {Promise<IndexData[]>}
   */
  async getMultipleIndices(indices, options = {}) {
    try {
      if (!this.activeProvider) {
        throw new Error('No active provider set');
      }

      const data = await this.activeProvider.getMultipleIndices(indices);
      
      // Cache each index individually
      data.forEach(index => {
        this._setCached(`index:${index.indexCode}`, index);
      });
      
      return data;
    } catch (error) {
      console.error('[MarketDataClient] Error fetching multiple indices:', error);
      throw error;
    }
  }

  /**
   * Get exchange statistics
   * 
   * @param {string} exchange - Exchange code
   * @param {Object} options - Options
   * @returns {Promise<ExchangeStats>}
   */
  async getExchangeStats(exchange, options = {}) {
    const cacheKey = `exchange:${exchange}`;
    
    // Check cache
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      if (!this.activeProvider) {
        throw new Error('No active provider set');
      }

      const data = await this.activeProvider.getExchangeStats(exchange);
      
      // Cache the result
      this._setCached(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('[MarketDataClient] Error fetching exchange stats:', error);
      throw error;
    }
  }

  /**
   * Get order book for a stock
   * 
   * @param {string} symbol - Stock code
   * @param {Object} options - Options
   * @returns {Promise<OrderBook>}
   */
  async getOrderBook(symbol, options = {}) {
    try {
      if (!this.activeProvider) {
        throw new Error('No active provider set');
      }

      return await this.activeProvider.getOrderBook(symbol);
    } catch (error) {
      console.error('[MarketDataClient] Error fetching order book:', error);
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    console.log('[MarketDataClient] Cache cleared');
  }

  /**
   * Clear cache for specific key
   * 
   * @param {string} key - Cache key to clear
   */
  clearCacheKey(key) {
    this.cache.delete(key);
  }

  /**
   * Get cache statistics
   * 
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.cacheEnabled,
      ttl: this.cacheTTL
    };
  }

  /**
   * Internal: Get cached data if valid
   * 
   * @private
   * @param {string} key - Cache key
   * @returns {any} Cached data or null if expired
   */
  _getCached(key) {
    if (!this.cacheEnabled) return null;
    
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Internal: Set cache data
   * 
   * @private
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  _setCached(key, data) {
    if (!this.cacheEnabled) return;
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

/**
 * Factory function to create market data client with multiple providers
 * 
 * @param {MarketDataProvider[]} providers - Array of providers
 * @returns {MarketDataClient}
 */
export function createMarketDataClient(providers = []) {
  const client = new MarketDataClient(providers);
  if (providers.length > 0) {
    client.activeProvider = providers[0];
  }
  return client;
}
