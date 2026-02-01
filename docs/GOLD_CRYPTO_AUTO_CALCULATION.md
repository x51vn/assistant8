# Gold & Crypto Auto-Calculation Feature

## Problem
User was forced to manually enter both quantity AND current value for gold/crypto assets, even though the system had live market prices. This was redundant and error-prone.

## Solution
**✅ Chỉ cần nhập khối lượng - Hệ thống tự tính giá trị!**

### Gold Assets (Vàng)

**User Input Required:**
1. Tên tài sản (Name): e.g., "Vàng 24K"
2. Khối lượng (Quantity): e.g., 5
3. Đơn vị (Unit): Chọn từ dropdown
   - Chỉ vàng (1 chỉ = 3.75g)
   - Lượng vàng (1 lượng = 37.5g) 
   - Gram (g)
   - Ounce (oz)
   - Kilogram (kg)

**System Automatically:**
- ✅ Fetches latest gold price from BTMC API (primary) or GiaVang (fallback)
- ✅ Displays current market price: "9,250,000 VND/chỉ"
- ✅ Calculates total value: quantity × price_per_unit
- ✅ Shows calculated value: "46,250,000 VND" (for 5 chỉ)
- ✅ Saves both quantity and calculated current_value to database

### Crypto Assets (Crypto)

**User Input Required:**
1. Tên tài sản (Name): e.g., "Bitcoin"
2. Số lượng (Quantity): e.g., 0.5
3. Ký hiệu / Symbol: BTC, ETH, SOL, etc.

**System Automatically:**
- ✅ Fetches latest crypto price from CoinGecko API (primary) or Binance (fallback)
- ✅ Displays current market price: "1,687,500,000 VND/coin"
- ✅ Calculates total value: quantity × price_per_coin
- ✅ Shows calculated value: "843,750,000 VND" (for 0.5 BTC)
- ✅ Saves both quantity and calculated current_value to database

## UI Changes

### Form Fields - Before vs After

**Before (Old):**
```
Tên tài sản: [         ]
Loại: [Gold ▼]
Giá trị hiện tại: [         ] VND        ← User had to guess or calculate manually
Khối lượng: [5]
Đơn vị: [Chỉ ▼]
```

**After (New):**
```
Tên tài sản: [         ]
Loại: [Gold ▼]
Khối lượng: [5]        ← Only these two fields!
Đơn vị: [Chỉ ▼]

┌─────────────────────────────────┐
│ 💹 Giá thị trường hiện tại     │
│ 9,250,000 VND/chỉ             │  ← Auto-fetched from API
│ Giá trị: 46,250,000 VND        │  ← Auto-calculated!
└─────────────────────────────────┘
```

### Market Price Display

For gold/crypto assets, a read-only box shows:
- **Market price**: Current price per unit/coin (fetched live)
- **Total value**: Auto-calculated (quantity × market price)
- **Loading state**: Shows spinner while fetching prices
- **Error state**: "Chưa có dữ liệu giá" if API fails

### Validation

**Before saving:**
- ✅ Name is required
- ✅ Quantity must be > 0 (no zero or negative)
- ✅ Unit/Symbol must be selected (for gold/crypto)
- ✅ Current value is auto-calculated (no validation needed)

## API Integration

### Auto-fetch on Modal Open
When user:
1. Opens asset modal
2. Selects Gold as asset type → Fetches gold prices via `getGoldPrices()`
3. Enters crypto symbol → Fetches that crypto price via `getCryptoPrices([symbol])`

### Auto-calculate on Change
When user changes:
1. **Quantity** → Recalculates value immediately
2. **Unit (gold)** → Converts to chỉ, then recalculates
3. **Symbol (crypto)** → Fetches new price, recalculates

## Code Changes

### Modified Files
- **`src/ui-preact/components/AssetModal.jsx`**
  - Added `getGoldPrices`, `getCryptoPrices`, `convertGoldUnit` imports
  - Added `marketPrices`, `loadingPrices` state
  - Added `useEffect` to fetch prices on asset_type/symbol change
  - Added `useEffect` to auto-calculate current_value
  - Updated validation to skip current_value for gold/crypto
  - Hidden current_value input field for gold/crypto
  - Added market price display box

- **`docs/COMMODITY_PRICE_FEATURE.md`**
  - Updated "Asset Storage Convention" section

## User Experience Flow

### Adding Gold Asset
```
1. Click "+" button
2. Fill: Name="5 chỉ vàng", Type="Gold"
3. Enter: Quantity=5, Unit="Chỉ"
4. System displays: "9,250,000 VND/chỉ → Total: 46,250,000 VND"
5. Click Save → Done!
```

### Adding Crypto Asset
```
1. Click "+" button
2. Fill: Name="My Bitcoin", Type="Crypto"
3. Enter: Quantity=0.5, Symbol="BTC"
4. System displays: "1,687,500,000 VND/coin → Total: 843,750,000 VND"
5. Click Save → Done!
```

## Emergency Fallback

If market APIs fail:
- Gold: Falls back to hardcoded prices (still calculated, not manual entry)
- Crypto: Shows error "Chưa có dữ liệu giá"

User can still save - value will be saved as-is (from last fetch or fallback).

## Technical Details

### Auto-calculation Formula

**Gold:**
```
quantity_in_chi = convertGoldUnit(quantity, unit, 'chi')
total_value = quantity_in_chi × market_price_per_chi
```

**Crypto:**
```
total_value = quantity × market_price_per_coin_in_vnd
```

### State Management
- `marketPrices.gold`: Price per chỉ from BTMC
- `marketPrices.crypto[BTC]`: Price per coin in VND
- Auto-update triggers on quantity, unit, or symbol change
- Values are formatted with Vietnamese locale (comma separators)

## Benefits

✅ **No manual entry errors**: User can't enter wrong price  
✅ **Always up-to-date**: Prices refreshed every 15 minutes  
✅ **Simpler UX**: Less fields to fill  
✅ **Transparent**: Shows current market price  
✅ **Reliable**: Falls back if API fails  
