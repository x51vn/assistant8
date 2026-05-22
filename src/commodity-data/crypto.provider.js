/**
 * Crypto Price Provider - CoinGecko
 * 
 * Fetches live cryptocurrency prices from CoinGecko API (free tier)
 * Primary provider for crypto prices
 * 
 * API: https://api.coingecko.com/api/v3
 * Rate limits: 10-30 calls/minute (free tier)
 * 
 * Supports:
 * - All major cryptocurrencies (BTC, ETH, BNB, etc.)
 * - Price in USD and VND
 * - 24h change, market cap, volume
 */

import { CommodityDataProvider } from './provider.interface.js';

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

// Map common symbols to CoinGecko IDs
const SYMBOL_TO_ID = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'SOL': 'solana',
  'DOGE': 'dogecoin',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'SHIB': 'shiba-inu',
  'TRX': 'tron',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'ATOM': 'cosmos',
  'UNI': 'uniswap',
  'LTC': 'litecoin',
  'ETC': 'ethereum-classic',
  'XLM': 'stellar',
  'NEAR': 'near',
  'APT': 'aptos',
  'FIL': 'filecoin',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'BUSD': 'binance-usd',
  'DAI': 'dai',
};

// Reverse map for lookup
const ID_TO_SYMBOL = Object.fromEntries(
  Object.entries(SYMBOL_TO_ID).map(([k, v]) => [v, k])
);

export class CoinGeckoProvider extends CommodityDataProvider {
  constructor(options = {}) {
    super();
    this.name = 'CoinGecko';
    this.timeout = options.timeout || 10000;
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 1 minute cache
    this.lastRequestTime = 0;
    this.minRequestInterval = 2000; // 2s between requests to avoid rate limit
  }

  getType() {
    return 'crypto';
  }

  getName() {
    return this.name;
  }

  async isAvailable() {
    try {
      await this._fetch('/ping');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rate-limited fetch
   * @private
   */
  async _fetch(endpoint, params = {}) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(r => setTimeout(r, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    const url = new URL(`${COINGECKO_API_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limited by CoinGecko. Try again later.');
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Convert symbol to CoinGecko ID
   * @private
   */
  _symbolToId(symbol) {
    const upper = symbol.toUpperCase();
    return SYMBOL_TO_ID[upper] || symbol.toLowerCase();
  }

  /**
   * Convert CoinGecko ID to symbol
   * @private
   */
  _idToSymbol(id) {
    return ID_TO_SYMBOL[id] || id.toUpperCase();
  }

  /**
   * Get crypto price for a single symbol
   * @param {string} symbol - Crypto symbol (e.g., 'BTC', 'ETH')
   * @returns {Promise<CryptoPriceData>}
   */
  async getCryptoPrice(symbol) {
    const cacheKey = `crypto:${symbol.toUpperCase()}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.data;
    }

    const id = this._symbolToId(symbol);
    
    try {
      const data = await this._fetch(`/simple/price`, {
        ids: id,
        vs_currencies: 'usd,vnd',
        include_24hr_change: 'true',
        include_market_cap: 'true',
        include_24hr_vol: 'true'
      });

      if (!data[id]) {
        throw new Error(`Crypto ${symbol} not found`);
      }

      const result = this._transformSimplePrice(id, data[id]);
      
      // Cache result
      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        data: result
      });

      return result;
    } catch (error) {
      console.error(`[CoinGecko] Error fetching ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get multiple crypto prices
   * @param {string[]} symbols - Array of crypto symbols
   * @returns {Promise<CryptoPriceData[]>}
   */
  async getMultipleCryptoPrices(symbols) {
    if (!symbols || symbols.length === 0) {
      return [];
    }

    // Check cache first
    const results = [];
    const uncached = [];
    
    for (const symbol of symbols) {
      const cacheKey = `crypto:${symbol.toUpperCase()}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
        results.push(cached.data);
      } else {
        uncached.push(symbol);
      }
    }

    // Fetch uncached symbols
    if (uncached.length > 0) {
      const ids = uncached.map(s => this._symbolToId(s)).join(',');
      
      try {
        const data = await this._fetch(`/simple/price`, {
          ids: ids,
          vs_currencies: 'usd,vnd',
          include_24hr_change: 'true',
          include_market_cap: 'true',
          include_24hr_vol: 'true'
        });

        for (const symbol of uncached) {
          const id = this._symbolToId(symbol);
          if (data[id]) {
            const result = this._transformSimplePrice(id, data[id]);
            results.push(result);
            
            // Cache result
            this.cache.set(`crypto:${symbol.toUpperCase()}`, {
              timestamp: Date.now(),
              data: result
            });
          }
        }
      } catch (error) {
        console.error('[CoinGecko] Error fetching multiple cryptos:', error.message);
        // Return cached results even if fetch fails
      }
    }

    return results;
  }

  /**
   * Transform simple price response
   * @private
   */
  _transformSimplePrice(id, data) {
    return {
      symbol: this._idToSymbol(id),
      name: this._getDisplayName(id),
      priceUSD: data.usd || 0,
      priceVND: data.vnd || 0,
      change24h: data.usd_24h_change || 0,
      marketCap: data.usd_market_cap || 0,
      volume24h: data.usd_24h_vol || 0,
      timestamp: Date.now(),
      source: 'CoinGecko'
    };
  }

  /**
   * Get display name for crypto
   * @private
   */
  _getDisplayName(id) {
    const names = {
      'bitcoin': 'Bitcoin',
      'ethereum': 'Ethereum',
      'binancecoin': 'BNB',
      'ripple': 'XRP',
      'cardano': 'Cardano',
      'solana': 'Solana',
      'dogecoin': 'Dogecoin',
      'polkadot': 'Polkadot',
      'matic-network': 'Polygon',
      'shiba-inu': 'Shiba Inu',
      'tron': 'TRON',
      'avalanche-2': 'Avalanche',
      'chainlink': 'Chainlink',
      'cosmos': 'Cosmos',
      'uniswap': 'Uniswap',
      'litecoin': 'Litecoin',
      'tether': 'Tether',
      'usd-coin': 'USD Coin',
    };
    return names[id] || id;
  }

  /**
   * Get top cryptocurrencies by market cap
   * @param {number} limit - Number of results (max 100)
   * @returns {Promise<CryptoPriceData[]>}
   */
  async getTopCryptos(limit = 20) {
    try {
      const data = await this._fetch('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: Math.min(limit, 100),
        page: 1,
        sparkline: 'false',
        price_change_percentage: '24h'
      });

      return data.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        priceUSD: coin.current_price || 0,
        priceVND: (coin.current_price || 0) * 25000, // Approximate VND rate
        change24h: coin.price_change_percentage_24h || 0,
        marketCap: coin.market_cap || 0,
        volume24h: coin.total_volume || 0,
        timestamp: Date.now(),
        source: 'CoinGecko'
      }));
    } catch (error) {
      console.error('[CoinGecko] Error fetching top cryptos:', error.message);
      throw error;
    }
  }

  /**
   * Search for crypto by name or symbol
   * @param {string} query - Search query
   * @returns {Promise<Array>} List of matching coins
   */
  async searchCrypto(query) {
    try {
      const data = await this._fetch('/search', { query });
      return (data.coins || []).slice(0, 10).map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCapRank: coin.market_cap_rank
      }));
    } catch (error) {
      console.error('[CoinGecko] Error searching:', error.message);
      return [];
    }
  }

  // Not implemented for crypto provider
  async getGoldPrice(goldType) {
    throw new Error('Crypto provider does not support gold');
  }

  async getAllGoldPrices() {
    throw new Error('Crypto provider does not support gold');
  }
}

