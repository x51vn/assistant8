/**
 * Market Data Providers - Auto-discovery and Registry
 * 
 * This module provides automatic provider discovery and registration.
 * All providers implementing MarketDataProvider interface are automatically
 * available for use with failover pattern.
 * 
 * To add a new provider:
 * 1. Create {name}.provider.js implementing MarketDataProvider
 * 2. Export class and factory function
 * 3. Add to PROVIDER_REGISTRY below with priority
 * 
 * Providers are tried in priority order (lower number = higher priority)
 */

// Provider imports - add new providers here
import { VPSProvider } from './vps.provider.js';
import { SSIProvider } from './ssi.provider.js';

// Re-export for direct access if needed
export { MarketDataProvider } from './provider.interface.js';
export { MarketDataClient } from './client.js';
export { VPSProvider } from './vps.provider.js';
export { SSIProvider } from './ssi.provider.js';

/**
 * Provider Registry
 * 
 * Each entry defines:
 * - id: Unique identifier
 * - name: Display name
 * - priority: Lower = tried first (1 = highest priority)
 * - factory: Function to create provider instance
 * - capabilities: What the provider supports
 * 
 * @type {ProviderConfig[]}
 */
export const PROVIDER_REGISTRY = [
  {
    id: 'vps',
    name: 'VPS',
    priority: 1,
    factory: (options) => new VPSProvider(options),
    capabilities: {
      stocks: true,
      etfs: true,
      indices: false,
      realtime: false
    }
  },
  {
    id: 'ssi',
    name: 'SSI iBoard',
    priority: 2,
    factory: (options) => new SSIProvider(options),
    capabilities: {
      stocks: true,
      etfs: false,
      indices: true,
      realtime: true
    }
  }
];

/**
 * Get all registered providers sorted by priority
 * 
 * @param {Object} options - Options to pass to provider factories
 * @returns {MarketDataProvider[]} Array of provider instances
 */
export function createAllProviders(options = {}) {
  return PROVIDER_REGISTRY
    .sort((a, b) => a.priority - b.priority)
    .map(config => {
      try {
        const provider = config.factory(options);
        console.log(`[market-data] Created provider: ${config.name} (priority: ${config.priority})`);
        return provider;
      } catch (error) {
        console.error(`[market-data] Failed to create provider ${config.name}:`, error);
        return null;
      }
    })
    .filter(p => p !== null);
}

/**
 * Get providers that support a specific capability
 * 
 * @param {string} capability - Capability name (stocks, etfs, indices, realtime)
 * @param {Object} options - Options to pass to provider factories
 * @returns {MarketDataProvider[]} Array of provider instances with the capability
 */
export function getProvidersWithCapability(capability, options = {}) {
  return PROVIDER_REGISTRY
    .filter(config => config.capabilities[capability] === true)
    .sort((a, b) => a.priority - b.priority)
    .map(config => {
      try {
        return config.factory(options);
      } catch (error) {
        console.error(`[market-data] Failed to create provider ${config.name}:`, error);
        return null;
      }
    })
    .filter(p => p !== null);
}

/**
 * Get provider registry info (without creating instances)
 * 
 * @returns {Object[]} Array of provider configurations
 */
export function getProviderRegistry() {
  return PROVIDER_REGISTRY.map(({ id, name, priority, capabilities }) => ({
    id,
    name,
    priority,
    capabilities
  }));
}

/**
 * Create a specific provider by ID
 * 
 * @param {string} id - Provider ID
 * @param {Object} options - Options to pass to provider factory
 * @returns {MarketDataProvider|null} Provider instance or null if not found
 */
export function createProviderById(id, options = {}) {
  const config = PROVIDER_REGISTRY.find(p => p.id === id);
  if (!config) {
    console.warn(`[market-data] Provider not found: ${id}`);
    return null;
  }
  
  try {
    return config.factory(options);
  } catch (error) {
    console.error(`[market-data] Failed to create provider ${config.name}:`, error);
    return null;
  }
}
