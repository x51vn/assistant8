/**
 * Commodity Data Providers - Registry & Auto-discovery
 * 
 * Similar to market-data/index.js but for commodities (gold, crypto)
 * Provides unified access to multiple commodity price providers.
 * 
 * Provider Priority:
 * - Gold: BTMC (primary) → GiaVang (fallback)
 * - Crypto: CoinGecko (primary) → Binance (fallback)
 * 
 * To add a new provider:
 * 1. Create {name}.provider.js implementing CommodityDataProvider
 * 2. Add to COMMODITY_PROVIDER_REGISTRY below
 */

import { BTMCGoldProvider } from './gold.provider.js';
import { CoinGeckoProvider, BinanceProvider } from './crypto.provider.js';

// Re-export interfaces and utilities
export { 
  CommodityDataProvider,
  GOLD_UNITS,
  convertGoldUnit,
  calculateGoldValue,
  getPricePerUnit
} from './provider.interface.js';

// Re-export providers
export { BTMCGoldProvider } from './gold.provider.js';
export { CoinGeckoProvider, BinanceProvider } from './crypto.provider.js';

/**
 * Commodity Provider Registry
 * 
 * @typedef {Object} CommodityProviderConfig
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {'gold' | 'crypto'} type - Provider type
 * @property {number} priority - Lower = tried first
 * @property {Function} factory - Factory function to create instance
 */

export const COMMODITY_PROVIDER_REGISTRY = [
  // Gold providers
  {
    id: 'btmc',
    name: 'BTMC',
    type: 'gold',
    priority: 1,
    factory: (options) => new BTMCGoldProvider(options)
  },
  
  // Crypto providers
  {
    id: 'coingecko',
    name: 'CoinGecko',
    type: 'crypto',
    priority: 1,
    factory: (options) => new CoinGeckoProvider(options)
  },
  {
    id: 'binance',
    name: 'Binance',
    type: 'crypto',
    priority: 2,
    factory: (options) => new BinanceProvider(options)
  }
];

/**
 * Get all providers of a specific type
 * @param {'gold' | 'crypto'} type - Provider type
 * @param {Object} options - Options to pass to factories
 * @returns {CommodityDataProvider[]}
 */
export function getProvidersByType(type, options = {}) {
  return COMMODITY_PROVIDER_REGISTRY
    .filter(config => config.type === type)
    .sort((a, b) => a.priority - b.priority)
    .map(config => {
      try {
        return config.factory(options);
      } catch (error) {
        console.error(`[commodity-data] Failed to create provider ${config.name}:`, error);
        return null;
      }
    })
    .filter(p => p !== null);
}

/**
 * Create all commodity providers
 * @param {Object} options
 * @returns {{ gold: CommodityDataProvider[], crypto: CommodityDataProvider[] }}
 */
export function createAllCommodityProviders(options = {}) {
  return {
    gold: getProvidersByType('gold', options),
    crypto: getProvidersByType('crypto', options)
  };
}

/**
 * Get provider registry for inspection
 * @returns {CommodityProviderConfig[]}
 */
export function getCommodityProviderRegistry() {
  return [...COMMODITY_PROVIDER_REGISTRY];
}

/**
 * Commodity Data Client
 * 
 * Unified interface for fetching gold and crypto prices
 * with automatic failover between providers.
 */
export class CommodityDataClient {
  constructor(options = {}) {
    const providers = createAllCommodityProviders(options);
    this.goldProviders = providers.gold;
    this.cryptoProviders = providers.crypto;
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 1 minute
  }

  /**
   * Get gold price with failover
   * @param {string} [goldType] - Type of gold (e.g., 'SJC', '9999')
   * @returns {Promise<GoldPriceData>}
   */
  async getGoldPrice(goldType) {
    for (const provider of this.goldProviders) {
      try {
        console.log(`[CommodityClient] Fetching gold from ${provider.getName()}`);
        return await provider.getGoldPrice(goldType);
      } catch (error) {
        console.warn(`[CommodityClient] ${provider.getName()} failed:`, error.message);
      }
    }
    throw new Error('Could not fetch gold price from any provider');
  }

  /**
   * Get all gold prices with failover
   * @returns {Promise<GoldPriceData[]>}
   */
  async getAllGoldPrices() {
    for (const provider of this.goldProviders) {
      try {
        console.log(`[CommodityClient] Fetching all gold prices from ${provider.getName()}`);
        return await provider.getAllGoldPrices();
      } catch (error) {
        console.warn(`[CommodityClient] ${provider.getName()} failed:`, error.message);
      }
    }
    throw new Error('Could not fetch gold prices from any provider');
  }

  /**
   * Get crypto price with failover
   * @param {string} symbol - Crypto symbol (e.g., 'BTC')
   * @returns {Promise<CryptoPriceData>}
   */
  async getCryptoPrice(symbol) {
    for (const provider of this.cryptoProviders) {
      try {
        console.log(`[CommodityClient] Fetching ${symbol} from ${provider.getName()}`);
        return await provider.getCryptoPrice(symbol);
      } catch (error) {
        console.warn(`[CommodityClient] ${provider.getName()} failed:`, error.message);
      }
    }
    throw new Error(`Could not fetch crypto price for ${symbol} from any provider`);
  }

  /**
   * Get multiple crypto prices with failover
   * @param {string[]} symbols - Array of crypto symbols
   * @returns {Promise<CryptoPriceData[]>}
   */
  async getMultipleCryptoPrices(symbols) {
    for (const provider of this.cryptoProviders) {
      try {
        console.log(`[CommodityClient] Fetching ${symbols.length} cryptos from ${provider.getName()}`);
        return await provider.getMultipleCryptoPrices(symbols);
      } catch (error) {
        console.warn(`[CommodityClient] ${provider.getName()} failed:`, error.message);
      }
    }
    
    // Partial results - try individual fetches
    console.warn('[CommodityClient] Batch failed, trying individual fetches');
    const results = [];
    for (const symbol of symbols) {
      try {
        results.push(await this.getCryptoPrice(symbol));
      } catch {
        // Skip failed symbols
      }
    }
    return results;
  }

  /**
   * Get available provider names
   * @returns {{ gold: string[], crypto: string[] }}
   */
  getAvailableProviders() {
    return {
      gold: this.goldProviders.map(p => p.getName()),
      crypto: this.cryptoProviders.map(p => p.getName())
    };
  }
}

// Singleton instance
let commodityClientInstance = null;

/**
 * Get or create singleton CommodityDataClient
 * @param {Object} options
 * @returns {CommodityDataClient}
 */
export function getCommodityDataClient(options = {}) {
  if (!commodityClientInstance) {
    commodityClientInstance = new CommodityDataClient(options);
  }
  return commodityClientInstance;
}
