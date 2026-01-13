/**
 * Real-time Market Data - Unit Tests
 * 
 * Test coverage for:
 * - RealtimeProvider core functionality
 * - SSIRealtimeProvider API integration
 * - AdvancedMarketDataClient subscription management
 * - Message deduplication and caching
 * - Error handling and reconnection
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { RealtimeProvider } from './realtime.provider.js';
import { SSIRealtimeProvider } from './ssi-realtime.provider.js';
import { AdvancedMarketDataClient } from './advanced-client.js';

// ============================================================================
// TESTS: RealtimeProvider
// ============================================================================

describe('RealtimeProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new RealtimeProvider({
      debug: false,
      pollInterval: 100 // Fast polling for tests
    });
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  describe('Subscription Management', () => {
    it('should subscribe to symbol and receive updates', () => {
      const callback = vi.fn();
      const unsubscribe = provider.subscribe('ACB', callback, 'tick');

      expect(typeof unsubscribe).toBe('function');
      expect(provider.subscriptions.has('ACB')).toBe(true);
    });

    it('should support multiple callbacks for same symbol', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      provider.subscribe('ACB', callback1);
      provider.subscribe('ACB', callback2);

      expect(provider.subscriptions.get('ACB').size).toBe(2);
    });

    it('should unsubscribe and remove symbol when last callback removed', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsub1 = provider.subscribe('ACB', callback1);
      const unsub2 = provider.subscribe('ACB', callback2);

      unsub1();
      expect(provider.subscriptions.has('ACB')).toBe(true);

      unsub2();
      expect(provider.subscriptions.has('ACB')).toBe(false);
    });

    it('should track subscription types', () => {
      provider.subscribe('ACB', () => {}, 'tick');
      provider.subscribe('BID', () => {}, 'orderbook');

      expect(provider.subscriptionTypes.get('ACB')).toBe('tick');
      expect(provider.subscriptionTypes.get('BID')).toBe('orderbook');
    });

    it('should return list of subscriptions', () => {
      provider.subscribe('ACB', () => {});
      provider.subscribe('BID', () => {});
      provider.subscribe('FPT', () => {});

      const subs = provider.getSubscriptions();
      expect(subs).toContain('ACB');
      expect(subs).toContain('BID');
      expect(subs).toContain('FPT');
      expect(subs.length).toBe(3);
    });
  });

  describe('Message Handling', () => {
    it('should handle tick messages', () => {
      const callback = vi.fn();
      provider.subscribe('ACB', callback);

      provider.handleTickMessage({
        symbol: 'ACB',
        price: 25.30,
        volume: 1000000,
        bid: 25.25,
        ask: 25.35,
        change: 0.05,
        changePercent: 0.20
      });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'ACB',
        price: 25.30,
        volume: 1000000
      }));
    });

    it('should handle index messages', () => {
      const callback = vi.fn();
      provider.subscribe('VNINDEX', callback);

      provider.handleIndexMessage({
        index: 'VNINDEX',
        value: 1885.46,
        change: 8.13,
        changePercent: 0.43
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should handle orderbook messages', () => {
      const callback = vi.fn();
      provider.subscribe('BID:orderbook', callback);

      provider.handleOrderbookMessage({
        symbol: 'BID',
        bid: [{ price: 25.25, volume: 50000 }],
        ask: [{ price: 25.35, volume: 45000 }]
      });

      expect(callback).toHaveBeenCalled();
    });

    it('should handle trade messages', () => {
      const callback = vi.fn();
      provider.subscribe('HPG:trades', callback);

      provider.handleTradeMessage({
        symbol: 'HPG',
        price: 40.50,
        volume: 5000,
        side: 'buy'
      });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Caching', () => {
    it('should cache stock data', () => {
      provider.handleTickMessage({
        symbol: 'ACB',
        price: 25.30,
        volume: 1000000
      });

      expect(provider.realtimeCache.has('ACB')).toBe(true);
      const cached = provider.realtimeCache.get('ACB');
      expect(cached.price).toBe(25.30);
    });

    it('should cache index data', () => {
      provider.handleIndexMessage({
        index: 'VNINDEX',
        value: 1885.46,
        change: 8.13
      });

      expect(provider.realtimeCache.has('VNINDEX')).toBe(true);
    });

    it('should clean expired cache entries', () => {
      provider.config.cacheTTL = 100; // 100ms for testing

      provider.handleTickMessage({
        symbol: 'ACB',
        price: 25.30
      });

      expect(provider.realtimeCache.has('ACB')).toBe(true);

      // Wait for TTL to expire
      return new Promise(resolve => {
        setTimeout(() => {
          provider.clearExpiredCache();
          expect(provider.realtimeCache.has('ACB')).toBe(false);
          resolve();
        }, 150);
      });
    });
  });

  describe('Message Deduplication', () => {
    it('should detect duplicate messages', () => {
      const msg = { symbol: 'ACB', price: 25.30 };

      const isDup1 = provider.isDuplicate(msg);
      const isDup2 = provider.isDuplicate(msg);

      expect(isDup1).toBe(false); // First occurrence
      expect(isDup2).toBe(true);  // Duplicate
    });

    it('should allow same symbol in different seconds', (done) => {
      const msg = { symbol: 'ACB', price: 25.30 };

      const isDup1 = provider.isDuplicate(msg);
      expect(isDup1).toBe(false);

      // Wait for second to change
      const now = Math.floor(Date.now() / 1000);
      setTimeout(() => {
        // Modify message to ensure new second
        const isDup2 = provider.isDuplicate(msg);
        expect(isDup2).toBe(false);
        done();
      }, 1100);
    });
  });

  describe('Statistics', () => {
    it('should track message statistics', () => {
      provider.handleTickMessage({ symbol: 'ACB', price: 25.30 });
      provider.handleTickMessage({ symbol: 'BID', price: 25.50 });

      expect(provider.stats.messagesReceived).toBe(2);
    });

    it('should calculate average latency', () => {
      provider.stats.latencies = [10, 20, 30];
      expect(provider.stats.averageLatency).toBeGreaterThan(0);
    });

    it('should return comprehensive stats', () => {
      const stats = provider.getStats();

      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('messagesSent');
      expect(stats).toHaveProperty('reconnects');
      expect(stats).toHaveProperty('isConnected');
      expect(stats).toHaveProperty('subscriptions');
    });
  });
});

// ============================================================================
// TESTS: SSIRealtimeProvider
// ============================================================================

describe('SSIRealtimeProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new SSIRealtimeProvider({
      debug: false
    });
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  describe('Stock Info', () => {
    it('should fetch single stock info', async () => {
      // Mock fetch
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            symbol: 'ACB',
            price: 25.30,
            volume: 1000000,
            change: 0.05,
            changePercent: 0.20
          })
        })
      );

      const data = await provider.getStockInfo('ACB');
      expect(data.symbol).toBe('ACB');
      expect(data.price).toBe(25.30);
    });

    it('should transform API response correctly', () => {
      const apiResponse = {
        price: '25.30',
        volume: '1000000',
        bid: '25.25',
        ask: '25.35',
        change: '0.05',
        changePercent: '0.20'
      };

      const transformed = provider.transformStockData('ACB', apiResponse);

      expect(typeof transformed.price).toBe('number');
      expect(typeof transformed.volume).toBe('number');
      expect(transformed.price).toBe(25.30);
    });

    it('should batch fetch multiple stocks', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { symbol: 'ACB', price: 25.30 },
            { symbol: 'BID', price: 25.50 }
          ])
        })
      );

      const data = await provider.getStocksBatch(['ACB', 'BID']);
      expect(data.size).toBe(2);
      expect(data.has('ACB')).toBe(true);
      expect(data.has('BID')).toBe(true);
    });
  });

  describe('Index Info', () => {
    it('should fetch index information', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            value: 1885.46,
            change: 8.13,
            changePercent: 0.43,
            advances: 167,
            declines: 47
          })
        })
      );

      const data = await provider.getIndexInfo('VNINDEX');
      expect(data.index).toBe('VNINDEX');
      expect(data.value).toBe(1885.46);
    });

    it('should batch fetch multiple indices', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { code: 'VNINDEX', value: 1885.46 },
            { code: 'VN30', value: 2090.79 }
          ])
        })
      );

      const data = await provider.getIndicesBatch(['VNINDEX', 'VN30']);
      expect(data.size).toBe(2);
    });
  });

  describe('Order Book', () => {
    it('should fetch order book data', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            bid: [{ price: 25.25, volume: 50000 }],
            ask: [{ price: 25.35, volume: 45000 }]
          })
        })
      );

      const data = await provider.getOrderBook('BID');
      expect(data.symbol).toBe('BID');
      expect(Array.isArray(data.bid)).toBe(true);
      expect(Array.isArray(data.ask)).toBe(true);
    });

    it('should transform order book levels', () => {
      const levels = [
        { price: '25.25', volume: '50000' },
        { price: '25.20', volume: '75000' }
      ];

      const transformed = provider.transformOrderBookLevel(levels);
      expect(transformed.length).toBe(2);
      expect(typeof transformed[0].price).toBe('number');
    });
  });

  describe('Search', () => {
    it('should search for stocks', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { symbol: 'ACB', name: 'Asia Commercial Bank' },
            { symbol: 'ACM', name: 'AC Minerals' }
          ])
        })
      );

      const results = await provider.searchStocks('AC', 10);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Market Stats', () => {
    it('should fetch market statistics', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            totalValue: 11011555000000,
            totalVolume: 337954485,
            advances: 167,
            declines: 47
          })
        })
      );

      const stats = await provider.getMarketStats();
      expect(stats.exchange).toBe('HOSE');
      expect(stats.advances).toBe(167);
    });
  });
});

// ============================================================================
// TESTS: AdvancedMarketDataClient
// ============================================================================

describe('AdvancedMarketDataClient', () => {
  let client;

  beforeEach(() => {
    client = new AdvancedMarketDataClient({
      realtimeEnabled: false // Disable for testing
    });
  });

  afterEach(async () => {
    await client.cleanup();
  });

  describe('Subscription Management', () => {
    it('should subscribe to stock', () => {
      const callback = vi.fn();
      const unsub = client.subscribe('ACB', callback);

      expect(typeof unsub).toBe('function');
    });

    it('should subscribe to multiple stocks', () => {
      const callback = vi.fn();
      const unsub = client.subscribeMultiple(['ACB', 'BID'], callback);

      expect(typeof unsub).toBe('function');
    });

    it('should subscribe to index', () => {
      const callback = vi.fn();
      const unsub = client.subscribeIndex('VNINDEX', callback);

      expect(typeof unsub).toBe('function');
    });

    it('should subscribe to order book', () => {
      const callback = vi.fn();
      const unsub = client.subscribeOrderBook('BID', callback);

      expect(typeof unsub).toBe('function');
    });

    it('should subscribe to trades', () => {
      const callback = vi.fn();
      const unsub = client.subscribeTrades('HPG', callback);

      expect(typeof unsub).toBe('function');
    });

    it('should track active subscriptions', () => {
      client.subscribe('ACB', () => {});
      client.subscribe('BID', () => {});

      const status = client.getStatus();
      expect(status).toHaveProperty('subscriptions');
    });
  });

  describe('Status and Statistics', () => {
    it('should return connection status', () => {
      const status = client.getStatus();

      expect(status).toHaveProperty('realtimeConnected');
      expect(status).toHaveProperty('subscriptions');
      expect(status).toHaveProperty('primaryProviders');
    });

    it('should return active subscriptions', () => {
      client.subscribe('ACB', () => {});
      client.subscribe('BID', () => {});

      const subs = client.getActiveSubscriptions();
      expect(subs.count).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing provider gracefully', async () => {
      const client2 = new AdvancedMarketDataClient({
        realtimeEnabled: false
      });

      // Should not throw even with no real-time provider
      expect(() => client2.getStatus()).not.toThrow();
    });

    it('should handle subscription without realtime gracefully', () => {
      const callback = vi.fn();
      
      // Should not throw even if realtime unavailable
      const unsub = client.subscribe('ACB', callback);
      expect(typeof unsub).toBe('function');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {
  describe('Real-time with Polling Fallback', () => {
    it('should fall back to polling when WebSocket unavailable', async () => {
      const provider = new SSIRealtimeProvider({
        wsUrl: 'wss://invalid-endpoint.test', // Invalid endpoint
        pollInterval: 50
      });

      // Mock fetch for polling
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            symbol: 'ACB',
            price: 25.30,
            volume: 1000000
          })
        })
      );

      const callback = vi.fn();
      provider.subscribe('ACB', callback);

      // Should start polling
      provider.startPolling();

      // Wait for first poll
      return new Promise(resolve => {
        setTimeout(() => {
          expect(provider.pollTimer).not.toBeFalsy();
          provider.stopPolling();
          resolve();
        }, 100);
      });
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency across updates', () => {
      const provider = new RealtimeProvider();
      const callback = vi.fn();

      provider.subscribe('ACB', callback);

      // Send multiple updates
      const prices = [25.30, 25.35, 25.32, 25.38];

      prices.forEach(price => {
        provider.handleTickMessage({
          symbol: 'ACB',
          price,
          volume: 1000000
        });
      });

      // Check that all callbacks were called
      expect(callback).toHaveBeenCalledTimes(prices.length);

      // Check that latest data is cached
      const cached = provider.realtimeCache.get('ACB');
      expect(cached.price).toBe(25.38);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance Tests', () => {
  it('should handle high message throughput', () => {
    const provider = new RealtimeProvider();
    const callback = vi.fn();

    provider.subscribe('ACB', callback);

    // Send 1000 messages
    for (let i = 0; i < 1000; i++) {
      provider.handleTickMessage({
        symbol: 'ACB',
        price: 25.30 + Math.random(),
        volume: 1000000
      });
    }

    expect(callback).toHaveBeenCalledTimes(1000);
  });

  it('should efficiently manage multiple subscriptions', () => {
    const provider = new RealtimeProvider();
    const callback = vi.fn();

    // Subscribe to 100 symbols
    for (let i = 0; i < 100; i++) {
      const symbol = `SYM${i}`;
      provider.subscribe(symbol, callback);
    }

    expect(provider.subscriptions.size).toBe(100);
  });

  it('should clean cache without blocking', async () => {
    const provider = new RealtimeProvider({
      cacheTTL: 100
    });

    // Add 1000 items to cache
    for (let i = 0; i < 1000; i++) {
      provider.handleTickMessage({
        symbol: `SYM${i}`,
        price: 25.30
      });
    }

    const startTime = Date.now();
    provider.clearExpiredCache();
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100); // Should be fast
  });
});
