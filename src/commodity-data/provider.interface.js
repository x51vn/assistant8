/**
 * Base Provider Interface for Commodity Data (Gold, Crypto, etc.)
 * 
 * Generic interface allowing easy provider switching in the future.
 * Pattern mirrors market-data/provider.interface.js for consistency.
 * 
 * Supported asset types:
 * - gold: Prices in VND per chi (1 chi = 3.75g) or per lượng (37.5g)
 * - crypto: Prices in USD or VND per unit (BTC, ETH, etc.)
 */

/**
 * Gold unit types supported in Vietnam
 * @typedef {'chi' | 'luong' | 'gram' | 'tael' | 'oz'} GoldUnit
 */

/**
 * @typedef {Object} GoldPriceData
 * @property {string} type - Gold type identifier (e.g., 'SJC', 'PNJ', '9999')
 * @property {string} name - Display name
 * @property {number} buyPrice - Buy price in VND (per lượng = 37.5g)
 * @property {number} sellPrice - Sell price in VND (per lượng = 37.5g)
 * @property {number} pricePerGram - Price per gram in VND
 * @property {number} pricePerChi - Price per chỉ in VND (1 chỉ = 3.75g)
 * @property {number} timestamp - Data timestamp
 * @property {string} source - Provider source
 */

/**
 * @typedef {Object} CryptoPriceData
 * @property {string} symbol - Crypto symbol (e.g., 'BTC', 'ETH')
 * @property {string} name - Full name (e.g., 'Bitcoin', 'Ethereum')
 * @property {number} priceUSD - Current price in USD
 * @property {number} priceVND - Current price in VND
 * @property {number} change24h - 24h change percentage
 * @property {number} marketCap - Market cap in USD
 * @property {number} volume24h - 24h volume in USD
 * @property {number} timestamp - Data timestamp
 * @property {string} source - Provider source
 */

export class CommodityDataProvider {
  /**
   * Provider type identifier
   * @returns {'gold' | 'crypto' | 'both'}
   */
  getType() {
    throw new Error('getType not implemented');
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    throw new Error('getName not implemented');
  }

  /**
   * Check if provider is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('isAvailable not implemented');
  }

  /**
   * Get gold price data
   * @param {string} [goldType] - Type of gold (e.g., 'SJC', '9999'). If not provided, return all.
   * @returns {Promise<GoldPriceData | GoldPriceData[]>}
   */
  async getGoldPrice(goldType) {
    throw new Error('getGoldPrice not implemented');
  }

  /**
   * Get all gold prices
   * @returns {Promise<GoldPriceData[]>}
   */
  async getAllGoldPrices() {
    throw new Error('getAllGoldPrices not implemented');
  }

  /**
   * Get crypto price data
   * @param {string} symbol - Crypto symbol (e.g., 'BTC', 'ETH')
   * @returns {Promise<CryptoPriceData>}
   */
  async getCryptoPrice(symbol) {
    throw new Error('getCryptoPrice not implemented');
  }

  /**
   * Get multiple crypto prices
   * @param {string[]} symbols - Array of crypto symbols
   * @returns {Promise<CryptoPriceData[]>}
   */
  async getMultipleCryptoPrices(symbols) {
    throw new Error('getMultipleCryptoPrices not implemented');
  }
}

/**
 * Gold unit conversion utilities
 * Vietnam uses different units:
 * - 1 lượng (tael) = 37.5 grams
 * - 1 chỉ = 1/10 lượng = 3.75 grams
 * - 1 phân = 1/10 chỉ = 0.375 grams
 * - 1 cây = 1 lượng = 37.5 grams (colloquial)
 */