/**
 * Alternative provider: Binance (backup)
 * Simpler API, no rate limits, but less data
 */
export class BinanceProvider extends CommodityDataProvider {
  constructor(options = {}) {
    super();
    this.name = 'Binance';
    this.baseUrl = 'https://api.binance.com/api/v3';
    this.timeout = options.timeout || 10000;
  }

  getType() {
    return 'crypto';
  }

  getName() {
    return this.name;
  }

  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/ping`, {
        signal: AbortSignal.timeout(this.timeout)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get crypto price (Binance uses USDT pairs)
   * @param {string} symbol - Crypto symbol
   * @returns {Promise<CryptoPriceData>}
   */
  async getCryptoPrice(symbol) {
    const pair = `${symbol.toUpperCase()}USDT`;
    
    try {
      const response = await fetch(`${this.baseUrl}/ticker/24hr?symbol=${pair}`, {
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        symbol: symbol.toUpperCase(),
        name: symbol.toUpperCase(),
        priceUSD: parseFloat(data.lastPrice) || 0,
        priceVND: (parseFloat(data.lastPrice) || 0) * 25000,
        change24h: parseFloat(data.priceChangePercent) || 0,
        marketCap: 0, // Not available from this endpoint
        volume24h: parseFloat(data.quoteVolume) || 0,
        timestamp: Date.now(),
        source: 'Binance'
      };
    } catch (error) {
      console.error(`[Binance] Error fetching ${symbol}:`, error.message);
      throw error;
    }
  }

  async getMultipleCryptoPrices(symbols) {
    // Binance doesn't have efficient batch endpoint for specific symbols
    // Fetch one by one with Promise.allSettled
    const results = await Promise.allSettled(
      symbols.map(s => this.getCryptoPrice(s))
    );

    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
  }

  // Not implemented
  async getGoldPrice() {
    throw new Error('Binance provider does not support gold');
  }

  async getAllGoldPrices() {
    throw new Error('Binance provider does not support gold');
  }
}
