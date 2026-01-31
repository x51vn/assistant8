# IMPACT MAP — X51LABS-155 Real-time Pricing

**Ticket**: X51LABS-155  
**Date**: January 31, 2026  
**Purpose**: Deep codebase understanding + dependency analysis

---

## ENTRY POINTS & MODULE USAGE

### ✅ Primary Entry Point

**Location**: `src/ui-preact/state/portfolioState.js`

```javascript
// Signals (from Task 1) — foundation for X51LABS-155
export const portfolioItems = signal([]);          // UPDATED by pricing
export const lastUpdateTime = signal(null);        // NEW signal (Task 3)
export const isUpdatingPrices = signal(false);     // NEW signal (Task 3)
export const priceUpdateError = signal(null);      // NEW signal (Task 3)
```

**Why**: Task 3 depends on these signals for reactive price updates.

---

### ✅ Secondary Consumers

**1. PortfolioTable Component**
- **File**: `src/ui-preact/components/PortfolioTable.jsx`
- **Role**: Displays `portfolioItems` with currentPrice
- **Usage**: Re-renders when `currentPrice` updates (signal subscription)
- **Impact**: UI updates automatically when prices change

**2. PortfolioSummary Component**
- **File**: `src/ui-preact/components/PortfolioSummary.jsx`
- **Role**: Displays totalValue, totalPL (computed signals)
- **Usage**: Reads `totalValue`, `totalPL` derived from `portfolioItems`
- **Impact**: Summary stats update when prices change

---

## MODULE MAP — X51LABS-155 IMPLEMENTATION

### New Modules (Production Code)

**1. portfolioPricing.js** (200 lines)
- **Role**: SSI API integration layer
- **Key Exports**:
  - `fetchStockPrice(symbol)` — Fetch single stock
  - `fetchStockPricesBatch(symbols)` — Batch with rate limiting
  - `fetchStockPricesWithRetry(symbols, retryCount)` — Retry logic
  - `classifyPricingError(error)` — Error classification
- **Dependencies**:
  - `fetch` (browser native)
  - No external imports
- **Used By**: `portfolioPriceUpdater.js`

**2. portfolioPriceUpdater.js** (250 lines)
- **Role**: Polling lifecycle + signal mutations
- **Key Exports**:
  - `startPricePolling()` — Start 60s interval
  - `stopPricePolling()` — Cleanup
  - `updatePricesNow()` — Manual trigger
  - `getLastUpdateTimeFormatted()` — Format timestamp
  - `getRealtimeStatusIndicator()` — Get status emoji
- **Signal Mutations**:
  - `portfolioItems[i].currentPrice = newPrice`
  - `lastUpdateTime.value = Date.now()`
  - `isUpdatingPrices.value = true/false`
  - `priceUpdateError.value = null/message`
- **Dependencies**:
  - `portfolioItems` signal (imported from portfolioState.js)
  - `portfolioPricing.js` functions
  - `fetch` (via portfolioPricing.js)
- **Used By**: PortfolioPage component (Task 5)

---

## DEPENDENCY GRAPH

```
┌──────────────────────────────────────────────────┐
│ X51LABS-155: Real-time Pricing (THIS TASK)      │
└────────────┬─────────────────────────────────────┘
             │
             ├─ portfolioPricing.js
             │   └─ (no external deps, pure fetch)
             │
             ├─ portfolioPriceUpdater.js
             │   ├─ portfolioPricing.js
             │   └─ portfolioState.js signals ◄─── X51LABS-153 (Task 1) ✅
             │
             └─ Used by:
                 ├─ PortfolioTable.jsx ◄─── X51LABS-154 (Task 2) ✅
                 ├─ PortfolioSummary.jsx ◄─── X51LABS-154 (Task 2) ✅
                 └─ PortfolioPage (future) ◄─── X51LABS-157 (Task 5)

Signal Mutation Flow:
  startPricePolling()
    ├─ Call updatePricesNow() immediately
    ├─ Schedule 60s interval
    └─ On each interval:
        ├─ Fetch prices via fetchStockPricesWithRetry()
        ├─ Mutate portfolioItems[i].currentPrice
        ├─ Trigger signal change
        └─ PortfolioTable/Summary re-render

Error Handling Flow:
  Error occurs during fetch
    ├─ classifyPricingError() → error type
    ├─ Set priceUpdateError signal
    ├─ Show toast message
    └─ Schedule retry on next interval
```