export const GOLD_UNITS = {
  // Grams per unit
  GRAMS_PER_LUONG: 37.5,      // 1 lượng = 37.5g
  GRAMS_PER_CHI: 3.75,        // 1 chỉ = 3.75g  
  GRAMS_PER_PHAN: 0.375,      // 1 phân = 0.375g
  GRAMS_PER_CAY: 37.5,        // 1 cây = 1 lượng = 37.5g
  GRAMS_PER_OZ: 31.1035,      // 1 troy oz = 31.1035g
  GRAMS_PER_TAEL: 37.5,       // 1 tael = 37.5g (same as lượng)
};

/**
 * Convert gold quantity between units
 * @param {number} quantity - Quantity in source unit
 * @param {string} fromUnit - Source unit ('gram', 'chi', 'luong', 'cay', 'oz')
 * @param {string} toUnit - Target unit
 * @returns {number} Quantity in target unit
 */
export function convertGoldUnit(quantity, fromUnit, toUnit) {
  // Convert to grams first
  let grams;
  switch (fromUnit.toLowerCase()) {
    case 'gram':
    case 'g':
      grams = quantity;
      break;
    case 'chi':
    case 'chỉ':
      grams = quantity * GOLD_UNITS.GRAMS_PER_CHI;
      break;
    case 'luong':
    case 'lượng':
    case 'tael':
      grams = quantity * GOLD_UNITS.GRAMS_PER_LUONG;
      break;
    case 'cay':
    case 'cây':
      grams = quantity * GOLD_UNITS.GRAMS_PER_CAY;
      break;
    case 'oz':
    case 'ounce':
      grams = quantity * GOLD_UNITS.GRAMS_PER_OZ;
      break;
    case 'phan':
    case 'phân':
      grams = quantity * GOLD_UNITS.GRAMS_PER_PHAN;
      break;
    default:
      throw new Error(`Unknown gold unit: ${fromUnit}`);
  }

  // Convert from grams to target
  switch (toUnit.toLowerCase()) {
    case 'gram':
    case 'g':
      return grams;
    case 'chi':
    case 'chỉ':
      return grams / GOLD_UNITS.GRAMS_PER_CHI;
    case 'luong':
    case 'lượng':
    case 'tael':
      return grams / GOLD_UNITS.GRAMS_PER_LUONG;
    case 'cay':
    case 'cây':
      return grams / GOLD_UNITS.GRAMS_PER_CAY;
    case 'oz':
    case 'ounce':
      return grams / GOLD_UNITS.GRAMS_PER_OZ;
    case 'phan':
    case 'phân':
      return grams / GOLD_UNITS.GRAMS_PER_PHAN;
    default:
      throw new Error(`Unknown gold unit: ${toUnit}`);
  }
}

/**
 * Calculate gold value in VND
 * @param {number} quantity - Quantity
 * @param {string} unit - Unit ('chi', 'luong', 'gram', etc.)
 * @param {number} pricePerLuong - Price per lượng in VND
 * @returns {number} Total value in VND
 */
export function calculateGoldValue(quantity, unit, pricePerLuong) {
  const luong = convertGoldUnit(quantity, unit, 'luong');
  return luong * pricePerLuong;
}

/**
 * Get price per unit from price per lượng
 * @param {number} pricePerLuong - Price per lượng in VND
 * @param {string} unit - Target unit
 * @returns {number} Price per unit
 */
export function getPricePerUnit(pricePerLuong, unit) {
  switch (unit.toLowerCase()) {
    case 'luong':
    case 'lượng':
    case 'cay':
    case 'cây':
    case 'tael':
      return pricePerLuong;
    case 'chi':
    case 'chỉ':
      return pricePerLuong / 10; // 1 lượng = 10 chỉ
    case 'gram':
    case 'g':
      return pricePerLuong / GOLD_UNITS.GRAMS_PER_LUONG;
    case 'phan':
    case 'phân':
      return pricePerLuong / 100; // 1 lượng = 100 phân
    case 'oz':
    case 'ounce':
      return pricePerLuong * (GOLD_UNITS.GRAMS_PER_OZ / GOLD_UNITS.GRAMS_PER_LUONG);
    default:
      return pricePerLuong;
  }
}
