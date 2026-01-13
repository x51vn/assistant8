/**
 * Simple REST Polling Provider
 * Polls market data every 60 seconds via REST API only
 * No WebSocket complexity - keep it simple and reliable
 */

export class RealtimeProvider {
  constructor(config = {}) {
    this.config = {
      fallbackUrl: config.fallbackUrl || 'https://iboard-query.ssi.com.vn',
      pollInterval: config.pollInterval || 60000, // 60 seconds
      cacheTTL: config.cacheTTL || 30000,
      debug: config.debug || false
    };

    // Connection state
    this.connected = false;
    this.pollTimer = null;
    
    // Subscriptions
    this.subscriptions = new Map(); // symbol -> Set of callbacks
    
    // Cache
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    
    // Stats
    this.stats = {
      pollCount: 0,
      errors: 0,
      lastPollTime: 0
    };
  }

  /**
   * Connect - start polling
   */
  async connect() {
    if (this.connected) {
      return;
    }

    this.connected = true;
    this.startPolling();
    this.log('Started REST API polling');
  }

  /**
   * Start REST API polling
   */
  startPolling() {
    if (this.pollTimer) {
      return;
    }

    this.log(`Polling every ${this.config.pollInterval / 1000} seconds`);

    const poll = async () => {
      try {
        await this.pollData();
        this.stats.pollCount++;
        this.stats.lastPollTime = Date.now();
      } catch (error) {
        this.stats.errors++;
        this.log('Polling error', error);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    this.pollTimer = setInterval(poll, this.config.pollInterval);
  }

  /**
   * Poll data for all subscribed symbols
   */
  async pollData() {
    if (this.subscriptions.size === 0) {
      return;
    }

    const symbols = Array.from(this.subscriptions.keys());
    this.log(`Polling ${symbols.length} symbols`);

    // Subclasses should implement actual data fetching
    // For now, just log
    for (const symbol of symbols) {
      try {
        const data = await this.fetchSymbolData(symbol);
        if (data) {
          this.updateCache(symbol, data);
          this.notifySubscribers(symbol, data);
        }
      } catch (error) {
        this.log(`Error fetching ${symbol}`, error);
      }
    }
  }

  /**
   * Fetch data for a symbol - to be implemented by subclasses
   */
  async fetchSymbolData(symbol) {
    throw new Error('fetchSymbolData() must be implemented by subclass');
  }

  /**
   * Update cache
   */
  updateCache(symbol, data) {
    this.cache.set(symbol, data);
    this.cacheTimestamps.set(symbol, Date.now());
  }

  /**
   * Get cached data
   */
  getCache(symbol) {
    const timestamp = this.cacheTimestamps.get(symbol);
    if (!timestamp || (Date.now() - timestamp) > this.config.cacheTTL) {
      return null;
    }
    return this.cache.get(symbol);
  }

  /**
   * Subscribe to symbol updates
   */
  subscribe(symbol, callback) {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol).add(callback);
    
    // Return cached data if available
    const cached = this.getCache(symbol);
    if (cached) {
      callback(cached);
    }

    this.log(`Subscribed to ${symbol}`);
  }

  /**
   * Unsubscribe from symbol updates
   */
  unsubscribe(symbol, callback) {
    const callbacks = this.subscriptions.get(symbol);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(symbol);
      }
    }
    this.log(`Unsubscribed from ${symbol}`);
  }

  /**
   * Notify subscribers of updates
   */
  notifySubscribers(symbol, data) {
    const callbacks = this.subscriptions.get(symbol);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.log(`Error in subscriber callback for ${symbol}`, error);
        }
      });
    }
  }

  /**
   * Disconnect - stop polling
   */
  disconnect() {
    this.connected = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.log('Disconnected - polling stopped');
  }

  /**
   * Debug logging
   */
  log(...args) {
    if (this.config.debug) {
      console.log('[RealtimeProvider]', ...args);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      connected: this.connected,
      subscriptions: this.subscriptions.size,
      cacheSize: this.cache.size
    };
  }
}
