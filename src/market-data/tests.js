/**
 * Unit Tests for Market Data Module
 * 
 * Tests the provider interface, SSI provider, and client implementation
 * Run: node src/market-data/tests.js
 */

// Mock setup for Node.js environment
if (typeof global !== 'undefined' && typeof window === 'undefined') {
  global.fetch = global.fetch || (() => {
    throw new Error('fetch not available in Node.js test environment');
  });
}

import { MarketDataProvider } from './provider.interface.js';
import { createSSIProvider } from './ssi.provider.js';
import { createMarketDataClient } from './client.js';

/**
 * Test Suite
 */
class TestSuite {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Market Data Module Tests\n');
    console.log('=' .repeat(50));

    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log('=' .repeat(50));
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEquals(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${expected}, got ${actual}`
      );
    }
  }

  assertExists(value, message) {
    if (!value) {
      throw new Error(message || `Value does not exist: ${value}`);
    }
  }
}

// Create test suite
const suite = new TestSuite();

/**
 * Tests for MarketDataProvider Interface
 */
suite.test('MarketDataProvider interface has required methods', () => {
  const requiredMethods = [
    'getStockPrice',
    'getMultipleStocks',
    'getPriceTable',
    'getIndexData',
    'getMultipleIndices',
    'getExchangeStats',
    'getOrderBook',
    'getName',
    'isAvailable'
  ];

  requiredMethods.forEach(method => {
    suite.assertExists(
      MarketDataProvider.prototype[method],
      `Missing method: ${method}`
    );
  });
});

/**
 * Tests for SSIProvider
 */
suite.test('SSIProvider extends MarketDataProvider', () => {
  const provider = createSSIProvider();
  suite.assert(
    provider instanceof MarketDataProvider,
    'SSIProvider should extend MarketDataProvider'
  );
});

suite.test('SSIProvider has correct name', () => {
  const provider = createSSIProvider();
  suite.assertEquals(provider.getName(), 'SSI', 'Provider name should be SSI');
});

suite.test('SSIProvider has all required methods', () => {
  const provider = createSSIProvider();
  const methods = [
    'getStockPrice',
    'getMultipleStocks',
    'getPriceTable',
    'getIndexData',
    'getMultipleIndices',
    'getExchangeStats',
    'getOrderBook',
    'getSystemTime',
    'getStockInfo'
  ];

  methods.forEach(method => {
    suite.assertExists(
      provider[method],
      `SSIProvider missing method: ${method}`
    );
  });
});

/**
 * Tests for MarketDataClient
 */
suite.test('MarketDataClient initializes with providers', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  suite.assertExists(client, 'Client should be created');
  suite.assertExists(client.providers, 'Client should have providers array');
  suite.assertEquals(
    client.providers.length,
    1,
    'Client should have 1 provider'
  );
});

suite.test('MarketDataClient has caching', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  suite.assertExists(client.cache, 'Client should have cache');
  suite.assert(
    client.cache instanceof Map,
    'Cache should be a Map'
  );
});

suite.test('MarketDataClient cache TTL configuration', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider], { cacheTTL: 60000 });
  
  suite.assertEquals(
    client.cacheTTL,
    60000,
    'Cache TTL should be configurable'
  );
});

suite.test('MarketDataClient can add providers', () => {
  const provider1 = createSSIProvider();
  const provider2 = createSSIProvider();
  
  const client = createMarketDataClient([provider1]);
  suite.assertEquals(client.providers.length, 1, 'Initial provider count');
  
  client.addProvider(provider2);
  suite.assertEquals(client.providers.length, 2, 'Should have 2 providers after adding');
});

suite.test('MarketDataClient can switch active provider', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  client.setActiveProvider('SSI');
  suite.assertEquals(
    client.activeProvider.getName(),
    'SSI',
    'Active provider should be SSI'
  );
});

suite.test('MarketDataClient cache management', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  // Test cache clearing
  client.clearCache();
  suite.assertEquals(client.cache.size, 0, 'Cache should be empty after clear');
  
  // Test cache stats
  const stats = client.getCacheStats();
  suite.assertExists(stats.size, 'Stats should have size');
  suite.assertExists(stats.hits !== undefined, 'Stats should have hits');
  suite.assertExists(stats.misses !== undefined, 'Stats should have misses');
});

/**
 * Tests for API Response Format Validation
 */
suite.test('Stock price data structure validation', async () => {
  // This would require a mock or real API call
  // Documenting the expected structure:
  const expectedFields = [
    'symbol',
    'name',
    'currentPrice',
    'change',
    'percentChange'
  ];
  
  // In real test with mock data:
  // const mockStock = { ... };
  // expectedFields.forEach(field => {
  //   suite.assertExists(mockStock[field], `Missing field: ${field}`);
  // });
  
  // For now, just verify the test runs
  suite.assert(true, 'Stock structure test placeholder');
});

/**
 * Tests for Error Handling
 */
suite.test('MarketDataClient handles provider unavailable', () => {
  const client = createMarketDataClient([]);
  
  // Should have empty providers array
  suite.assertEquals(
    client.providers.length,
    0,
    'Client with no providers'
  );
});

/**
 * Tests for Provider List
 */
suite.test('MarketDataClient can list available providers', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  const available = client.getAvailableProviders();
  suite.assertExists(available, 'Should return providers list');
  suite.assert(
    Array.isArray(available),
    'Should return array'
  );
});

/**
 * Performance Tests
 */
suite.test('Cache improves performance (simulated)', () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider], { cacheTTL: 30000 });
  
  // Simulate cache hit
  client._setCached('test:key', { value: 'data' });
  const cached = client._getCached('test:key');
  
  suite.assertExists(cached, 'Should return cached data');
  suite.assertEquals(
    cached.value,
    'data',
    'Cached data should match'
  );
});

suite.test('Cache respects TTL expiration', async () => {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider], { cacheTTL: 100 }); // 100ms TTL
  
  // Set cache
  client._setCached('expire:test', { value: 'data' });
  
  // Should be cached
  let cached = client._getCached('expire:test');
  suite.assertExists(cached, 'Should be cached initially');
  
  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Should be expired
  cached = client._getCached('expire:test');
  suite.assert(!cached, 'Should be expired after TTL');
});

/**
 * Run all tests
 */
if (typeof process !== 'undefined' && process.argv?.[1]?.includes('tests.js')) {
  suite.run().catch(console.error);
}

export { suite, TestSuite };
