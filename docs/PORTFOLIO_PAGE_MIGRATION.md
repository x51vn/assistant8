# Portfolio Page Migration to Preact

> **Status**: Design Document (No Implementation Yet)  
> **Date**: January 30, 2026  
> **Ticket**: X51LABS-152 (Estimated)  
> **Complexity**: HIGH  
> **Estimated Effort**: 3-4 days (complex data table with realtime updates)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Current Implementation (Vanilla JS)](#current-implementation-vanilla-js)
3. [Target State (Preact)](#target-state-preact)
4. [Component Structure](#component-structure)
5. [State Management](#state-management)
6. [UI Elements & Modals](#ui-elements--modals)
7. [Data Flow & Operations](#data-flow--operations)
8. [Realtime Integration](#realtime-integration)
9. [Special Features](#special-features)
10. [Migration Strategy](#migration-strategy)
11. [Files to Create](#files-to-create)
12. [Acceptance Criteria](#acceptance-criteria)

---

## 📱 Overview

The **Portfolio Page** is one of the most complex features in ChatGPT Assistant. It manages a user's investment portfolio with real-time price updates, P&L calculations, and ChatGPT integration for portfolio analysis.

### Key Features
- ✅ View stock holdings with entry price, current price, quantity, P&L
- ✅ Add/Edit/Delete stocks and CASH
- ✅ Real-time price updates from SSI iBoard API
- ✅ Manual price refresh
- ✅ Portfolio evaluation (send portfolio + custom prompt to ChatGPT)
- ✅ "Tea stock" search (find interesting stocks)
- ✅ Portfolio summary with NAV, entry value, current value, total P&L

### Why Complex?
1. **Large Data Table**: Multiple stocks with 6+ columns (Code, Entry, Current, Qty, P&L, Actions)
2. **Multiple Modals**: Add/Edit stock modal, Price update modal, Confirmation dialogs
3. **Real-time Updates**: SSI API integration with 60s polling
4. **P&L Calculations**: Complex portfolio analytics (entry value, current value, P&L %, NAV)
5. **ChatGPT Integration**: Send portfolio data to ChatGPT for analysis
6. **Special Handling**: CASH item has different UI than regular stocks

---

## 🔧 Current Implementation (Vanilla JS)

### File Structure
```
src/
├── ui/
│   ├── portfolio.js          (1879 lines - MAIN FILE)
│   ├── portfolioPL.js        (216 lines - P&L calculations)
│   └── dom.js                (element selectors)
├── background/
│   └── handlers/
│       └── portfolio.js       (500 lines - Supabase CRUD)
└── market-data/
    └── advanced-client.js    (SSI API polling)
```

### Main Files & Responsibilities

#### `src/ui/portfolio.js` (1879 lines)

**Initialization** (lines 189-380):
```javascript
export async function initPortfolio({
  portfolioPage,        // Container page element
  portfolioTable,       // Table tbody element
  addStockBtn,          // "Add stock" button
  stockCodeInput,       // Input for modal
  entryInput,           // Input for entry price
  quantityInput,        // Input for quantity
  promptInput,          // Portfolio evaluation prompt
  evaluateBtn,          // "Evaluate" button
  teaStockBtn,          // "Tea stock" button
  teaStockPromptInput   // Tea stock prompt
})
```

**Key Functions**:

1. **`getPortfolioFromSupabase()`** (lines 24-76)
   - Fetches portfolio from Supabase via background handler
   - Transform: `symbol` → `code`, `avg_price` → `entry`, `current_price` → `currentPrice`

2. **`loadPortfolioUI(table)`** (lines 382-550)
   - Render portfolio table with stocks
   - Calculate P&L for each stock
   - Display portfolio summary (NAV, entry, current, total P&L)
   - Sort: regular stocks first, CASH always at bottom
   - Special styling for CASH row (light blue background, bold)

3. **`openAddStockModal(portfolioTable)`** (lines 664-710)
   - Modal for adding new stock or CASH
   - Validates: code required, quantity + entry (or quantity + 1 for CASH)
   - If stock exists → increment quantity (merge mode)
   - If new → add to Supabase

4. **`openEditStockModal(id, portfolioTable)`** (lines 712-755)
   - Edit existing stock or CASH
   - For CASH: hide entry price field
   - For stocks: show all fields

5. **`evaluatePortfolio(prompt)`** (lines 771-895)
   - Build markdown table with: Code | Entry | Current | Qty | P&L
   - Send portfolio data + user prompt to ChatGPT via `MESSAGE_TYPES.SEND_PROMPT`
   - Poll for ChatGPT response (max 60 * 2s = 2 minutes)
   - Auto-save chat history to Supabase

6. **`openPriceUpdateModal(portfolioTable)`** (lines 1006-1040)
   - List all non-CASH stocks with input for current price
   - Show entry price for reference

7. **`startRealtimeUpdates(portfolioTable)`** (lines 1123+)
   - Initialize `AdvancedMarketDataClient` (60s polling from SSI)
   - Subscribe to price changes via `currentSubscriptions` map
   - Auto-update table rows when price changes

8. **`manualRefreshPrices(portfolioTable)`** (lines 1200+)
   - Fetch latest prices from SSI API
   - Update portfolio table rows

**Helper Functions**:
- `addStock(code, entry, quantity)` - Add stock to Supabase
- `updateStock(id, code, entry, quantity)` - Update stock in Supabase
- `deleteStock(id, symbol)` - Delete stock from Supabase
- `escapeHtml(str)` - XSS prevention
- `getModalElements()` - Modal element selectors
- `configureModalFields(elements, config)` - Set modal title, values, visibility
- `setupModalSaveButton(elements, onSave)` - Attach save listener

**Data Structures**:

Portfolio item from Supabase:
```javascript
{
  id: 'uuid',
  symbol: 'VNM',                  // Stock code
  quantity: 100,                  // Number of shares
  avg_price: 85000,              // Average entry price
  current_price: 90000,          // Latest price
  notes: 'Optional notes',
  created_at: '2026-01-30T...',
  updated_at: '2026-01-30T...'
}
```

UI transformed format:
```javascript
{
  id: 'uuid',
  code: 'VNM',                    // Display code
  symbol: 'VNM',                  // Same as code
  quantity: 100,
  entry: 85000,
  avg_price: 85000,              // Kept for compatibility
  currentPrice: 90000,           // UI display name
  current_price: 90000,          // Kept for compatibility
  priceUpdatedAt: '2026-01-30T...',
  notes: 'Optional notes'
}
```

#### `src/ui/portfolioPL.js` (216 lines)

**P&L Calculation Functions**:

1. **`calculateStockPL(stock)`**
   - Returns: `{ entryValue, currentValue, pl, plPercent, priceChange, priceChangePercent }`
   - Formula: 
     - `entryValue = entry * quantity`
     - `currentValue = currentPrice * quantity`
     - `pl = currentValue - entryValue`
     - `plPercent = (pl / entryValue) * 100`

2. **`calculatePortfolioTotalPL(portfolio)`**
   - Sum all stock P&L
   - Returns: `{ totalEntryValue, totalCurrentValue, totalPL, totalPLPercent, stocks[], cash }`

3. **`getPortfolioData()`**
   - Fetch from Supabase and transform format

#### `src/background/handlers/portfolio.js` (500 lines)

**Handlers**:

1. **`MESSAGE_TYPES.PORTFOLIO_GET`**
   - Query all portfolio items for current user
   - Requires auth
   - Returns: `{ success: true, items: [...] }`

2. **`MESSAGE_TYPES.PORTFOLIO_ADD`**
   - Insert new stock
   - Input: `{ symbol, quantity, avgPrice, notes }`
   - Validation: symbol required, quantity > 0, avgPrice > 0
   - Unique constraint: `(user_id, symbol)` - one stock per user
   - Returns: created item or error

3. **`MESSAGE_TYPES.PORTFOLIO_UPDATE`**
   - Update existing stock
   - Input: `{ symbol, updates: { quantity, avg_price, current_price, notes } }`
   - Returns: updated item or error

4. **`MESSAGE_TYPES.PORTFOLIO_REMOVE`**
   - Delete stock by symbol
   - Input: `{ symbol }`
   - Returns: `{ id, symbol }` or error

---

## 🎯 Target State (Preact)

### Architecture
```
src/ui-preact/
├── state/
│   └── portfolioState.js         (NEW - Signal-based state)
├── api/
│   └── portfolioApi.js           (NEW - Message routing)
├── components/
│   ├── PortfolioPage.jsx         (NEW - Main container)
│   ├── PortfolioTable.jsx        (NEW - Table component)
│   ├── StockRow.jsx              (NEW - Individual stock row)
│   ├── StockModal.jsx            (NEW - Add/Edit modal)
│   ├── PriceUpdateModal.jsx      (NEW - Bulk price update)
│   ├── PortfolioSummary.jsx      (NEW - Summary stats)
│   ├── ConfirmationDialog.jsx    (EXISTING - Reuse from settings)
│   └── StatusMessage.jsx         (EXISTING - Reuse from settings)
└── styles/
    └── portfolio.css             (NEW - Portfolio-specific styles)
```

### Component Tree

```
PortfolioPage
├── PortfolioSummary
│   ├── NAV
│   ├── Entry Value
│   ├── Current Value
│   └── Total P&L
├── PortfolioActions
│   ├── "+ Add Stock" button
│   ├── "Refresh Prices" button
│   ├── "Evaluate" button
│   └── "Tea Stock" button
├── PortfolioTable
│   └── StockRow (x N)
│       ├── Code (special styling for CASH)
│       ├── Entry Price
│       ├── Current Price
│       ├── Quantity
│       ├── P&L (colored)
│       └── Actions (Edit/Delete)
├── StockModal (Add/Edit)
│   ├── Title: "Add Stock" or "Edit Stock"
│   ├── Code input
│   ├── Entry Price input (hidden for CASH)
│   ├── Quantity input
│   ├── Save & Cancel buttons
│   └── Conditional rendering for CASH vs regular
├── PriceUpdateModal (Bulk update)
│   ├── Price inputs for each stock
│   ├── Save & Cancel buttons
│   └── Reference entry prices
├── ConfirmationDialog (Delete/Reset)
├── StatusMessage (Feedback: success/error/info)
└── (Realtime subscriptions via signals)
```

---

## 🧩 Component Structure

### 1. **PortfolioPage.jsx** (Main Container)

**Props**: None (signals manage all state)

**Features**:
- Load portfolio on mount via `useEffect`
- Load portfolio prompt on mount
- Initialize realtime updates
- Listen for auth state changes
- Render subcomponents conditionally
- Show loading/empty states

**Pseudo-code**:
```jsx
export function PortfolioPage() {
  const portfolio = useSignal([]);
  const loading = useSignal(true);
  const error = useSignal(null);
  
  useEffect(async () => {
    try {
      const data = await portfolioApi.getPortfolio();
      portfolio.value = data;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }, []);
  
  useEffect(() => {
    startRealtimeUpdates();
  }, [portfolio.value.length]);
  
  return (
    <div class="portfolio-page">
      {error.value && <StatusMessage message={error.value} type="error" />}
      {loading.value ? <div>Loading...</div> : (
        <>
          <PortfolioSummary portfolio={portfolio.value} />
          <PortfolioActions portfolio={portfolio.value} onRefresh={() => {...}} />
          <PortfolioTable portfolio={portfolio.value} />
        </>
      )}
      <StockModal />
      <PriceUpdateModal />
      <ConfirmationDialog />
    </div>
  );
}
```

### 2. **PortfolioTable.jsx** (Data Grid)

**Props**: `{ portfolio }`

**Features**:
- Render table with headers (Code, Entry, Current, Qty, P&L, Actions)
- Map portfolio items to `StockRow` components
- Special styling for CASH row
- Sort: regular stocks first, CASH last
- Show empty state if no stocks
- Responsive design (horizontal scroll on mobile)

**Column Definitions**:
| Column | Width | Format | Notes |
|--------|-------|--------|-------|
| Code | 80px | Text | CASH = bold + blue bg |
| Entry | 100px | Currency | Hidden for CASH |
| Current | 100px | Currency | Hidden for CASH, "-" if unknown |
| Quantity | 80px | Number | Short format (200M for 200000000) |
| P&L | 120px | Currency + % | Colored (green/red) |
| Actions | 80px | Buttons | Edit, Delete dropdowns |

### 3. **StockRow.jsx** (Table Row)

**Props**: `{ stock, index, onEdit, onDelete }`

**Features**:
- Render single stock row
- Calculate P&L if currentPrice available
- Color P&L: green if positive, red if negative, gray if unknown
- Dropdown menu for Edit/Delete actions
- Special rendering for CASH (hide entry/current, show only qty)
- Escape HTML for XSS prevention

**Pseudo-code**:
```jsx
export function StockRow({ stock, onEdit, onDelete }) {
  const isCash = stock.code === 'CASH';
  const pl = calculateStockPL(stock);
  
  return (
    <tr class={isCash ? 'stock-row cash-row' : 'stock-row'}>
      <td class="code-col">{stock.code}</td>
      {!isCash && (
        <>
          <td>{formatCurrency(stock.entry)}</td>
          <td>{stock.currentPrice ? formatCurrency(stock.currentPrice) : '-'}</td>
        </>
      )}
      <td>{formatShortNumber(stock.quantity)}</td>
      {!isCash && (
        <td class={pl ? getPLClass(pl.pl) : ''}>
          {pl ? `${formatCurrency(pl.pl)} ${formatPercent(pl.plPercent)}` : '-'}
        </td>
      )}
      <td class="actions-col">
        <ActionMenu onEdit={() => onEdit(stock)} onDelete={() => onDelete(stock)} />
      </td>
    </tr>
  );
}
```

### 4. **PortfolioSummary.jsx** (Summary Stats)

**Props**: `{ portfolio }`

**Displays**:
- **NAV** (Net Asset Value): Sum of all stock current values + CASH
- **Entry Value**: Sum of all entry values
- **Current Value**: Sum of all current values
- **Total P&L**: Current - Entry (with % calculation)

**Formula**:
```javascript
const cashAmount = portfolio.find(s => s.code === 'CASH')?.quantity || 0;
const totalNAV = calculateTotalCurrentValue(portfolio) + cashAmount;
const totalEntryValue = calculateTotalEntryValue(portfolio);
const totalCurrentValue = calculateTotalCurrentValue(portfolio);
const totalPL = totalCurrentValue - totalEntryValue;
const totalPLPercent = (totalPL / totalEntryValue) * 100;
```

**Styling**:
- Card layout with shadow
- Four stat boxes (NAV, Entry, Current, P&L)
- P&L colored (green/red)
- Use short number format (200M, 1.5B)
- Hide if no current prices available

### 5. **StockModal.jsx** (Add/Edit Modal)

**Props**: None (uses signals)

**Signals Used**:
- `stockModalOpen` - Visibility
- `stockModalMode` - 'add' | 'edit'
- `stockModalData` - Current stock being edited
- `stockModalErrors` - Validation errors

**Fields**:
- **Code**: Text input, uppercase auto-convert
  - Readonly when editing
  - Placeholder: "VNM, BID, CASH, ..."
  - Validation: required, non-empty
- **Entry Price**: Number input
  - Hidden when `code === 'CASH'`
  - Label changes: "Entry Price" vs "Số tiền sẵn sàng" (for CASH)
  - Validation: required, > 0
- **Quantity**: Number input
  - Label: "Khối lượng" (stocks) or "Số tiền sẵn sàng" (CASH)
  - Validation: required, > 0

**Behavior**:
- When adding existing stock → merge (add quantities)
- When adding new stock → insert
- When editing → update only quantity + entry price (not code)
- Clear errors on open
- Close on cancel or success

### 6. **PriceUpdateModal.jsx** (Bulk Price Update)

**Props**: None (uses signals)

**Signals Used**:
- `priceUpdateModalOpen` - Visibility
- `priceUpdates` - Map of code → price

**Features**:
- List all non-CASH stocks
- Input field for each stock's current price
- Show entry price for reference
- Save all prices at once
- Clear errors on open

### 7. **PortfolioActions.jsx** (Action Buttons)

**Props**: `{ portfolio, onRefresh }`

**Buttons**:
1. **"+ Add Stock"** - Open StockModal in 'add' mode
2. **"Refresh Prices"** (icon: sync) - Fetch latest SSI prices, show spinner while loading
3. **"Evaluate"** - Send portfolio + prompt to ChatGPT (button with spinner)
4. **"Tea Stock"** (icon: leaf) - Search for interesting stocks via ChatGPT

---

## 💾 State Management

### Portfolio State Signals (`src/ui-preact/state/portfolioState.js`)

```javascript
// Data signals
export const portfolio = signal([]);           // Array of stock items
export const loading = signal(false);          // Loading state
export const error = signal(null);             // Error message
export const lastRefresh = signal(null);       // Last price refresh time

// Modal signals
export const stockModalOpen = signal(false);
export const stockModalMode = signal('add');   // 'add' | 'edit'
export const stockModalData = signal(null);    // Current stock being edited
export const priceUpdateModalOpen = signal(false);
export const priceUpdates = signal({});        // code -> price map

// Realtime signals
export const realtimeActive = signal(false);
export const realtimeError = signal(null);
export const priceSubscriptions = signal(new Map()); // code -> unsubscribe func

// UI state
export const selectedStockForDelete = signal(null);
export const sortBy = signal('code');          // Sort column
export const sortOrder = signal('asc');        // 'asc' | 'desc'

// Helper functions
export async function loadPortfolio() {
  loading.value = true;
  try {
    const data = await portfolioApi.getPortfolio();
    portfolio.value = data;
    error.value = null;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

export async function addStock(code, entry, quantity) {
  loading.value = true;
  try {
    const result = await portfolioApi.addStock(code, entry, quantity);
    // Reload portfolio after add
    await loadPortfolio();
    showStatus(`Added ${code}`, 'success');
  } catch (e) {
    showStatus(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

export async function updateStock(code, quantity, entry) { ... }
export async function deleteStock(code) { ... }
export async function refreshPrices() { ... }
export async function evaluatePortfolio(prompt) { ... }

export function openStockModal(mode = 'add', stock = null) { ... }
export function closeStockModal() { ... }
export function openPriceUpdateModal() { ... }
export function closePriceUpdateModal() { ... }
```

---

## 🎨 UI Elements & Modals

### Modal 1: Add/Edit Stock

**Template**:
```
┌─────────────────────────────────────┐
│  [X]  Thêm/Sửa Mã                 │
├─────────────────────────────────────┤
│ Mã cổ phiếu:                        │
│ [_________________]  ← readonly if edit
│                                     │
│ Entry Price: (hidden for CASH)      │
│ [_________________]                 │
│                                     │
│ Khối lượng/Số tiền:                 │
│ [_________________]                 │
│                                     │
│ [Cancel]  [Save]                    │
└─────────────────────────────────────┘
```

### Modal 2: Price Update

**Template**:
```
┌──────────────────────────────────────┐
│ [X]  Cập Nhật Giá                   │
├──────────────────────────────────────┤
│ VNM     [90000]  (Entry: 85000)      │
│ BID     [45500]  (Entry: 43000)      │
│ SSB     [28000]  (Entry: 26500)      │
│ CASH    [—]                          │
│                                      │
│ [Cancel]  [Save]                     │
└──────────────────────────────────────┘
```

### Modal 3: Confirmation (Reuse from Settings)

- Delete stock: "Are you sure you want to delete VNM?"
- Reset prices: "Reset all prices to entry?"

---

## 🔄 Data Flow & Operations

### Flow 1: Load Portfolio

```
User Opens Page
    ↓
PortfolioPage.useEffect()
    ↓
portfolioState.loadPortfolio()
    ↓
portfolioApi.getPortfolio()
    ↓
chrome.runtime.sendMessage(MESSAGE_TYPES.PORTFOLIO_GET)
    ↓
Background Handler (portfolio.js)
    ↓
Supabase Query: SELECT * FROM portfolio WHERE user_id = ?
    ↓
Response: { items: [...] }
    ↓
Update signal: portfolio.value = items
    ↓
Re-render: PortfolioTable shows rows
```

### Flow 2: Add Stock

```
User clicks "+ Add Stock"
    ↓
openStockModal('add')
    ↓
Render: StockModal with empty fields
    ↓
User fills: Code=VNM, Entry=85000, Qty=100
    ↓
User clicks "Save"
    ↓
portfolioApi.addStock('VNM', 85000, 100)
    ↓
chrome.runtime.sendMessage(MESSAGE_TYPES.PORTFOLIO_ADD)
    ↓
Background: INSERT INTO portfolio VALUES (...)
    ↓
Response: { id: 'uuid', symbol: 'VNM', ... }
    ↓
portfolioState.loadPortfolio() ← Reload from Supabase
    ↓
portfolio.value updated
    ↓
Re-render with new stock
```

### Flow 3: Edit Stock

```
User clicks Edit on stock row
    ↓
openStockModal('edit', stock)
    ↓
Render: StockModal with filled fields (Code readonly)
    ↓
User changes: Qty=150, Entry=86000
    ↓
User clicks "Save"
    ↓
portfolioApi.updateStock('VNM', 150, 86000)
    ↓
chrome.runtime.sendMessage(MESSAGE_TYPES.PORTFOLIO_UPDATE)
    ↓
Background: UPDATE portfolio SET quantity=150, avg_price=86000 WHERE symbol='VNM'
    ↓
Response: { id, symbol, quantity, avg_price, ... }
    ↓
loadPortfolio()
    ↓
Re-render table
```

### Flow 4: Delete Stock

```
User clicks Delete on stock row
    ↓
showConfirm("Delete VNM?")
    ↓
User confirms
    ↓
portfolioApi.deleteStock('VNM')
    ↓
chrome.runtime.sendMessage(MESSAGE_TYPES.PORTFOLIO_REMOVE)
    ↓
Background: DELETE FROM portfolio WHERE symbol='VNM'
    ↓
Response: { id, symbol }
    ↓
loadPortfolio()
    ↓
Re-render table (stock removed)
```

### Flow 5: Evaluate Portfolio

```
User clicks "Evaluate"
    ↓
User has entered evaluation prompt in settings
    ↓
portfolioApi.evaluatePortfolio(prompt)
    ↓
Build markdown: "| Code | Entry | Current | Qty | P&L |"
    ↓
Combine: portfolio_table + user_prompt
    ↓
Send: MESSAGE_TYPES.SEND_PROMPT with full text
    ↓
Background: Create/open ChatGPT tab, inject prompt
    ↓
Content script: Type prompt into ChatGPT
    ↓
User sees ChatGPT response in ChatGPT tab
    ↓
Poll for response (60 times * 2s = 2 min max)
    ↓
Auto-save to chat history
    ↓
showStatus("Evaluation sent", 'info')
```

---

## 🔌 Realtime Integration

### Architecture

Portfolio uses **SSI iBoard API** with **polling** (not WebSocket):
- Poll every 60 seconds (configurable)
- Fetch latest prices for all stocks
- Update table rows when prices change

### Implementation

**Current (Vanilla JS)**:
```javascript
const realtimeClient = new AdvancedMarketDataClient({
  realtimeEnabled: true,
  pollInterval: 60000,      // 60 seconds
  minUpdateInterval: 60000, // 60 seconds
  debug: isDebugMode
});

realtimeClient.subscribe(['VNM', 'BID', 'SSB'], (data) => {
  // data: { VNM: { price: 90000, bid: 89500, ask: 90500 }, ... }
  // Update portfolio table with new prices
});
```

**Target (Preact)**:
```jsx
// portfolioState.js
export async function initRealtimeUpdates() {
  if (realtimeActive.value) return; // Already running
  
  realtimeActive.value = true;
  
  const symbols = portfolio.value
    .filter(s => s.code !== 'CASH')
    .map(s => s.code);
  
  if (symbols.length === 0) return;
  
  const client = new AdvancedMarketDataClient({ ... });
  
  client.subscribe(symbols, (priceData) => {
    // Update portfolio signals with new prices
    portfolio.value = portfolio.value.map(stock => ({
      ...stock,
      currentPrice: priceData[stock.code]?.price || stock.currentPrice
    }));
    
    lastRefresh.value = new Date();
  });
}
```

### Cleanup

Stop realtime when component unmounts:
```jsx
useEffect(() => {
  return () => {
    // Unsubscribe from realtime
    priceSubscriptions.value.forEach(unsubscribe => unsubscribe());
    realtimeActive.value = false;
  };
}, []);
```

---

## ⭐ Special Features

### 1. CASH Handling

**CASH** is special:
- Represents liquid funds
- Only has quantity (entry price = 1)
- Always sorted at bottom of table
- Different row styling (light blue, bold)
- In modals:
  - Hide "Entry Price" field
  - Label "Quantity" as "Số tiền sẵn sàng" (Available cash)

### 2. P&L Coloring

**Color codes**:
- **Green**: P&L > 0 (profit)
- **Red**: P&L < 0 (loss)
- **Gray**: No current price (unknown)
- **Default**: CASH row (no P&L)

### 3. Number Formatting

**Short format** (e.g., 200000000 → 200M):
- Used in summary (NAV, Entry, Current, P&L)
- Used in table (Current, Qty, P&L)
- Function: `formatShortNumber(value)`

**Currency format** (with commas):
- Used in modals (entry, current prices)
- Function: `formatCurrency(value)`

**Percent format**:
- Function: `formatPercent(percent)` → "1.5%"

### 4. Realtime Status Indicator

**Display realtime status**:
- "🔴 Live" if realtime active
- "⚪ Paused" if realtime inactive
- "🔴 Error: ..." if realtime failed
- Last refresh time: "Last updated: 2 min ago"

### 5. Error Handling

**User-friendly messages**:
- "Cổ phiếu VNM đã có trong danh mục" (duplicate)
- "Không thể kết nối đến SSI API" (network error)
- "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." (auth error)

---

## 🚀 Migration Strategy

### Phase 1: Prepare Signals & API (1 day)

1. Create `src/ui-preact/state/portfolioState.js`
   - Define all signals
   - Implement `loadPortfolio()`, `addStock()`, etc.
   - Implement realtime helpers

2. Create `src/ui-preact/api/portfolioApi.js`
   - Convert vanilla JS functions to API calls
   - Handle error dual-format (error vs errorCode)
   - Add message correlation IDs

### Phase 2: Build Components (2 days)

1. **PortfolioPage.jsx** - Main container
   - `useEffect` to load portfolio on mount
   - Subscribe to realtime updates
   - Render subcomponents

2. **PortfolioTable.jsx** - Data grid
   - Render stocks as rows
   - Sort logic (regular first, CASH last)
   - Empty state

3. **StockRow.jsx** - Individual row
   - P&L calculation and coloring
   - Action dropdown
   - Special rendering for CASH

4. **PortfolioSummary.jsx** - Summary stats
   - NAV, Entry, Current, Total P&L
   - Coloring and formatting

5. **StockModal.jsx** - Add/Edit modal
   - Conditional fields for CASH
   - Validation
   - Save logic

6. **PriceUpdateModal.jsx** - Bulk price update
   - List all stocks with input
   - Save all prices

7. **PortfolioActions.jsx** - Action buttons
   - Add, Refresh, Evaluate, Tea Stock

### Phase 3: Integration & Testing (1 day)

1. Wire up modals to state signals
2. Test all CRUD operations
3. Test realtime price updates
4. Test ChatGPT evaluation flow
5. Test error handling
6. Test dark/light theme

### Phase 4: Polish & Deployment (1 day)

1. Apply theme tokens (CSS variables)
2. Responsive design (mobile)
3. Performance optimization
4. Jira acceptance test
5. Merge to main branch

---

## 📝 Files to Create

### New Files (8 total)

| File | Lines | Purpose |
|------|-------|---------|
| `src/ui-preact/state/portfolioState.js` | ~150 | Signal management |
| `src/ui-preact/api/portfolioApi.js` | ~100 | Message API calls |
| `src/ui-preact/components/PortfolioPage.jsx` | ~120 | Main container |
| `src/ui-preact/components/PortfolioTable.jsx` | ~80 | Table grid |
| `src/ui-preact/components/StockRow.jsx` | ~70 | Table row |
| `src/ui-preact/components/PortfolioSummary.jsx` | ~80 | Summary stats |
| `src/ui-preact/components/StockModal.jsx` | ~150 | Add/Edit modal |
| `src/ui-preact/components/PriceUpdateModal.jsx` | ~100 | Bulk price update |

### Modified Files (1 total)

| File | Changes |
|------|---------|
| `src/extension/styles.css` | Add portfolio-specific theme tokens & styles |

### Reference Files (No changes needed)

| File | Usage |
|------|-------|
| `src/ui-preact/components/ConfirmationDialog.jsx` | Reuse for delete confirmations |
| `src/ui-preact/components/StatusMessage.jsx` | Reuse for success/error messages |
| `src/ui-preact/state/settingsState.js` | Reference for signal patterns |
| `src/ui-preact/api/authApi.js` | Reference for API error handling |

---

## ✅ Acceptance Criteria

### AC1: Portfolio Data Display ✓
- [ ] Load portfolio from Supabase on page open
- [ ] Display all stocks in table (Code, Entry, Current, Qty, P&L)
- [ ] CASH item always at bottom with special styling (light blue, bold)
- [ ] Show portfolio summary (NAV, Entry, Current, Total P&L)
- [ ] P&L colored (green > 0, red < 0, gray if no current price)
- [ ] Show empty state if no stocks

### AC2: Add Stock Operation ✓
- [ ] "+ Add Stock" button opens modal
- [ ] Fields: Code, Entry Price, Quantity
- [ ] If stock exists → merge (add quantities)
- [ ] If new → add to Supabase
- [ ] CASH special handling (hide entry, qty = cash amount)
- [ ] Success message on add
- [ ] Table refreshes automatically

### AC3: Edit Stock Operation ✓
- [ ] Edit button on each stock row opens modal
- [ ] Code field readonly
- [ ] Can edit: Entry Price, Quantity
- [ ] Updates Supabase
- [ ] Table refreshes automatically
- [ ] Success message on update

### AC4: Delete Stock Operation ✓
- [ ] Delete button on each stock row
- [ ] Shows confirmation dialog ("Delete VNM?")
- [ ] Remove from Supabase on confirm
- [ ] Table refreshes automatically
- [ ] Success message on delete

### AC5: Price Updates ✓
- [ ] "Refresh Prices" button fetches latest from SSI API
- [ ] Button shows spinner while loading
- [ ] Manual "Price Update" modal for bulk updates
- [ ] Can update current price for each stock
- [ ] Realtime polling every 60s (if enabled)
- [ ] Auto-refresh table when prices change

### AC6: Portfolio Evaluation ✓
- [ ] "Evaluate" button sends portfolio to ChatGPT
- [ ] Includes: Code | Entry | Current | Qty | P&L in markdown
- [ ] Combines with user prompt from settings
- [ ] Auto-saves chat history to Supabase
- [ ] Shows spinner while sending
- [ ] Success message on completion

### AC7: Tea Stock Search ✓
- [ ] "Tea Stock" button sends search prompt to ChatGPT
- [ ] Uses prompt from settings
- [ ] Auto-saves chat history
- [ ] Shows spinner while sending

### AC8: Theme Support ✓
- [ ] Light theme: white surfaces, dark text
- [ ] Dark theme: dark surfaces, light text
- [ ] Respects system `prefers-color-scheme`
- [ ] All components use CSS custom properties (theme tokens)
- [ ] Smooth theme transitions

### AC9: Modals & Dialogs ✓
- [ ] Add/Edit modal with proper validation
- [ ] Price Update modal lists all stocks
- [ ] Confirmation dialog for destructive actions
- [ ] In-extension popups (no native `confirm()` or `alert()`)
- [ ] Smooth animations (fade in/out)

### AC10: Error Handling ✓
- [ ] User-friendly error messages in Vietnamese
- [ ] Handle network errors
- [ ] Handle auth errors (session expired)
- [ ] Handle validation errors (empty fields)
- [ ] Show errors in status message component
- [ ] Auto-dismiss errors after 5s

### AC11: Responsive Design ✓
- [ ] Table scrolls horizontally on mobile
- [ ] Modals scale to viewport
- [ ] Touch-friendly buttons (40px min height)
- [ ] Action dropdown works on touch

### AC12: Performance ✓
- [ ] Initial load < 2s
- [ ] Smooth table scrolling
- [ ] Realtime updates without lag
- [ ] No memory leaks (cleanup on unmount)
- [ ] Build size: < 350 KB (gzipped < 100 KB)

---

## 🔍 Implementation Notes

### Key Challenges

1. **Large Data Table**: May need virtualization if 100+ stocks
   - Solution: Use simple approach first, optimize if needed
   
2. **Realtime Updates**: SSI API has CORS restrictions
   - Current: Polling (60s)
   - Solution: Content script proxy or backend proxy
   
3. **Modal State Management**: Multiple modals (Add, Edit, Price Update, Confirm)
   - Solution: Signals for each modal open/data state
   
4. **P&L Calculations**: Complex formulas with multiple dependencies
   - Solution: Memoize calculations to avoid re-compute

### Reusable Components from Settings

- **ConfirmationDialog**: Delete confirmations
- **StatusMessage**: Success/error/info toasts
- **Theme tokens**: CSS custom properties already in place

### New Utilities Needed

From `portfolioPL.js`:
- `calculateStockPL(stock)` - Reuse vanilla JS function
- `calculatePortfolioTotalPL(portfolio)` - Reuse vanilla JS function
- `formatShortNumber(value)` - Already exists
- `formatCurrency(value)` - Already exists
- `formatPercent(percent)` - Already exists
- `getPLClass(pl)` - Color CSS class

---

## 📊 Complexity Matrix

| Aspect | Complexity | Effort |
|--------|-----------|--------|
| UI Components | Medium | 2 days |
| State Management | Medium | 1 day |
| API Integration | Low | 0.5 days |
| Realtime Updates | Low | 0.5 days |
| Error Handling | Medium | 0.5 days |
| Testing | Medium | 1 day |
| **Total** | **Medium-High** | **~3-4 days** |

---

## 🎓 Learning References

### Similar Pages in Codebase

- **Settings Page**: ✅ Already migrated to Preact (X51LABS-151)
  - Signal patterns
  - Modal handling
  - Form validation
  - Theme integration

- **History Page**: Still in vanilla JS
  - Table rendering (can learn structure)
  - Message CRUD operations
  - Pagination/filtering

### Message Types Used

- `MESSAGE_TYPES.PORTFOLIO_GET` - Fetch portfolio
- `MESSAGE_TYPES.PORTFOLIO_ADD` - Add stock
- `MESSAGE_TYPES.PORTFOLIO_UPDATE` - Update stock
- `MESSAGE_TYPES.PORTFOLIO_REMOVE` - Delete stock
- `MESSAGE_TYPES.SEND_PROMPT` - Send to ChatGPT
- `MESSAGE_TYPES.HISTORY_ADD` - Save to chat history
- `MESSAGE_TYPES.HISTORY_UPDATE` - Update chat response

---

## 📌 Summary

The **Portfolio Page** is a feature-rich investment portfolio manager with:
- ✅ Complex data table with real-time updates
- ✅ Multiple modals and forms
- ✅ P&L calculations and analytics
- ✅ ChatGPT integration for analysis
- ✅ Special handling for CASH item
- ✅ Theme support (light/dark)

**Migration Approach**: Leverage existing Preact patterns from Settings page, build modular components, use signals for state, and reuse confirmation/status components.

**Estimated Effort**: 3-4 days for experienced developer familiar with Preact + signals + message API.