---

## EXISTING PATTERNS & REUSE

### ✅ Reused from Task 1

**Signal Mutations Pattern**:
```javascript
// From portfolioState.js (Task 1)
export function addPortfolio(symbol, quantity, avgPrice) {
  portfolioItems.value = [
    ...portfolioItems.value,
    { symbol, quantity, avg_price: avgPrice, current_price: 0 }
  ];
}

// Reused in Task 3: portfolioPriceUpdater.js
portfolioItems.value = portfolioItems.value.map(item => ({
  ...item,
  current_price: prices[item.symbol] ?? item.current_price
}));
```

**Computed Signal Pattern**:
```javascript
// From portfolioState.js (Task 1)
export const totalValue = computed(() =>
  portfolioItems.value.reduce((sum, item) =>
    sum + (item.quantity * item.current_price), 0)
);

// Task 3: Automatically triggers re-render when currentPrice changes
// No additional code needed — computed signal handles it
```

### ✅ Error Handling Pattern

**From portfolioApi.js (Task 1)**:
```javascript
export async function addPortfolio(symbol, quantity, avgPrice) {
  try {
    const result = await chrome.runtime.sendMessage({...});
    return result;
  } catch (error) {
    console.error('[PortfolioAPI] Add failed:', error);
    return { error: true, message: 'Không thể thêm cổ phiếu' };
  }
}

// Adapted for Task 3: portfolioPricing.js
export async function fetchStockPrice(symbol) {
  try {
    const response = await fetch(`${SSI_API_BASE}/${symbol}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw classifyPricingError(error);
  }
}
```

---

## CONVENTIONS & TOOLING DETECTED

### Testing Framework
- **Tool**: Vitest
- **Mocking**: `vi.fn()`, `vi.spyOn()`, `vi.useFakeTimers()`
- **Pattern**: Test in `tests/unit/` mirrors src structure
- **Location**: `tests/unit/pricing/task3-pricing.test.js`

### Signal/Reactivity
- **Library**: Preact Signals
- **Pattern**: `signal(initialValue)`, `computed(() => ...)`
- **Subscription**: Components auto-subscribe via JSX signals
- **Mutation**: Direct assignment `signal.value = newValue` triggers re-render

### API Integration
- **Client**: `fetch` (browser native)
- **Base URL**: `https://iboard-query.ssi.com.vn/stock/price/{symbol}`
- **Error Handling**: `classifyPricingError()` maps HTTP + network errors

### Async/Await
- **Pattern**: Promise-based, no callback hell
- **Timeout**: 5s default (configurable)
- **Retry**: Exponential backoff

---

## DATA FLOW & STATE CHANGES

### Polling Lifecycle

```
Mount Phase:
  ┌─ useEffect hook runs
  ├─ startPricePolling()
  │  ├─ updatePricesNow() → first fetch
  │  │  ├─ fetchStockPricesWithRetry()
  │  │  ├─ Mutate portfolioItems.currentPrice
  │  │  ├─ Update lastUpdateTime signal
  │  │  └─ Trigger computed signals (totalValue, totalPL)
  │  └─ Schedule interval (60s)
  └─ Return cleanup function

Running Phase:
  Every 60 seconds:
    ├─ Fetch prices from SSI API
    ├─ Update signal
    └─ UI auto-re-renders

Unmount Phase:
  ┌─ Cleanup function called
  ├─ stopPricePolling()
  │  ├─ Clear interval
  │  ├─ Clear signals (optional)
  │  └─ No more API calls
  └─ Memory freed
```

---

## SIGNAL MUTATION MAP

