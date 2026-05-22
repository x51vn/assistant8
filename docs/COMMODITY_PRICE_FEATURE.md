# Commodity Price Feature - Live Gold & Crypto Prices

## Overview

Feature to fetch live gold and crypto prices online, similar to the existing stock price functionality. Designed with a **generic/pluggable provider pattern** for future flexibility.

**Ticket Reference**: Gold & Crypto Price Feature

## Architecture

### Provider Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    CommodityDataClient                          │
│  - getGoldPrices()                                             │
│  - getCryptoPrices(symbols)                                    │
│  - Uses priority-based provider selection                       │
│  - Automatic failover on provider failure                       │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │   BTMC      │ │  CoinGecko  │ │   Binance   │
        │  (Gold)     │ │  (Crypto)   │ │  (Crypto)   │
        │ Priority: 1 │ │ Priority: 1 │ │ Priority: 2 │
        └─────────────┘ └─────────────┘ └─────────────┘
              │                              
              ▼                              
        ┌─────────────┐                      
        │  GiaVang    │                      
        │ (Fallback)  │                      
        └─────────────┘                      
```

### File Structure

```
src/commodity-data/
├── provider.interface.js    # Base interface + gold unit utilities
├── gold.provider.js         # BTMC + GiaVang gold providers
├── crypto.provider.js       # CoinGecko + Binance crypto providers
└── index.js                 # Registry, client, factory functions

src/background/handlers/
└── commodity.js             # Message handlers for commodity operations

src/ui-preact/api/
└── commodityApi.js          # UI-facing API
```

## Gold Price Provider

### Data Sources (in priority order)

1. **BTMC (Primary)**: https://btmc.vn/backend/chart/today - Official Vietnamese gold shop API
2. **GiaVang (Fallback)**: https://giavang.org - Vietnamese gold price aggregator  
3. **Hardcoded Emergency**: Pre-set prices for offline scenarios

### Vietnamese Gold Units

| Unit | Vietnamese | Grams | Relationship |
|------|-----------|-------|--------------|
| Lượng | 1 lượng | 37.5g | Base unit |
| Cây | 1 cây | 37.5g | = 1 lượng |
| Chỉ | 1 chỉ | 3.75g | = 1/10 lượng |
| Phân | 1 phân | 0.375g | = 1/10 chỉ |
| Gram | 1 gram | 1g | Standard metric |
| Ounce | 1 oz | 31.1035g | Troy ounce |

### Response Format

```javascript
{
  sjc: {                  // SJC branded gold
    buy: 9150000,         // VND per chỉ (buying)
    sell: 9250000         // VND per chỉ (selling)
  },
  pnj: {                  // PNJ branded gold
    buy: 9100000,
    sell: 9200000
  },
  pricePerLuong: 92500000, // Calculated for convenience
  pricePerGram: 2466667,   // Calculated for convenience
  pricePerChi: 9250000,    // Primary price reference
  timestamp: 1234567890123
}
```

## Crypto Price Provider

### Data Sources (in priority order)

1. **CoinGecko (Primary)**: Free API, no key required, 10-50 calls/min
2. **Binance (Fallback)**: Public ticker API, higher rate limits

### Supported Cryptocurrencies

| Symbol | CoinGecko ID | Name |
|--------|--------------|------|
| BTC | bitcoin | Bitcoin |
| ETH | ethereum | Ethereum |
| BNB | binancecoin | Binance Coin |
| SOL | solana | Solana |
| XRP | ripple | Ripple |
| ADA | cardano | Cardano |
| DOGE | dogecoin | Dogecoin |
| DOT | polkadot | Polkadot |
| MATIC | matic-network | Polygon |
| AVAX | avalanche-2 | Avalanche |
| LINK | chainlink | Chainlink |
| UNI | uniswap | Uniswap |

### Response Format

```javascript
{
  BTC: {
    usd: 67500,
    vnd: 1687500000,
    change24h: 2.5
  },
  ETH: {
    usd: 3500,
    vnd: 87500000,
    change24h: 1.8
  }
}
```

## Message Types

```javascript
// Gold prices
MESSAGE_TYPES.COMMODITY_GET_GOLD_PRICES    // Request
MESSAGE_TYPES.COMMODITY_GOLD_PRICES        // Response

