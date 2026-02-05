/**
 * Commodity API - Gold & Crypto Price Operations
 * Frontend API for fetching live commodity prices
 * Uses background handlers via message passing
 */

import { MESSAGE_TYPES, createMessage } from '../../shared/messageSchema.js';
import { createLogger, generateCorrelationId } from '../../logger.js';

const logger = createLogger('CommodityAPI');

/**
 * Fetch current gold prices
 * @param {string} [goldType] - Optional specific gold type (e.g., 'SJC', '9999')
 * @returns {Promise<{success: boolean, pricePerChi: number, pricePerLuong: number, prices: Array, providers: Array}>}
 */
export async function getGoldPrices(goldType = null) {
  const correlationId = generateCorrelationId();
  
  try {
    logger.info('Fetching gold prices', { correlationId, goldType });
    
    const response = await chrome.runtime.sendMessage({
      ...createMessage(MESSAGE_TYPES.COMMODITY_GET_GOLD_PRICES),
      correlationId,
      data: { goldType }
    });
    
    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Failed to fetch gold prices');
    }
    
    const prices = response.prices || [];
    
    // Extract SJC or first gold price for convenience
    const sjcPrice = prices.find(p => p.type === 'SJC') || prices[0];
    
    logger.info('Gold prices fetched', { 
      correlationId, 
      count: prices.length,
      pricePerChi: sjcPrice?.pricePerChi
    });
    
    return {
      success: true,
      pricePerChi: sjcPrice?.pricePerChi || 0,
      pricePerLuong: sjcPrice?.pricePerLuong || 0,
      pricePerGram: sjcPrice?.pricePerGram || 0,
      prices,
      providers: response.providers || []
    };
  } catch (error) {
    logger.error('Failed to fetch gold prices', { 
      correlationId, 
      error: error.message 
    });
    return { success: false, pricePerChi: 0, prices: [], providers: [] };
  }
}

/**
 * Fetch crypto prices for given symbols
 * @param {string[]} symbols - Array of crypto symbols (e.g., ['BTC', 'ETH'])
 * @returns {Promise<Object>} Object keyed by symbol, e.g. { BTC: { usd: 67000, vnd: 1675000000 } }
 */
export async function getCryptoPrices(symbols) {
  const correlationId = generateCorrelationId();
  
  try {
    logger.info('Fetching crypto prices', { correlationId, symbols });
    
    const response = await chrome.runtime.sendMessage({
      ...createMessage(MESSAGE_TYPES.COMMODITY_GET_CRYPTO_PRICES),
      correlationId,
      data: { symbols }
    });
    
    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Failed to fetch crypto prices');
    }
    
    const prices = response.prices || [];
    
    // Convert array to object keyed by symbol for easy lookup
    // { BTC: { usd: 67000, vnd: 1675000000, change24h: 2.5 } }
    const pricesBySymbol = {};
    for (const p of prices) {
      pricesBySymbol[p.symbol] = {
        usd: p.priceUSD || 0,
        vnd: p.priceVND || 0,
        change24h: p.change24h || 0,
        name: p.name || p.symbol
      };
    }
    
    logger.info('Crypto prices fetched', { 
      correlationId, 
      count: prices.length,
      symbols: Object.keys(pricesBySymbol)
    });
    
    return pricesBySymbol;
  } catch (error) {
    logger.error('Failed to fetch crypto prices', { 
      correlationId, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Update all gold and crypto asset prices
 * Fetches live prices from API and updates all user assets in database
 * User assets are fetched server-side to ensure accuracy
 * @returns {Promise<{success: boolean, updated: number, results: Object}>}
 */
export async function updateAssetPrices() {
  const correlationId = generateCorrelationId();

  try {
    logger.info('Updating commodity asset prices', { correlationId });

    const response = await chrome.runtime.sendMessage({
      ...createMessage(MESSAGE_TYPES.COMMODITY_UPDATE_ASSET_PRICES),
      correlationId
    });

    if (response.errorCode) {
      throw new Error(response.errorMessage || 'Failed to update asset prices');
    }

    logger.info('Asset prices updated', {
      correlationId,
      updated: response.updated,
      goldUpdated: response.results?.gold?.length || 0,
      cryptoUpdated: response.results?.crypto?.length || 0
    });

    return {
      success: true,
      updated: response.updated || 0,
      results: response.results || {},
      timestamp: response.timestamp
    };
  } catch (error) {
    logger.error('Failed to update asset prices', {
      correlationId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Gold unit conversion utilities for UI
 */
export const GOLD_UNITS = {
  GRAMS_PER_LUONG: 37.5,
  GRAMS_PER_CHI: 3.75,
  GRAMS_PER_PHAN: 0.375,
  GRAMS_PER_OZ: 31.1035,
  GRAMS_PER_KG: 1000,
};

/**
 * Convert gold quantity between units
 * @param {number} quantity - Quantity in source unit
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number}
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
    case 'cay':
    case 'cây':
    case 'tael':
      grams = quantity * GOLD_UNITS.GRAMS_PER_LUONG;
      break;
    case 'oz':
    case 'ounce':
      grams = quantity * GOLD_UNITS.GRAMS_PER_OZ;
      break;
    case 'kg':
    case 'kilogram':
      grams = quantity * GOLD_UNITS.GRAMS_PER_KG;
      break;
    default:
      grams = quantity;
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
    case 'cay':
    case 'cây':
    case 'tael':
      return grams / GOLD_UNITS.GRAMS_PER_LUONG;
    case 'oz':
    case 'ounce':
      return grams / GOLD_UNITS.GRAMS_PER_OZ;
    case 'kg':
    case 'kilogram':
      return grams / GOLD_UNITS.GRAMS_PER_KG;
    default:
      return grams;
  }
}

/**
 * Calculate gold value in VND
 * @param {number} quantity - Quantity
 * @param {string} unit - Unit
 * @param {number} pricePerLuong - Price per lượng
 * @returns {number}
 */
export function calculateGoldValue(quantity, unit, pricePerLuong) {
  const luong = convertGoldUnit(quantity, unit, 'luong');
  return luong * pricePerLuong;
}

/**
 * Get price per unit from price per lượng
 * @param {number} pricePerLuong - Price per lượng
 * @param {string} unit - Target unit
 * @returns {number}
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
      return pricePerLuong / 10;
    case 'gram':
    case 'g':
      return pricePerLuong / GOLD_UNITS.GRAMS_PER_LUONG;
    case 'oz':
    case 'ounce':
      return pricePerLuong * (GOLD_UNITS.GRAMS_PER_OZ / GOLD_UNITS.GRAMS_PER_LUONG);
    default:
      return pricePerLuong;
  }
}