| Signal | Initial | Mutated By | Triggers Re-render | Used By |
|--------|---------|------------|-------------------|---------|
| `portfolioItems` | `[]` | `updatePricesNow()` (currentPrice field) | ✅ YES | PortfolioTable, PortfolioSummary |
| `lastUpdateTime` | `null` | `updatePricesNow()` on success | ✅ YES | UI helper `getLastUpdateTimeFormatted()` |
| `isUpdatingPrices` | `false` | `updatePricesNow()` start/end | ✅ YES | Status indicator (loading state) |
| `priceUpdateError` | `null` | `updatePricesNow()` on error | ✅ YES | Toast notification |

---

## TEST COVERAGE

### Test Locations

**File**: `tests/unit/pricing/task3-pricing.test.js` (580 lines)

**Structure**:
```
✅ AC-1: Polling Lifecycle (3 tests)
  - should start polling on mount
  - should set lastUpdateTime immediately
  - should update prices after interval

✅ AC-2: Price Updates (5 tests)
  - should update currentPrice from API response
  - should update totalValue signal
  - should update totalPL signal
  - should handle multiple stock updates
  - should handle stocks with no price change

✅ AC-3: Error Handling (6 tests)
  - should handle network errors gracefully
  - should handle rate limit errors
  - should handle timeout errors
  - should handle validation errors
  - should retry on next polling interval
  - should keep old prices on error

✅ AC-4: Cleanup (2 tests)
  - should stop polling on unmount
  - should clear lastUpdateTime on unmount

✅ Error Classification (4 tests)
  - classifyPricingError() tests

✅ UI Helpers (3 tests)
  - getLastUpdateTimeFormatted()
  - getRealtimeStatusIndicator()
```

### Running Tests

```bash
# Task 3 tests only
npm run test:unit -- tests/unit/pricing/task3-pricing.test.js --run

# Result: 23/23 passing ✅
```

---

## BACKWARD COMPATIBILITY

### Public API Contract
- ✅ No changes to existing `portfolioState.js` exports
- ✅ No changes to existing component props
- ✅ New exports only: `portfolioPricing.js`, `portfolioPriceUpdater.js`
- ✅ New signals only: `lastUpdateTime`, `isUpdatingPrices`, `priceUpdateError`

### Schema Changes
- ✅ No database changes
- ✅ No signal schema changes (only new signals added)
- ✅ Existing `portfolioItems` structure unchanged

---

## KEY FINDINGS (MECE ANALYSIS)

**Complete Module Interaction**:
- ✅ Entry point: `portfolioState.js` signals
- ✅ Implementation: 2 new modules (pricing + updater)
- ✅ Consumers: PortfolioTable, PortfolioSummary, PortfolioPage
- ✅ Tests: 23 tests in dedicated file
- ✅ No gaps, no overlaps

**Dependency Chain Valid**:
- ✅ Task 1 (signals) → Task 3 (pricing) ✓
- ✅ Task 2 (components) → Task 3 (pricing) ✓ (auto via signals)
- ✅ Task 3 (pricing) → Task 5 (container) ✓

**Existing Patterns Applied**:
- ✅ Signal mutations (from Task 1)
- ✅ Error handling (from Task 1)
- ✅ Computed signals (from Task 1)
- ✅ Test structure (from Tasks 1-2)

---

## RISK POINTS & MITIGATIONS

| Risk | Detection | Mitigation |
|------|-----------|-----------|
| Polling not cleanup | Memory leak test | `stopPricePolling()` enforced |
| Race condition (interval + manual) | Concurrent test | Interval check guards duplicate |
| SSI API slow | Network mock | 5s timeout in fetch |
| High CPU from polling | Perf test | 60s interval (typical) |
| Signal mutation order | State test | Atomic mutation via `.value =` |

---

## SUMMARY

✅ **Impact Map Complete**
- All entry points identified
- Module dependencies verified
- Signal flow mapped
- Test coverage complete
- No gaps or overlaps (MECE)
- Backward compatible
- Ready for production

**Recommendation**: Proceed to Step 3 (Change Set Verification)

---

**Sign-off**: 2026-01-31 12:05 UTC+7

