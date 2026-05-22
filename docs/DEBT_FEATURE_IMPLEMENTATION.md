# Debt Feature Implementation - XST-703

## Overview
Implemented "debt" (khoản vay) asset type to track liabilities alongside assets. Debts are subtracted from total assets to calculate net worth.

## Changes Made

### 1. **Database Migration** ✅
- **File**: `supabase/migrations/005_add_debt_type.sql`
- Added 'debt' to `asset_type` CHECK constraint
- Enables storing debt records in assets table

### 2. **Backend Handler Updates** ✅
- **File**: `src/background/handlers/netWorth.js`

#### Updated `calculateNetWorth()` function:
```javascript
// Separates assets and debts
// Returns: { total, totalAssets, totalDebts, breakdown, debtBreakdown }
// Logic: total = totalAssets - totalDebts
```

**Key changes**:
- `totalAssets`: Sum of non-debt assets + stocks
- `totalDebts`: Sum of debt items
- `breakdown`: Asset types (excluding debts)
- `debtBreakdown`: Debt details
- Debts identified by `asset_type === 'debt'`

#### Response structure:
```javascript
{
  success: true,
  total: number,                    // Assets - Debts
  totalAssets: number,              // All non-debt assets
  totalDebts: number,               // Sum of all debts
  breakdown: { [type]: value },     // Asset breakdown
  debtBreakdown: { debt: value },   // Debt total
  calculatedAt: ISO string,
  source: 'calculated' | 'summary'
}
```

### 3. **UI Component Updates** ✅

#### AssetModal.jsx
- Already includes 'debt' option in ASSET_TYPES (line 19)
- Icon: `fa-credit-card`
- Label: 'Khoản vay'
- **Form fields** for debt:
  - Name (required)
  - Value (required) - loan amount
  - Currency (default VND)
  - Institution - lender name (reuses showInstitutionFields)
  - Account Number - optional loan identifier
  - Maturity Date - loan due date (reuses showSavingsFields + debt check)
  - Interest Rate - loan interest rate (reuses showSavingsFields + debt check)
  - Notes - additional info

#### AssetCard.jsx
- **Config**: `{ label: 'Khoản vay', icon: 'fa-credit-card', isLiability: true }`
- **Styling**: 
  - Red liability tag: `#fee2e2` background, `#dc3545` text
  - Minus sign prefix in value display
  - Hides liquidity/risk tags (not applicable to debts)

#### NetWorthSummary.jsx
- **Added fields**: `totalAssets`, `totalDebts`
- **Breakdown calc**: Uses `totalAssets` for percentage (excludes debts)
- **UI changes**:
  - Shows debts in red stat box when `totalDebts > 0`
  - Icon: `fa-credit-card`
  - Format: `-{amount}`
  - Added `.stat.error` styling for debt stat

### 4. **CSS Styling** ✅
- **File**: `src/extension/styles-preact.css`

New CSS classes:
```css
/* Liability value display */
.asset-value.liability-value { color: #dc3545; }

/* Liability tag styling */
.list-item-tag.liability { 
  background: #fee2e2; 
  color: #dc3545; 
  border: 1px solid #fca5a5;
}

/* Liability stat styling */
.stat.error .stat-value { color: #dc3545; }
```

**Reused existing classes**:
- `.severity-tag.high` → Red background for debt tags
- `.stat` → Base stat card styling
- `.error-text` → Error color variable

## Feature Behavior

### Creating a Debt
1. **Asset Type**: Select "Khoản vay" (debt)
2. **Value**: Enter loan amount (treated as liability)
3. **Details**: Optional institution, interest rate, maturity date
4. **Display**: Shows with red tag, minus sign on amount

### Net Worth Calculation
```
Net Worth = Total Assets + Stocks - Total Debts
```

Example:
- Assets: 100M VND
- Stocks: 20M VND
- Debts: 30M VND
- **Net Worth**: 100 + 20 - 30 = 90M VND

### UI Display
- **Summary**: "Tổng tài sản ròng" = Net Worth
- **Stats breakdown**:
  - Cổ phiếu (Stocks): Green
  - Tài sản (Assets): Blue
  - Nợ (Debts): Red (only shown if > 0)

## Testing Checklist

- [x] Build successful: `npm run build`
- [x] Database: `005_add_debt_type.sql` migration ready
- [x] Backend: Handler correctly separates assets/debts
- [x] UI: AssetModal has debt option
- [x] UI: AssetCard displays debt with red styling
- [x] UI: NetWorthSummary shows debt in red stat
- [x] CSS: Liability styling reuses existing severity colors
- [x] Calculation: Net Worth = Assets - Debts

## Technical Notes

### Consistency
- All CSS reuses existing classes (`.severity-tag.high`, `.stat`, etc.)
- No new CSS classes beyond what's needed for liability display
- Debt calculation integrated into existing net worth handler

### Data Flow
```
UI (AssetModal)
  ↓ Asset with asset_type='debt'
Background (netWorth.js)
  ↓ Separates in calculateNetWorth()
Supabase
  ↓ Stores with asset_type='debt'
UI (NetWorthSummary)
  ↓ Displays totalAssets - totalDebts
```

### Field Naming
- Handler supports both camelCase and snake_case for updates:
  - `currentPrice` or `current_price`
  - `assetType` or `asset_type`

## Files Modified
1. ✅ `src/background/handlers/netWorth.js` - Added debt separation logic
2. ✅ `src/ui-preact/components/AssetCard.jsx` - Updated config with debt + liability styling
3. ✅ `src/ui-preact/components/AssetModal.jsx` - Added debt field handling for maturity/interest
4. ✅ `src/ui-preact/components/NetWorthSummary.jsx` - Added debt display + stat styling
5. ✅ `src/extension/styles-preact.css` - Added liability styling classes
6. ✅ `supabase/migrations/005_add_debt_type.sql` - Database constraint

## Database Schema
```sql
-- assets table
asset_type IN ('cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'debt', 'other')

-- Logic in handler determines liability status
-- debt items are summed separately from other assets
```

## Next Steps (Optional)
1. Consider adding "is_liability" flag for future extensibility
2. Add transaction linking (debt to income/payments)
3. Add debt payoff tracking/calculator
4. Implement interest rate calculations

## Reference
- **Ticket**: XST-703
- **Migration**: `supabase/migrations/005_add_debt_type.sql`
- **Handler**: `src/background/handlers/netWorth.js:calculateNetWorth()`
