/**
 * @fileoverview Commodity Price Handlers (Gold & Crypto)
 * 
 * Handles fetching and updating live prices for gold and crypto assets.
 * Uses generic provider pattern for easy provider switching.
 * 
 * Message Types:
 * - COMMODITY_GET_GOLD_PRICES: Fetch current gold prices
 * - COMMODITY_GET_CRYPTO_PRICES: Fetch crypto prices for symbols
 * - COMMODITY_UPDATE_ASSET_PRICES: Update asset values based on live prices
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { 
  getCommodityDataClient, 
  calculateGoldValue, 
  getPricePerUnit,
  GOLD_UNITS 
} from '../../commodity-data/index.js';

const logger = createLogger('Handlers/Commodity');

// Get singleton client
const commodityClient = getCommodityDataClient();

/**
 * Handle COMMODITY_GET_GOLD_PRICES
 * Fetch current gold prices from providers
 */
registerHandler(MESSAGE_TYPES.COMMODITY_GET_GOLD_PRICES, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling COMMODITY_GET_GOLD_PRICES', { correlationId });

  try {
    // No auth required for public price data
    const { goldType } = message.data || {};

    let prices;
    if (goldType) {
      // Fetch specific gold type
      const price = await commodityClient.getGoldPrice(goldType);
      prices = [price];
    } else {
      // Fetch all gold prices
      prices = await commodityClient.getAllGoldPrices();
    }

    logger.info('Gold prices fetched', { 
      correlationId, 
      count: prices.length,
      types: prices.map(p => p.type)
    });

    return createResponse(message, MESSAGE_TYPES.COMMODITY_GOLD_PRICES, {
      success: true,
      prices,
      providers: commodityClient.getAvailableProviders().gold
    });

  } catch (error) {
    logger.error('Gold price fetch failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.NETWORK_ERROR,
      'Không thể lấy giá vàng. Vui lòng thử lại sau.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle COMMODITY_GET_CRYPTO_PRICES
 * Fetch current crypto prices for given symbols
 */
registerHandler(MESSAGE_TYPES.COMMODITY_GET_CRYPTO_PRICES, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling COMMODITY_GET_CRYPTO_PRICES', { correlationId });

  try {
    const { symbols } = message.data || {};

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Danh sách symbol crypto không hợp lệ.'
      );
    }

    const prices = await commodityClient.getMultipleCryptoPrices(symbols);

    logger.info('Crypto prices fetched', { 
      correlationId, 
      requested: symbols.length,
      received: prices.length
    });

    return createResponse(message, MESSAGE_TYPES.COMMODITY_CRYPTO_PRICES, {
      success: true,
      prices,
      providers: commodityClient.getAvailableProviders().crypto
    });

  } catch (error) {
    logger.error('Crypto price fetch failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.NETWORK_ERROR,
      'Không thể lấy giá crypto. Vui lòng thử lại sau.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle COMMODITY_UPDATE_ASSET_PRICES
 * Update gold and crypto assets with live prices
 * 
 * For gold: current_value = quantity × price_per_unit
 * For crypto: current_value = quantity × priceVND
 */
registerHandler(MESSAGE_TYPES.COMMODITY_UPDATE_ASSET_PRICES, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling COMMODITY_UPDATE_ASSET_PRICES', { correlationId });

  try {
    const userId = await requireAuth(message);

    // 1. Fetch user's gold and crypto assets
    const assets = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('assets')
          .select('id, name, asset_type, quantity, unit_price, current_value, notes')
          .eq('user_id', userId)
          .eq('is_active', true)
          .in('asset_type', ['gold', 'crypto']);

        if (error) throw error;
        return data || [];
      },
      { operationName: 'fetchGoldCryptoAssets', correlationId }
    );

    if (assets.length === 0) {
      logger.info('No gold/crypto assets to update', { correlationId, userId });
      return createResponse(message, MESSAGE_TYPES.COMMODITY_PRICES_UPDATED, {
        success: true,
        updated: 0,
        message: 'Không có tài sản vàng/crypto để cập nhật.'
      });
    }

    // 2. Separate gold and crypto assets
    const goldAssets = assets.filter(a => a.asset_type === 'gold');
    const cryptoAssets = assets.filter(a => a.asset_type === 'crypto');

    logger.info('Assets to update', {
      correlationId,
      goldCount: goldAssets.length,
      cryptoCount: cryptoAssets.length
    });

    // 3. Fetch live prices
    let goldPrices = [];
    let cryptoPrices = [];

    if (goldAssets.length > 0) {
      try {
        goldPrices = await commodityClient.getAllGoldPrices();
      } catch (error) {
        logger.warn('Failed to fetch gold prices', { correlationId, error: error.message });
      }
    }

    if (cryptoAssets.length > 0) {
      // Extract symbols from asset names (e.g., "Bitcoin (BTC)" → "BTC")
      const symbols = cryptoAssets.map(a => extractCryptoSymbol(a.name)).filter(Boolean);
      if (symbols.length > 0) {
        try {
          cryptoPrices = await commodityClient.getMultipleCryptoPrices(symbols);
        } catch (error) {
          logger.warn('Failed to fetch crypto prices', { correlationId, error: error.message });
        }
      }
    }

    // 4. Calculate new values and update assets
    const updates = [];
    const results = { gold: [], crypto: [] };

    // Update gold assets
    for (const asset of goldAssets) {
      const goldType = extractGoldType(asset.name);
      const goldPrice = findGoldPrice(goldPrices, goldType);
      
      if (goldPrice) {
        const unit = extractGoldUnit(asset.notes) || 'chi'; // Default to chỉ
        const quantity = Number(asset.quantity) || 0;
        const pricePerUnit = getPricePerUnit(goldPrice.pricePerLuong, unit);
        const newValue = quantity * pricePerUnit;

        updates.push({
          id: asset.id,
          unit_price: pricePerUnit,
          current_value: Math.round(newValue)
        });

        results.gold.push({
          id: asset.id,
          name: asset.name,
          quantity,
          unit,
          pricePerUnit,
          oldValue: asset.current_value,
          newValue: Math.round(newValue),
          source: goldPrice.source
        });
      }
    }

    // Update crypto assets
    for (const asset of cryptoAssets) {
      const symbol = extractCryptoSymbol(asset.name);
      const cryptoPrice = cryptoPrices.find(p => 
        p.symbol.toUpperCase() === symbol?.toUpperCase()
      );

      if (cryptoPrice) {
        const quantity = Number(asset.quantity) || 0;
        const priceVND = cryptoPrice.priceVND || (cryptoPrice.priceUSD * 25000);
        const newValue = quantity * priceVND;

        updates.push({
          id: asset.id,
          unit_price: priceVND,
          current_value: Math.round(newValue)
        });

        results.crypto.push({
          id: asset.id,
          name: asset.name,
          symbol,
          quantity,
          priceUSD: cryptoPrice.priceUSD,
          priceVND,
          oldValue: asset.current_value,
          newValue: Math.round(newValue),
          change24h: cryptoPrice.change24h,
          source: cryptoPrice.source
        });
      }
    }

    // 5. Batch update to Supabase
    if (updates.length > 0) {
      await supabaseWithRetry(
        async () => {
          for (const update of updates) {
            const { error } = await supabase
              .from('assets')
              .update({
                unit_price: update.unit_price,
                current_value: update.current_value,
                updated_at: new Date().toISOString()
              })
              .eq('id', update.id)
              .eq('user_id', userId);

            if (error) {
              logger.warn('Failed to update asset', { 
                correlationId, 
                assetId: update.id, 
                error: error.message 
              });
            }
          }
        },
        { operationName: 'batchUpdateAssetPrices', correlationId }
      );
    }

    logger.info('Asset prices updated', {
      correlationId,
      totalUpdated: updates.length,
      goldUpdated: results.gold.length,
      cryptoUpdated: results.crypto.length
    });

    return createResponse(message, MESSAGE_TYPES.COMMODITY_PRICES_UPDATED, {
      success: true,
      updated: updates.length,
      results,
      timestamp: Date.now()
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Asset price update failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Cập nhật giá tài sản thất bại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Extract gold type from asset name
 * e.g., "Vàng SJC" → "SJC", "Vàng 9999" → "9999"
 */
function extractGoldType(name) {
  if (!name) return 'SJC';
  
  const upper = name.toUpperCase();
  if (upper.includes('SJC')) return 'SJC';
  if (upper.includes('9999')) return 'GOLD_9999';
  if (upper.includes('999')) return 'GOLD_999';
  if (upper.includes('24K')) return 'GOLD_24K';
  if (upper.includes('18K')) return 'GOLD_18K';
  if (upper.includes('NHẪN') || upper.includes('RING')) return 'GOLD_RING';
  
  return 'SJC'; // Default to SJC
}

/**
 * Extract gold unit from notes
 * e.g., "[Unit: chi] 5 chỉ" → "chi", "[Unit: luong]" → "luong"
 */
function extractGoldUnit(notes) {
  if (!notes) return 'chi';
  
  // Try to extract from [Unit: xxx] pattern first
  const unitMatch = notes.match(/\[Unit:\s*([^\]]+)\]/i);
  if (unitMatch) {
    return unitMatch[1].trim().toLowerCase();
  }
  
  // Fallback to keyword detection
  const lower = notes.toLowerCase();
  if (lower.includes('lượng') || lower.includes('luong') || lower.includes('cây') || lower.includes('cay')) {
    return 'luong';
  }
  if (lower.includes('chỉ') || lower.includes('chi')) {
    return 'chi';
  }
  if (lower.includes('gram') || lower.includes('g ')) {
    return 'gram';
  }
  if (lower.includes('phân') || lower.includes('phan')) {
    return 'phan';
  }
  
  return 'chi'; // Default to chỉ (most common in Vietnam)
}

/**
 * Find gold price by type with fallback
 */
function findGoldPrice(prices, goldType) {
  if (!prices || prices.length === 0) return null;
  
  // Try exact match
  const exact = prices.find(p => p.type === goldType);
  if (exact) return exact;
  
  // Fallback to SJC
  const sjc = prices.find(p => p.type === 'SJC');
  if (sjc) return sjc;
  
  // Return first available
  return prices[0];
}

/**
 * Extract crypto symbol from asset name
 * e.g., "Bitcoin (BTC)" → "BTC", "Ethereum" → "ETH"
 */
function extractCryptoSymbol(name) {
  if (!name) return null;
  
  // Try to extract from parentheses: "Bitcoin (BTC)" → "BTC"
  const match = name.match(/\(([A-Z0-9]+)\)/);
  if (match) return match[1];
  
  // Map common names to symbols
  const nameToSymbol = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'binance': 'BNB',
    'bnb': 'BNB',
    'ripple': 'XRP',
    'xrp': 'XRP',
    'cardano': 'ADA',
    'ada': 'ADA',
    'solana': 'SOL',
    'sol': 'SOL',
    'dogecoin': 'DOGE',
    'doge': 'DOGE',
    'polkadot': 'DOT',
    'dot': 'DOT',
    'polygon': 'MATIC',
    'matic': 'MATIC',
    'shiba': 'SHIB',
    'shib': 'SHIB',
    'tron': 'TRX',
    'trx': 'TRX',
    'avalanche': 'AVAX',
    'avax': 'AVAX',
    'chainlink': 'LINK',
    'link': 'LINK',
    'uniswap': 'UNI',
    'uni': 'UNI',
    'litecoin': 'LTC',
    'ltc': 'LTC',
    'tether': 'USDT',
    'usdt': 'USDT',
    'usdc': 'USDC'
  };

  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, symbol] of Object.entries(nameToSymbol)) {
    if (lower.includes(key)) return symbol;
  }
  
  // If name looks like a symbol (all caps, 3-5 chars), return it
  const clean = name.trim().toUpperCase();
  if (/^[A-Z]{2,5}$/.test(clean)) return clean;
  
  return null;
}