// Crypto prices
MESSAGE_TYPES.COMMODITY_GET_CRYPTO_PRICES  // Request (with symbols array)
MESSAGE_TYPES.COMMODITY_CRYPTO_PRICES      // Response

// Update asset values
MESSAGE_TYPES.COMMODITY_UPDATE_ASSET_PRICES // Request (with assets array)
MESSAGE_TYPES.COMMODITY_PRICES_UPDATED      // Response
```

## UI Integration

### Asset Storage Convention

**Gold Assets**:
- ✅ **User only enters**: Quantity (khối lượng) + Unit (đơn vị)
- ✅ **System auto-fetches**: Market price from BTMC/GiaVang APIs
- ✅ **System auto-calculates**: Value = quantity × market_price_per_unit
- Unit stored in `notes` field as `[Unit: chi]`, `[Unit: luong]`, etc.
- Display shows: Current market price + Auto-calculated total value

**Crypto Assets**:
- ✅ **User only enters**: Quantity (số lượng) + Symbol (BTC, ETH, etc.)
- ✅ **System auto-fetches**: Market price from CoinGecko/Binance APIs  
- ✅ **System auto-calculates**: Value = quantity × price_per_coin
- Symbol stored in `name` field as `Bitcoin (BTC)`, `Ethereum (ETH)`
- Display shows: Current market price + Auto-calculated total value

**Other Assets (Cash, Savings, Real Estate, etc.)**:
- User manually enters: Name + Value
- System doesn't auto-calculate

### Refresh Prices Button

The AssetsPage includes a "Refresh Prices" button (chart icon) that:
- Only appears if user has gold or crypto assets
- Fetches latest prices from providers
- Updates asset values in Supabase
- Refreshes local state

### Automatic Updates

- **Alarm**: `updateCommodityPrices` runs every 15 minutes
- **Schedule**: 24/7 (unlike stocks which are market-hours only)
- **Coverage**: Updates all gold and crypto assets for all users

## API Usage

### From UI

```javascript
import { getGoldPrices, getCryptoPrices, updateAssetPrices, convertGoldUnit } from '../api/commodityApi.js';

// Get gold prices
const goldPrices = await getGoldPrices();
console.log(goldPrices.pricePerChi); // 9250000 VND

// Get crypto prices
const cryptoPrices = await getCryptoPrices(['BTC', 'ETH']);
console.log(cryptoPrices.BTC.vnd); // 1687500000 VND

// Update all asset prices
const result = await updateAssetPrices(assets);
if (result.success) {
  console.log('Updated', result.updatedAssets.length, 'assets');
}

// Convert gold units
const grams = convertGoldUnit(5, 'chi', 'gram'); // 5 chỉ = 18.75 grams
```

### From Background Handler

```javascript
import { getCommodityDataClient } from '../commodity-data/index.js';

const client = await getCommodityDataClient();
const goldPrices = await client.getGoldPrices();
const cryptoPrices = await client.getCryptoPrices(['BTC', 'ETH']);
```

## Error Handling

1. **Provider Failover**: Automatically tries next provider on failure
2. **Emergency Fallback**: Hardcoded gold prices if all providers fail
3. **Rate Limiting**: Respects API limits with delays between requests
4. **User-Friendly Errors**: Vietnamese error messages for UI display

## Future Enhancements

1. **Additional Gold Providers**: Add more Vietnamese gold shops
2. **More Cryptocurrencies**: Extend symbol mapping
3. **Price Alerts**: Notify when price crosses threshold
4. **Historical Charts**: Track price trends over time
5. **Currency Support**: Add USD, EUR base currencies for gold
