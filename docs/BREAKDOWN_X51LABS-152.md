# Task Breakdown: X51LABS-152 Portfolio Preact Migration

> **Status**: Decomposition Complete (Ready for Jira Creation)  
> **Date**: January 31, 2026  
> **Big Task**: X51LABS-152 - Migrate Portfolio page from vanilla JS to Preact  
> **Total Tasks**: 7 (2-4 hours each)  
> **Total Effort**: ~20-28 hours (~1 week)  
> **Process**: breakdown-tasks.prompt.md compliance

---

## 📋 Step 1: Restate Big Task + Define "DONE"

### Big Task (Restated)
**Migrate the Portfolio page from vanilla JavaScript (1879 lines) to Preact with signal-based state management, achieving feature parity with the Settings page pattern (X51LABS-151), while maintaining Supabase integration and user-friendly error handling.**

### Big-Task "DONE" Deliverables (Observable Outcomes)
1. ✅ **Portfolio page renders in Preact** with all 8 components (Table, Summary, Modals, Actions)
2. ✅ **Full CRUD operations work** (Add/Edit/Delete stocks) via MESSAGE_TYPES.PORTFOLIO_*
3. ✅ **Real-time price updates** from SSI API (60s polling) update UI reactively
4. ✅ **Dark/light theme support** works with CSS custom properties
5. ✅ **ChatGPT integration** works (evaluate portfolio flow)
6. ✅ **User-friendly error messages** in Vietnamese (network, auth, validation)
7. ✅ **E2E tests pass** and manual QA verified (dark theme, CASH handling, empty state)
8. ✅ **Zero Supabase schema changes** (backward compatible)

### Assumptions & Open Questions
- ✅ **ASSUMPTION**: Preact signals pattern from X51LABS-151 (Settings) applies here
- ✅ **ASSUMPTION**: No new dependencies allowed (use Preact 10.28.2 + @preact/signals 1.3.3)
- ✅ **ASSUMPTION**: SSI API 60s polling approach remains (no WebSocket upgrade)
- ✅ **ASSUMPTION**: E2E test framework already in place (Playwright)
- ✅ **ASSUMPTION**: Baseline component library (ConfirmationDialog, StatusMessage) available
- ❓ **QUESTION**: Should portfolio virtualization be added for 1000+ stocks? → **NO (MVP scope)**
- ❓ **QUESTION**: Keep vanilla portfolio.js for reference? → **YES (post-migration cleanup)**

---

## 📊 Step 2: Impact Map (High-Level)

### Affected Areas & Modules

```
src/
├── ui-preact/              ← PRIMARY CHANGES
│   ├── state/
│   │   └── portfolioState.js          [NEW] 15+ signals + helpers
│   ├── api/
│   │   └── portfolioApi.js            [NEW] Message routing
│   ├── portfolio/
│   │   ├── PortfolioPage.jsx          [NEW] Main container
│   │   ├── PortfolioTable.jsx         [NEW] Data grid
│   │   ├── StockRow.jsx               [NEW] Row component
│   │   ├── PortfolioSummary.jsx       [NEW] Summary stats
│   │   ├── StockModal.jsx             [NEW] Add/Edit modal
│   │   ├── PriceUpdateModal.jsx       [NEW] Price update modal
│   │   ├── PortfolioActions.jsx       [NEW] Action buttons
│   │   └── styles.css                 [NEW] Component styles
│   └── index.js                       [MODIFY] Route to new page
│
├── extension/
│   ├── manifest.json                  [NO CHANGE]
│   ├── styles.css                     [MODIFY] Portfolio theme tokens
│   └── sidepanel.html                 [NO CHANGE]
│
├── ui/
│   ├── portfolio.js                   [KEEP] Reference only (will remove in cleanup)
│   └── portfolioPL.js                 [REFERENCE] Copy P&L logic
│
├── background/
│   └── handlers/
│       └── portfolio.js               [NO CHANGE] Already has PORTFOLIO_* handlers
│
└── shared/
    └── messageSchema.js               [NO CHANGE] MESSAGE_TYPES already defined
```

### Dependencies & Blockers
- ✅ **Prerequisite**: X51LABS-151 Settings Preact migration (pattern reference)
- ✅ **Prerequisite**: X51LABS-150 Signals foundation (already completed)
- ✅ **Available**: Portfolio handlers in background (500 lines, CRUD working)
- ✅ **Available**: Vanilla portfolio.js (1879 lines, reference implementation)
- ✅ **Available**: Preact component patterns (SettingsPage.jsx, ConfirmationDialog, etc.)
- ⚠️ **Watch**: SSI API rate limiting (mitigation: batch requests, 60s polling)

### Data Flows Affected
1. **Load Portfolio**: UI → Background → Supabase → Signal update → UI render
2. **Add Stock**: Modal input → Validation → Background → Supabase → Signal update
3. **Edit Stock**: Modal open → Load data → Update → Background → Supabase → Signal update
4. **Delete Stock**: Confirmation → Background → Supabase → Signal update (filter)
5. **Realtime Updates**: SSI API (60s poll) → Background (local update) → Signal → UI reactive
6. **Evaluate Portfolio**: Collect data → ChatGPT prompt → Save response → History

### Versions & Conventions (Evidence)
- **Preact**: 10.28.2 (via package.json)
- **@preact/signals**: 1.3.3 (via package.json)
- **Vite**: 5.0.0 (build tool, npm run build)
- **CSS**: Custom properties (`--primary`, `--bg-primary`, `--text-primary`)
- **Theme**: CSS media query (`prefers-color-scheme: dark`)
- **Test**: Vitest + Playwright (npm run test:unit, npm run test:e2e)

---

## ✅ Step 3 & 6: Baseline DoD (Applies to ALL Tasks)

### Definition of Done - Checklist
- [ ] **Code reviewed** per repo policy (peer review + linting)
- [ ] **Tests added/updated** and passing:
  - Unit tests: `npm run test:unit` passes
  - E2E tests: `npm run test:e2e` passes
  - Manual verification: documented in ticket
- [ ] **No secrets/PII** introduced; safe logging (no console.log of sensitive data)
- [ ] **Backward compatible** unless explicitly allowed (ASSUMPTION: no breaking changes)
- [ ] **Docs updated** if behavior/config changes (JSDoc comments, README sections)
- [ ] **Clear verification steps** included in ticket
- [ ] **Minimal change principle** (no unnecessary refactors, focused scope)
- [ ] **Component pattern** follows X51LABS-151 (Settings) precedent
- [ ] **Signal usage** matches portfolioState.js design
- [ ] **Error handling** includes user-friendly Vietnamese messages
- [ ] **Theme support** tested (dark/light via CSS custom properties)
- [ ] **Build passes** (`npm run build` succeeds, bundle size reasonable)

---

## 🎯 Step 3: Task Breakdown (7 Tasks × 2-4 hours each)

### Task 1: State Management & API Layer (Setup Foundation)

**Title**: Setup: Create portfolioState signals + portfolioApi message router

**Issue Type**: Task

**Objective**: Establish reactive state management and API communication layer for Portfolio page, following X51LABS-151 pattern.

---

**GOAL**
Create `src/ui-preact/state/portfolioState.js` with 15+ signals for portfolio state + helper functions, and `src/ui-preact/api/portfolioApi.js` for message routing to background handlers. This is the foundation for all components.

**SCOPE (In-scope)**

New files:
- `src/ui-preact/state/portfolioState.js` (~300 lines)
  - Signals: `portfolioItems`, `loading`, `error`, `searchQuery`, `sortBy`, `filterBy`
  - Modal state: `isAddModalOpen`, `isEditModalOpen`, `isPriceUpdateModalOpen`, `selectedStock`, `editingStock`
  - Summary: `totalValue`, `totalPL`, `totalPLPercent`, `entryValue`
  - Realtime: `lastUpdateTime`, `updateError`
  - Helper functions: `addStock(data)`, `updateStock(id, data)`, `deleteStock(id)`, `setSelectedStock(id)`, `clearSelectedStock()`, etc.

- `src/ui-preact/api/portfolioApi.js` (~150 lines)
  - Functions: `fetchPortfolio()`, `addPortfolio(data)`, `updatePortfolio(id, data)`, `deletePortfolio(id)`, `updatePrices()`
  - Each wraps `chrome.runtime.sendMessage()` with error mapping
  - Error format handling: dual support for `response.error?.message` and `response.errorCode`

**NON-GOALS (Out-of-scope)**
- ❌ Component rendering (handled in Task 2+)
- ❌ Supabase integration (handled by background handlers)
- ❌ Test implementation (handled in Task 7)
- ❌ CSS styling (handled in Task 6)

**CONSTRAINTS**
- No new dependencies (use @preact/signals)
- Must match X51LABS-151 pattern (settingsState.js as reference)
- All signals must be named consistently (camelCase)
- No async operations directly in signals (use helper functions)

**CONTEXT (Repo Evidence)**
- **Reference file**: `src/ui-preact/state/settingsState.js` (Settings pattern to follow)
- **Reference file**: `src/ui-preact/api/authApi.js` (API pattern to follow)
- **Background handlers**: `src/background/handlers/portfolio.js` (PORTFOLIO_* messages)
- **Message types**: `src/shared/messageSchema.js` (MESSAGE_TYPES.PORTFOLIO_*)
- **Build tool**: Vite 5.0.0 (verifies imports work)

**PLAN (Implementation approach)**
1. Create `portfolioState.js` with all signal definitions
   - Import from @preact/signals: `signal`, `computed`, `effect`
   - Define base signals (items, loading, error, modals)
   - Define computed signals (totalValue, totalPL calculations)
   - Export helper functions for mutations
2. Create `portfolioApi.js` with message wrapper functions
   - Import MESSAGE_TYPES from shared/messageSchema.js
   - Implement PORTFOLIO_GET handler (returns items)
   - Implement PORTFOLIO_ADD handler (returns new item)
   - Implement PORTFOLIO_UPDATE handler (returns updated item)
   - Implement PORTFOLIO_REMOVE handler (returns removed id)
   - Add error mapping (handle both errorCode and error formats)
   - Add retry logic for transient errors (optional, simple version)
3. Test signals in browser console (verify mutations work)
4. Verify API functions map to correct MESSAGE_TYPES

**EXPECTED CHANGES**

Code:
- `src/ui-preact/state/portfolioState.js` — NEW (300 lines)
- `src/ui-preact/api/portfolioApi.js` — NEW (150 lines)

Config:
- None

Data:
- No Supabase schema changes

Tests:
- Unit tests: `tests/unit/state/portfolioState.test.js` (verify signals initialize correctly)
- Unit tests: `tests/unit/api/portfolioApi.test.js` (verify message mapping)

Docs:
- JSDoc comments in both files explaining signal purpose + usage

**ACCEPTANCE CRITERIA (Pass/Fail, testable)**

Given: Developer opens browser console in side panel  
When: Signals are imported and evaluated in console  
Then:
- [ ] `portfolioItems` signal initializes as empty array
- [ ] `loading` signal initializes as false
- [ ] `totalValue` computed signal calculates correctly (sum of current prices × quantities)
- [ ] `totalPL` computed signal = totalValue - entryValue
- [ ] Modal state signals (isAddModalOpen, etc.) initialize as false

Given: `portfolioApi.fetchPortfolio()` is called  
When: Background handler returns items  
Then:
- [ ] Items are set in `portfolioItems` signal
- [ ] `loading` signal toggles (true → false)
- [ ] `error` signal cleared on success
- [ ] If error, `error` signal populated with user-friendly message

Given: `portfolioApi.addPortfolio({symbol, qty, price})` called  
When: Background handler returns new item  
Then:
- [ ] New item added to `portfolioItems` array
- [ ] `isAddModalOpen` resets to false
- [ ] `totalValue` and `totalPL` recalculate automatically

**DoD (Definition of Done) — Checklist**
- [ ] Baseline DoD satisfied (code review, tests, no secrets, backward compat, docs, clear steps)
- [ ] Both files created (`portfolioState.js`, `portfolioApi.js`)
- [ ] All 15+ signals defined with comments
- [ ] All helper functions implemented and exported
- [ ] Error handling covers network + auth + validation errors
- [ ] Unit tests pass (signals initialize, API maps correctly)
- [ ] No console errors when signals are mutated
- [ ] Build passes (`npm run build`)
- [ ] JSDoc comments for all exported functions

**VERIFICATION STEPS**

```bash
# 1. Verify files created
test -f src/ui-preact/state/portfolioState.js && echo "✓ portfolioState.js exists"
test -f src/ui-preact/api/portfolioApi.js && echo "✓ portfolioApi.js exists"

# 2. Run unit tests
npm run test:unit -- portfolioState.test.js
npm run test:unit -- portfolioApi.test.js

# 3. Build check
npm run build

# 4. Manual verification (browser console)
# - Import signals in console
# - Verify initial values
# - Call API functions, verify message sent
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| Signal mutation bugs (not updating UI) | Use React DevTools Signals plugin to debug; verify computed signals recalculate |
| Message format mismatch (response.error vs errorCode) | Test both formats; add comprehensive error mapping |
| Circular dependencies between state/api | Keep api.js stateless (only wraps chrome.runtime.sendMessage) |

**ESTIMATE (hours)**: 3-4

**DEPENDENCIES**
- blocked-by: None (can start immediately)
- blocks: Task 2, 3, 4, 5 (all components depend on this foundation)
- parallelizable: None

---

### Task 2: Core Components - Table + Row + Summary

**Title**: Build PortfolioTable, StockRow, PortfolioSummary components

**Issue Type**: Task

**Objective**: Create the three core display components (table grid, individual row, and summary stats box) that render portfolio data from signals.

---

**GOAL**
Create three interconnected Preact components that display portfolio data reactively:
- `PortfolioTable.jsx` — Main table grid (header + rows)
- `StockRow.jsx` — Individual stock row with P&L coloring
- `PortfolioSummary.jsx` — Summary statistics box (NAV, Entry, Current, P&L)

**SCOPE (In-scope)**

New components:
1. **`src/ui-preact/portfolio/PortfolioTable.jsx`** (~250 lines)
   - Renders `<table>` with headers: Code, Entry, Current, Qty, P&L, P&L %, Actions
   - Reads from `portfolioItems` signal
   - Sorts: regular stocks first (alphabetically), CASH always last
   - Handles search/filter (future enhancement, scaffold only)
   - Maps each item to `<StockRow>` component
   - Empty state: "No stocks yet"

2. **`src/ui-preact/portfolio/StockRow.jsx`** (~200 lines)
   - Receives stock data (symbol, entry, current, qty, pl, pl%)
   - Renders table row with computed P&L coloring:
     - Green text if P&L > 0
     - Red text if P&L < 0
     - Gray if P&L = 0
   - Renders Actions column (Edit + Delete buttons)
   - Calls signal helpers on Edit/Delete click
   - Handles CASH special styling (light blue background, bold text)

3. **`src/ui-preact/portfolio/PortfolioSummary.jsx`** (~150 lines)
   - Displays 4 stat cards: NAV, Entry Value, Current Value, Total P&L
   - Reads from computed signals (`totalValue`, `entryValue`, `totalPL`, `totalPLPercent`)
   - Shows loading state spinner while fetching
   - Shows error state if data missing

**NON-GOALS (Out-of-scope)**
- ❌ Modal implementation (Task 4)
- ❌ Action buttons (handled in Task 5)
- ❌ Real-time updates (Task 3)
- ❌ Sorting/filtering UI (future enhancement)

**CONSTRAINTS**
- Must use Preact hooks (useCallback, useMemo) appropriately
- Must consume signals from `portfolioState.js`
- CSS styling must use custom properties (no hardcoded colors)
- Must handle CASH row differently (special styling)

**CONTEXT (Repo Evidence)**
- **Reference component**: `src/ui-preact/settings/SettingsPage.jsx` (component structure)
- **Reference component**: `src/ui-preact/components/FormField.jsx` (reusable patterns)
- **Vanilla reference**: `src/ui/portfolio.js` lines 382-550 (loadPortfolioUI function - copy logic)
- **P&L reference**: `src/ui/portfolioPL.js` (P&L calculation formulas)
- **CSS foundation**: `src/extension/styles.css` (custom properties available)
- **Theme system**: CSS media query for dark/light mode

**PLAN**
1. Create PortfolioTable.jsx
   - Map signals to table rows
   - Handle empty state
   - Add simple search placeholder (no-op for MVP)
2. Create StockRow.jsx
   - Receive stock object as prop
   - Implement P&L coloring logic (Green/Red/Gray)
   - Implement CASH special case (background color + bold)
   - Call signal helpers: `updateStock()`, `deleteStock()` on button click
3. Create PortfolioSummary.jsx
   - Display 4 stat cards
   - Subscribe to computed signals
   - Show loading spinner while `loading` signal true
   - Format currency/percentage correctly
4. Wire together in PortfolioPage (Task 5 will handle)
5. Test in browser (verify data displays, CASH styled differently)

**EXPECTED CHANGES**

Code:
- `src/ui-preact/portfolio/PortfolioTable.jsx` — NEW (250 lines)
- `src/ui-preact/portfolio/StockRow.jsx` — NEW (200 lines)
- `src/ui-preact/portfolio/PortfolioSummary.jsx` — NEW (150 lines)

Config:
- None

Tests:
- E2E tests: Verify table renders with data
- E2E tests: Verify CASH row styled differently
- E2E tests: Verify P&L coloring (green/red)

Docs:
- JSDoc comments on component props + signals used

**ACCEPTANCE CRITERIA (Pass/Fail)**

Given: Portfolio page loads with 3 stocks (VNM, VIC, CASH)  
When: Components render  
Then:
- [ ] Table shows 3 rows (VNM, VIC, CASH in order)
- [ ] CASH row has light blue background + bold text
- [ ] P&L column shows: green text if positive, red if negative, gray if zero
- [ ] Empty state shown if no stocks

Given: `totalValue` = 1000, `entryValue` = 900  
When: PortfolioSummary renders  
Then:
- [ ] Summary shows NAV: 1000, Entry: 900, P&L: 100, P&L%: 11.1%
- [ ] Correct formatting (currency symbols, 2 decimals)

Given: User clicks Edit button on VNM row  
When: Click handler fires  
Then:
- [ ] Modal state signal updated (isEditModalOpen = true, selectedStock = VNM data)

**DoD — Checklist**
- [ ] Baseline DoD satisfied
- [ ] All 3 components created and exported
- [ ] Signal subscriptions verified (reactive updates on signal change)
- [ ] CASH special styling verified
- [ ] P&L coloring works correctly (Green/Red/Gray)
- [ ] Empty state tested
- [ ] E2E tests pass
- [ ] Build passes

**VERIFICATION STEPS**

```bash
# 1. Verify components created
test -f src/ui-preact/portfolio/PortfolioTable.jsx && echo "✓ Table"
test -f src/ui-preact/portfolio/StockRow.jsx && echo "✓ Row"
test -f src/ui-preact/portfolio/PortfolioSummary.jsx && echo "✓ Summary"

# 2. E2E test
npm run test:e2e -- portfolio.spec.js

# 3. Manual: Load page, verify:
# - Table displays with data
# - CASH row styled blue + bold
# - P&L colored correctly
# - Summary stats accurate
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| Signal reactivity not triggering re-renders | Use Preact DevTools; verify components wrapped in signal scope |
| P&L calculation wrong | Copy exact formula from portfolioPL.js; add unit tests |
| CASH styling collision with other rows | Use specific CSS class for CASH (.cash-row), not generic |

**ESTIMATE (hours)**: 3-4

**DEPENDENCIES**
- blocked-by: Task 1 (needs signals + API)
- blocks: Task 5 (PortfolioPage container)
- parallelizable: Task 3 (realtime), Task 4 (modals) can start in parallel

---

### Task 3: Realtime Integration - Price Updates (SSI Polling)

**Title**: Implement SSI API polling + signal updates for real-time prices

**Issue Type**: Task

**Objective**: Set up 60-second polling loop for SSI iBoard API, update current prices in signal, and manage realtime subscription lifecycle.

---

**GOAL**
Implement realtime price updates from SSI iBoard API with 60-second polling interval. When prices update, signal updates reactively and UI re-renders with new P&L values.

**SCOPE (In-scope)**

Implementation:
1. **Create polling loop** in `portfolioState.js`:
   - Start 60s interval on portfolio load
   - Call SSI API for each stock symbol (batch with rate limiting)
   - Update `currentPrice` for each stock in `portfolioItems` signal
   - Update `lastUpdateTime` signal with timestamp
   - Handle SSI API errors gracefully (fallback to old price)

2. **Error handling for SSI API**:
   - Network error → show toast, retry next interval
   - Rate limit (429) → back off, increase interval
   - Unknown error → log, keep old prices, show indicator

3. **Lifecycle management**:
   - Start polling on Portfolio page mount
   - Stop polling on Portfolio page unmount
   - Provide manual refresh button (Task 5)

**NON-GOALS (Out-of-scope)**
- ❌ WebSocket real-time (keep polling proven approach)
- ❌ Advanced caching (cache one value: last fetch time)
- ❌ SSI API authentication changes (use existing setup)
- ❌ Offline mode (beyond MVP scope)

**CONSTRAINTS**
- Keep SSI API polling approach (existing, proven)
- Batch requests to avoid rate limiting (max 5 stocks per batch, 1s delay)
- No new dependencies
- Polling must respect user's internet connection

**CONTEXT (Repo Evidence)**
- **SSI API reference**: `src/market-data/advanced-client.js` (existing implementation)
- **Vanilla polling**: `src/ui/portfolio.js` lines 1123+ (existing polling code)
- **Message format**: Background handlers expect `PORTFOLIO_UPDATE_PRICES` message
- **Signal pattern**: From Task 1 (portfolioState.js)

**PLAN**
1. Create effect in portfolioState.js that starts polling interval on page load
2. Implement `updateStockPrices()` async function
   - Batch stocks into groups of 5
   - Call SSI API for each batch with 1s delay
   - Map responses back to symbols
   - Update `currentPrice` in signal
3. Handle errors:
   - Network → toast (Task 5 UI)
   - Rate limit → exponential backoff
   - Validation error → skip, log
4. Update `lastUpdateTime` signal
5. Test polling in browser (verify 60s loop works, prices update, errors handled)

**EXPECTED CHANGES**

Code:
- `src/ui-preact/state/portfolioState.js` [MODIFY] — Add polling effect + `updateStockPrices()` function
- `src/ui-preact/api/portfolioApi.js` [MODIFY] — Add `updateStockPrices()` API wrapper
- `src/market-data/advanced-client.js` [REFERENCE] — Use existing SSI client (no changes)

Tests:
- Unit tests: Verify polling interval starts/stops
- Unit tests: Verify price update formula correct
- E2E tests: Verify UI updates with new prices
- Manual: Check 60s polling loop works

Docs:
- JSDoc: Document polling lifecycle (mount/unmount)

**ACCEPTANCE CRITERIA (Pass/Fail)**

Given: Portfolio page loads with stocks  
When: Effect runs on mount  
Then:
- [ ] 60-second polling interval started
- [ ] `lastUpdateTime` signal updated with timestamp
- [ ] Console shows "Polling prices..." message

Given: SSI API returns new prices  
When: Polling interval fires  
Then:
- [ ] `currentPrice` updated for all stocks
- [ ] `totalValue` computed signal recalculates
- [ ] `totalPL` computed signal recalculates
- [ ] UI re-renders with new values

Given: SSI API returns error (429 or network)  
When: Error occurs  
Then:
- [ ] `updateError` signal set
- [ ] Old prices kept (no loss of data)
- [ ] Toast shown (error message to user)
- [ ] Next polling interval still scheduled

Given: Portfolio page unmounts  
When: Component cleanup  
Then:
- [ ] Polling interval cleared
- [ ] No more SSI API calls
- [ ] `updateError` signal cleared

**DoD — Checklist**
- [ ] Baseline DoD satisfied
- [ ] Polling effect added to portfolioState.js
- [ ] SSI API batching implemented (max 5 stocks, 1s delay)
- [ ] Error handling covers network + rate limit + validation
- [ ] Polling starts on mount, stops on unmount
- [ ] Unit tests verify interval lifecycle
- [ ] E2E tests verify UI updates
- [ ] Build passes

**VERIFICATION STEPS**

```bash
# 1. Run unit tests
npm run test:unit -- portfolioState.test.js

# 2. E2E test with polling
npm run test:e2e -- portfolio.spec.js -k "realtime"

# 3. Manual verification:
# - Open Portfolio page
# - Check console: "Polling prices..." appears
# - Wait 60s: Prices should update
# - Check lastUpdateTime updates
# - Simulate network error: Verify error handled
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| SSI API rate limiting (too many requests) | Batch requests (max 5 per batch), 1s delay between batches |
| Polling continues after page close (memory leak) | Use effect cleanup function to clear interval |
| Network timeout hangs polling | Add 5s timeout to each API call |
| Old prices cause incorrect P&L | Log both old + new on update; unit test verifies calculation |

**ESTIMATE (hours)**: 2-3

**DEPENDENCIES**
- blocked-by: Task 1 (needs signals)
- blocks: None (independent)
- parallelizable: Task 2, 4, 5

---

### Task 4: Modal Components - Add/Edit/Price Update

**Title**: Build StockModal, PriceUpdateModal components + form validation

**Issue Type**: Task

**Objective**: Create three modal components for adding stocks, editing existing stocks, and bulk price updates, with proper validation and error handling.

---

**GOAL**
Create three modal components that handle CRUD operations for portfolio items:
- `StockModal.jsx` — Add/Edit stock modal with CASH special handling
- `PriceUpdateModal.jsx` — Bulk price update modal
- Form validation and error display

**SCOPE (In-scope)**

Components:
1. **`src/ui-preact/portfolio/StockModal.jsx`** (~300 lines)
   - Conditional rendering: Add mode vs Edit mode (title + submit button text)
   - Form fields: Symbol, Entry Price, Quantity (3 inputs)
   - CASH special handling:
     - When symbol = "CASH", hide Entry Price field (always 0)
     - Show "Cash" label instead of Symbol input (read-only)
   - Validation:
     - Symbol: 1-10 uppercase letters + digits
     - Entry Price: > 0, <= 1,000,000
     - Quantity: > 0, <= 1,000,000
     - Show error message below each field if validation fails
   - Submit button: disabled until all fields valid
   - Cancel button: clear form, close modal
   - API integration: Call `addPortfolio()` or `updatePortfolio()` based on mode
   - Error toast on submit fail

2. **`src/ui-preact/portfolio/PriceUpdateModal.jsx`** (~200 lines)
   - Shows list of all stocks with manual input for new prices
   - Reads from `portfolioItems` signal
   - Each row: Symbol | Current Price | New Price (input)
   - Validation: New Price > 0
   - Submit: Call batch update via `updateStockPrices()` API
   - Shows loading state while updating
   - Error handling: Show which stocks failed

**NON-GOALS (Out-of-scope)**
- ❌ Advanced form validation (client-side only, backend validates too)
- ❌ Form state persistence (close = clear)
- ❌ Undo/history tracking

**CONSTRAINTS**
- Use existing modal styling + ConfirmationDialog pattern (no new CSS)
- Form state local to component (not in global signals)
- Validation must be synchronous + fast
- Reuse StatusMessage for toast notifications

**CONTEXT (Repo Evidence)**
- **Modal reference**: `src/ui-preact/components/ConfirmationDialog.jsx` (modal pattern to follow)
- **Form reference**: `src/ui-preact/settings/SettingsPage.jsx` (form component examples)
- **Vanilla modals**: `src/ui/portfolio.js` lines 664-755 (add/edit modal logic to copy)
- **Validation reference**: `src/background/handlers/portfolio.js` (backend validation)

**PLAN**
1. Create StockModal.jsx
   - Props: `isOpen`, `mode` (add/edit), `stock` (for edit mode), `onClose`, `onSubmit`
   - Render: Form with 3 inputs (or 2 if CASH)
   - Validation: Check each field on blur + on submit
   - Submit: Map form to API call (addPortfolio or updatePortfolio)
2. Create PriceUpdateModal.jsx
   - Props: `isOpen`, `onClose`, `stocks`
   - Render: List of stocks with price inputs
   - Submit: Batch call to updateStockPrices()
3. Test form validation (all cases)
4. Test CASH special case (no entry price field)
5. Test modal open/close/clear

**EXPECTED CHANGES**

Code:
- `src/ui-preact/portfolio/StockModal.jsx` — NEW (300 lines)
- `src/ui-preact/portfolio/PriceUpdateModal.jsx` — NEW (200 lines)
- `src/ui-preact/portfolio/PortfolioPage.jsx` [MODIFY] — Mount modals

Tests:
- Unit tests: Form validation (all cases)
- E2E tests: Add stock flow
- E2E tests: Edit stock flow
- E2E tests: CASH special handling
- E2E tests: Price update flow

Docs:
- JSDoc: Component props, validation rules

**ACCEPTANCE CRITERIA (Pass/Fail)**

Given: Add Stock modal opens  
When: User enters symbol="VNM", entry=85000, qty=100  
And: Clicks Submit  
Then:
- [ ] `portfolioApi.addPortfolio()` called with correct data
- [ ] `portfolioItems` signal updated with new item
- [ ] Modal closes
- [ ] Form cleared

Given: User enters symbol="CASH" in Add modal  
When: Form initializes  
Then:
- [ ] Entry Price field hidden
- [ ] Only Symbol (read-only "CASH") + Quantity shown
- [ ] Submit creates CASH item with entry_price = 0

Given: User enters symbol="" (empty)  
When: User clicks Submit  
Then:
- [ ] Error message shown: "Symbol required"
- [ ] Submit button disabled
- [ ] Form not submitted

Given: Symbol already exists (VNM exists, user tries adding VNM again)  
When: User submits  
Then:
- [ ] API error handled (backend returns duplicate error)
- [ ] Error toast shown: "Stock already in portfolio"

Given: Price Update modal opens with 3 stocks  
When: User enters new prices and clicks Submit  
Then:
- [ ] All 3 stocks updated in Supabase
- [ ] Modal closes
- [ ] UI shows new prices

**DoD — Checklist**
- [ ] Baseline DoD satisfied
- [ ] Both modal components created
- [ ] Form validation complete (all fields + CASH special case)
- [ ] API integration tested
- [ ] Error handling shows user-friendly messages
- [ ] Modal open/close lifecycle works
- [ ] E2E tests pass (all CRUD flows)
- [ ] Build passes

**VERIFICATION STEPS**

```bash
# 1. E2E tests
npm run test:e2e -- portfolio.spec.js -k "add|edit|price"

# 2. Manual verification:
# - Click "Add Stock" → Modal opens
# - Enter valid data → Submit enabled
# - Enter invalid data → Submit disabled, error shown
# - Try CASH → Entry price hidden
# - Cancel → Modal closes, form cleared
# - Edit stock → Modal opens with data pre-filled
# - Price update → Batch update works
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| Form state bugs (cleared incorrectly on open/close) | Test lifecycle carefully; use local state + effect |
| Duplicate symbol handling (add same stock twice) | Backend validates; frontend shows error toast |
| CASH special case forgotten (causes bugs) | Add explicit test for CASH modal |
| Modal backdrop click closes without confirmation | Add confirm dialog before close if form dirty |

**ESTIMATE (hours)**: 3-4

**DEPENDENCIES**
- blocked-by: Task 1 (signals + API)
- blocks: Task 5 (PortfolioPage needs modals)
- parallelizable: Task 2, 3

---

### Task 5: Main Container - PortfolioPage + Actions

**Title**: Build PortfolioPage container + PortfolioActions button bar

**Issue Type**: Task

**Objective**: Create the main container component that orchestrates all sub-components and implements action buttons (Add, Refresh, Evaluate, Tea Stock).

---

**GOAL**
Create the top-level `PortfolioPage.jsx` container component that:
- Initializes portfolio state + realtime updates on mount
- Orchestrates all sub-components (Table, Summary, Modals, Actions)
- Implements action buttons (Add, Refresh, Evaluate, Tea Stock)
- Manages lifecycle (mount → fetch → render, unmount → cleanup)

**SCOPE (In-scope)**

1. **`src/ui-preact/portfolio/PortfolioPage.jsx`** (~250 lines)
   - Mount effect: `portfolioApi.fetchPortfolio()` → load data into signals
   - Render: PortfolioActions + PortfolioSummary + PortfolioTable + Modals
   - Orchestrate modal state (open/close/select)
   - Handle loading state (show spinner while fetching)
   - Handle error state (show error banner)
   - Unmount: cleanup polling

2. **`src/ui-preact/portfolio/PortfolioActions.jsx`** (~150 lines)
   - Button bar with 4 buttons:
     - "➕ Add Stock" → open StockModal in Add mode
     - "🔄 Refresh" → call `updateStockPrices()` manually
     - "💬 Evaluate" → send portfolio to ChatGPT (Task 6)
     - "🍵 Tea Stock" → search interesting stocks (Task 6)
   - Show loading spinner during operations
   - Show error toast on failure

**NON-GOALS (Out-of-scope)**
- ❌ ChatGPT integration (handled in Task 6)
- ❌ Tea stock search implementation (handled in Task 6)
- ❌ Advanced state management (keep signals simple)

**CONSTRAINTS**
- Must handle all 4 signals modal states correctly
- Must show loading/error states clearly
- Must implement proper cleanup on unmount
- No external state management (use signals only)

**CONTEXT (Repo Evidence)**
- **Container pattern**: `src/ui-preact/settings/SettingsPage.jsx` (lifecycle + sub-components)
- **Vanilla reference**: `src/ui/portfolio.js` lines 189-380 (initPortfolio function)
- **Error handling**: Follow settingsState.js pattern (error signal + toast)
- **Realtime pattern**: From Task 3 (polling lifecycle)

**PLAN**
1. Create PortfolioPage.jsx
   - Mount effect: Fetch portfolio + init polling
   - Render all sub-components in layout
   - Wire up modal open/close handlers
   - Wire up action button clicks
   - Unmount: cleanup polling interval
2. Create PortfolioActions.jsx
   - 4 buttons with loading states
   - Click handlers call signal helpers
   - Show toast on error
3. Test full page flow (load → render → actions work)
4. Test error states (no data, network error)

**EXPECTED CHANGES**

Code:
- `src/ui-preact/portfolio/PortfolioPage.jsx` — NEW (250 lines)
- `src/ui-preact/portfolio/PortfolioActions.jsx` — NEW (150 lines)
- `src/ui-preact/index.js` [MODIFY] — Add route to PortfolioPage

Tests:
- E2E: Full page load + render
- E2E: Action buttons work
- E2E: Error states handled
- Manual: Load → Refresh → prices update

Docs:
- Component lifecycle documented
- Signal dependencies listed

**ACCEPTANCE CRITERIA (Pass/Fail)**

Given: Portfolio page mounts  
When: Component initializes  
Then:
- [ ] `fetchPortfolio()` called
- [ ] `loading` signal = true
- [ ] After fetch completes: `loading` = false, items rendered
- [ ] Polling started (60s interval)

Given: Page displays portfolio with 3 stocks  
When: User clicks "Add Stock" button  
Then:
- [ ] StockModal opens in Add mode
- [ ] `isAddModalOpen` signal = true
- [ ] Form is empty

Given: User fills form + clicks Submit  
When: Submit completes  
Then:
- [ ] Modal closes
- [ ] `portfolioItems` signal updated (new item added)
- [ ] Table re-renders (new row appears)
- [ ] Success toast shown

Given: User clicks "Refresh" button  
When: Click fires  
Then:
- [ ] `updateStockPrices()` called
- [ ] Loading spinner shows
- [ ] Prices update in UI
- [ ] "Prices updated" toast shown

Given: Portfolio page unmounts  
When: Component cleanup  
Then:
- [ ] Polling interval cleared
- [ ] No more API calls
- [ ] No memory leaks (verify in DevTools)

Given: Network error occurs during fetch  
When: Error is caught  
Then:
- [ ] Error banner shown with message
- [ ] "Retry" button available
- [ ] Loading spinner hidden

**DoD — Checklist**
- [ ] Baseline DoD satisfied
- [ ] PortfolioPage container created
- [ ] PortfolioActions button bar created
- [ ] All lifecycle hooks implemented (mount/unmount)
- [ ] Error states handled + user-friendly messages
- [ ] Loading states shown correctly
- [ ] Modal orchestration works (all 4 modals)
- [ ] E2E tests pass (page load → actions → modal → submit)
- [ ] Build passes

**VERIFICATION STEPS**

```bash
# 1. E2E tests
npm run test:e2e -- portfolio.spec.js

# 2. Manual verification:
# - Load Portfolio page
# - Verify table renders with data
# - Click each action button (Add, Refresh, Evaluate, Tea)
# - Modal opens/closes correctly
# - Test error state (simulate network error)
# - Verify polling starts (check console, wait 60s)
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| Polling continues after page unmount (memory leak) | Verify cleanup effect runs; use DevTools to check intervals |
| Multiple modals open simultaneously (UI bug) | Wire up modal state carefully; test all combinations |
| Loading state not shown (UX issue) | Add explicit loading spinner during fetch + submit |

**ESTIMATE (hours)**: 3-4

**DEPENDENCIES**
- blocked-by: Task 1, 2, 4 (all components needed)
- blocks: Task 6 (ChatGPT integration uses this page)
- parallelizable: None (needs all previous components)

---

### Task 6: ChatGPT Integration - Evaluate + Tea Stock

**Title**: Implement Evaluate Portfolio + Tea Stock search flows

**Issue Type**: Task

**Objective**: Integrate ChatGPT evaluation flow (send portfolio data + prompt to ChatGPT, save response to history) and tea stock search functionality.

---

**GOAL**
Implement two ChatGPT integration features:
1. **Evaluate Portfolio**: Send portfolio summary + custom prompt to ChatGPT, display response
2. **Tea Stock**: Search for interesting stocks based on prompt, display results

**SCOPE (In-scope)**

Implementation:
1. **Evaluate Portfolio Modal** (~150 lines)
   - Input: Custom prompt textarea (pre-filled with default)
   - Button: "Send to ChatGPT"
   - Submits portfolio data + prompt via MESSAGE_TYPES.SEND_PROMPT
   - Shows response in modal (streaming + final)
   - Saves to chat history (automatic)
   - Error handling: Show error toast

2. **Tea Stock Modal** (~150 lines)
   - Input: Search prompt textarea (pre-filled with default like "Find best stocks under 100k")
   - Button: "Search"
   - Submits prompt to ChatGPT via MESSAGE_TYPES.SEND_PROMPT
   - Displays search results
   - Allow user to add found stocks to portfolio

**NON-GOALS (Out-of-scope)**
- ❌ Advanced portfolio analysis (Evaluate only sends data, ChatGPT does analysis)
- ❌ Stock recommendation ML model (use ChatGPT API only)
- ❌ Caching ChatGPT responses (no persistence needed MVP)

**CONSTRAINTS**
- Use existing MESSAGE_TYPES.SEND_PROMPT flow (background handler exists)
- Follow vanilla portfolio.js flows (lines 771-895 evaluatePortfolio)
- No new API integrations
- Must save to chat history

**CONTEXT (Repo Evidence)**
- **Vanilla evaluate**: `src/ui/portfolio.js` lines 771-895
- **Vanilla tea stock**: `src/ui/portfolio.js` lines ~950+ (teaStockBtn handler)
- **Message schema**: MESSAGE_TYPES.SEND_PROMPT in messageSchema.js
- **Chat history**: Background handler for HISTORY_ADD message

**PLAN**
1. Create EvaluatePortfolioModal.jsx
   - Props: `isOpen`, `onClose`, `portfolio`
   - Collect portfolio summary (NAV, entry, current, P&L)
   - Build prompt: "{portfolio data}\n\n{user prompt}"
   - Send via MESSAGE_TYPES.SEND_PROMPT
   - Display streaming response
   - Save to history on complete
2. Create TeaStockModal.jsx
   - Props: `isOpen`, `onClose`
   - Input: Search prompt
   - Send prompt to ChatGPT
   - Parse response for stock symbols
   - Show "Add" button for each stock
   - Call portfolioApi.addPortfolio() when user clicks Add
3. Test both flows end-to-end

**EXPECTED CHANGES**

Code:
- `src/ui-preact/portfolio/EvaluatePortfolioModal.jsx` — NEW (150 lines)
- `src/ui-preact/portfolio/TeaStockModal.jsx` — NEW (150 lines)
- `src/ui-preact/portfolio/PortfolioActions.jsx` [MODIFY] — Add button handlers

Tests:
- E2E: Evaluate flow (send → get response → save history)
- E2E: Tea stock flow (search → parse → add stocks)
- Manual: Verify chat history saved

Docs:
- Modal component props documented
- ChatGPT prompt format documented

**ACCEPTANCE CRITERIA (Pass/Fail)**

Given: User clicks "Evaluate" button  
When: EvaluatePortfolioModal opens  
Then:
- [ ] Prompt textarea pre-filled with default text
- [ ] Portfolio summary shown (NAV, Entry, Current, P&L)
- [ ] "Send to ChatGPT" button ready

Given: User clicks "Send to ChatGPT"  
When: Request sent  
Then:
- [ ] Loading spinner shown
- [ ] ChatGPT response streamed to modal
- [ ] Response saved to chat_history table
- [ ] "Close" button shown after complete

Given: User clicks "Tea Stock"  
When: TeaStockModal opens  
Then:
- [ ] Prompt textarea pre-filled (e.g., "Find best stocks under 100k")
- [ ] "Search" button ready

Given: User enters search prompt + clicks Search  
When: Response received  
Then:
- [ ] ChatGPT returns stock symbols + analysis
- [ ] Modal shows results with "Add to Portfolio" buttons
- [ ] User clicks "Add" → Stock added to portfolio

Given: ChatGPT returns error or timeout  
When: Error occurs  
Then:
- [ ] Error toast shown to user
- [ ] Modal remains open (allow retry)
- [ ] Not saved to history (no response)

**DoD — Checklist**
- [ ] Baseline DoD satisfied
- [ ] Both modal components created
- [ ] MESSAGE_TYPES.SEND_PROMPT integration verified
- [ ] Response streaming works (or at least final response)
- [ ] Chat history saves automatically
- [ ] Error handling shows user-friendly messages
- [ ] Tea stock add flow works end-to-end
- [ ] E2E tests pass
- [ ] Build passes

**VERIFICATION STEPS**

```bash
# 1. E2E tests
npm run test:e2e -- portfolio.spec.js -k "evaluate|tea"

# 2. Manual verification:
# - Click "Evaluate" → Modal opens with portfolio data
# - Fill prompt + send → Response appears in modal
# - Check chat_history table: New entry created
# - Click "Tea Stock" → Modal opens
# - Enter search prompt + search → Results show
# - Click "Add" on stock → Stock added to portfolio
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| ChatGPT integration fails (API timeout, network) | Add timeout handler + retry button; show error message |
| Response parsing fails (unexpected format) | Display raw response; don't auto-parse stocks |
| Large responses not streaming (slow UX) | Show loading spinner while waiting; at least show final response |
| Tea stock add fails (duplicate stock) | Catch error from portfolioApi.addPortfolio(); show toast |

**ESTIMATE (hours)**: 2-3

**DEPENDENCIES**
- blocked-by: Task 5 (needs PortfolioActions + modal orchestration)
- blocks: Task 7 (tests will exercise this)
- parallelizable: None

---

### Task 7: Testing + Polish - E2E Tests, Theme Support, Cleanup

**Title**: Complete E2E test coverage, dark/light theme support, build polish

**Issue Type**: Task

**Objective**: Add comprehensive E2E test coverage, verify dark/light theme support works, optimize build bundle size, and finalize code quality.

---

**GOAL**
Achieve production readiness through:
1. Complete E2E test coverage for all Portfolio flows
2. Verify dark/light theme support (CSS custom properties)
3. Build optimization + bundle size check
4. Final code review + documentation

**SCOPE (In-scope)**

Testing:
1. **E2E Tests** (update `tests/e2e/portfolio.spec.js`):
   - Load portfolio page + render table ✅ (stub exists, update)
   - Add stock flow (form validation → submit → table updates)
   - Edit stock flow (click Edit → form pre-filled → submit → updates)
   - Delete stock flow (click Delete → confirmation → removed from table)
   - CASH special handling (add CASH → no entry price field → renders blue)
   - Real-time price updates (refresh → prices update → P&L recalculates)
   - Evaluate portfolio (send to ChatGPT → response shown → history saved)
   - Tea stock search (search → results → add stock)
   - Error handling (network error → error banner → retry)
   - Empty state (no stocks → empty message shown)

2. **Theme Support**:
   - Verify CSS custom properties applied
   - Test dark mode toggle (system preference + manual override)
   - Verify all components styled correctly (table, modals, buttons, summary)
   - Check contrast + accessibility

3. **Build & Bundle**:
   - `npm run build` succeeds
   - Check bundle size (target: < 50KB increase from Settings migration)
   - Verify no duplicate code
   - Check tree-shaking works (no unused code)

4. **Final Polish**:
   - JSDoc comments complete
   - No console warnings/errors
   - All event handlers have proper cleanup
   - No memory leaks (DevTools check)
   - Responsive design tested (mobile + desktop)

**NON-GOALS (Out-of-scope)**
- ❌ Performance profiling (beyond basic build check)
- ❌ Accessibility audit (beyond theme support + contrast)
- ❌ Additional features (scope frozen for MVP)

**CONSTRAINTS**
- No refactoring (only cleanup, no architecture changes)
- All tests must pass (no skipped tests)
- No new dependencies
- Build must succeed

**CONTEXT (Repo Evidence)**
- **E2E framework**: Playwright (npm run test:e2e)
- **Test reference**: `tests/e2e/settings.spec.js` (Settings tests as template)
- **Vanilla reference**: `src/ui/portfolio.js` (all flows documented)
- **Build tool**: Vite (npm run build)

**PLAN**
1. Update E2E tests for all Portfolio flows
   - Copy Settings test template
   - Add Portfolio-specific test cases
   - Run tests locally + verify all pass
2. Verify theme support
   - Test CSS custom properties applied
   - Toggle dark/light mode
   - Check all components render correctly
3. Build optimization
   - Run build
   - Check bundle size (target < 50KB)
   - Verify no duplicate code
4. Final polish
   - Add JSDoc comments to all components
   - Run linter (npm run lint)
   - Check for console errors/warnings
   - Manual QA (dark/light theme, responsive, CASH special case)

**EXPECTED CHANGES**

Code:
- `tests/e2e/portfolio.spec.js` [CREATE/UPDATE] — Complete test coverage
- All components [MODIFY] — Add JSDoc comments
- Build output — Optimized (< 50KB increase target)

Tests:
- 10+ E2E test cases (all flows covered)
- Manual QA checklist documented

Docs:
- Update README with Portfolio migration summary
- JSDoc for all exported functions/components
- Theme support documented

**ACCEPTANCE CRITERIA (Pass/Fail)**

Given: All 8 components created + integrated  
When: `npm run test:e2e` runs  
Then:
- [ ] All tests pass (0 failures)
- [ ] Portfolio page loads correctly
- [ ] CRUD flows work (add/edit/delete)
- [ ] Real-time updates work
- [ ] ChatGPT integration works
- [ ] Error states handled

Given: User switches between light/dark theme  
When: CSS custom properties applied  
Then:
- [ ] All components styled correctly
- [ ] Text contrast acceptable (WCAG AA)
- [ ] No unstyled elements
- [ ] Theme persists on page reload

Given: `npm run build` runs  
When: Build completes  
Then:
- [ ] No build errors
- [ ] Bundle size reasonable (< 50KB increase)
- [ ] Tree-shaking works (no unused code)
- [ ] All imports resolve correctly

Given: E2E tests pass + manual QA complete  
When: Code review happens  
Then:
- [ ] JSDoc comments complete
- [ ] No console errors/warnings
- [ ] No memory leaks (DevTools)
- [ ] Responsive design works (mobile + desktop)
- [ ] CASH special case tested
- [ ] All error flows tested

**DoD — Checklist**
- [ ] Baseline DoD satisfied
- [ ] E2E tests created/updated (10+ cases, all pass)
- [ ] Theme support verified (dark/light)
- [ ] Build passes (< 50KB increase)
- [ ] No console errors/warnings
- [ ] JSDoc comments complete
- [ ] Manual QA: dark/light, responsive, CASH, errors
- [ ] Ready for production deployment

**VERIFICATION STEPS**

```bash
# 1. Run E2E tests
npm run test:e2e -- portfolio.spec.js

# 2. Check build
npm run build
# Should see output like: dist/portfolio-preact.js 47.2KB

# 3. Check bundle size (compare to Settings)
# Settings-preact.js: 31.4KB
# Portfolio-preact.js: target ~47KB (reasonable)

# 4. Manual verification:
# - Load page in light mode ✓
# - Toggle to dark mode ✓
# - All components themed correctly ✓
# - No console errors ✓
# - Responsive (resize window) ✓
# - CASH row styled blue + bold ✓
# - Error handling works ✓

# 5. Memory leak check (DevTools)
# - Open DevTools → Performance → Heap snapshot
# - Before: X MB
# - After operations: Y MB (should not grow)
```

**RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| E2E test flakiness (timing issues) | Add explicit waits + retry logic in Playwright |
| Bundle size exceeds target (50KB) | Profile build; remove unused code; split if needed |
| Theme colors not matching design | Compare to Settings page theme; adjust CSS vars |
| Console errors missed | Run tests multiple times; manual QA thoroughness |

**ESTIMATE (hours)**: 3-4

**DEPENDENCIES**
- blocked-by: Task 1-6 (all must be complete)
- blocks: None (final task in sequence)
- parallelizable: None

---

## 📊 Step 4: Coverage Matrix (Deliverables → Tasks)

| Big-Task Deliverable | Task 1 | Task 2 | Task 3 | Task 4 | Task 5 | Task 6 | Task 7 |
|-----|--------|--------|--------|--------|--------|--------|--------|
| **1. Preact rendering** | Setup | ✅ | - | - | ✅ | - | Test |
| **2. Full CRUD ops** | Setup | - | - | ✅ | ✅ | - | Test |
| **3. Real-time prices** | Setup | - | ✅ | - | - | - | Test |
| **4. Dark/light theme** | - | - | - | - | - | - | ✅ |
| **5. ChatGPT integration** | - | - | - | - | - | ✅ | Test |
| **6. User-friendly errors** | Setup | - | ✅ | ✅ | ✅ | ✅ | Test |
| **7. Zero schema changes** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Test |
| **8. E2E tests pass** | - | - | - | - | - | - | ✅ |

✅ = Primary responsibility | Test = E2E verification | - = Not applicable

---

## 🔗 Step 5 & 7: Dependency & Parallelization Plan

### Dependency Graph
```
Task 1 (Setup) ← BLOCKER
  ↓
  ├─→ Task 2 (Table/Row/Summary) ─┐
  │                                ├─→ Task 5 (Container) ─→ Task 6 (ChatGPT) ─→ Task 7 (Tests)
  ├─→ Task 3 (Realtime) ────────┐ │
  │                              │ │
  ├─→ Task 4 (Modals) ───────────┤ │
  │                              └─→─┘
  └────────────────────────────────→ (parallel where possible)

PARALLELIZABLE:
- Phase 1: Task 1 (1 engineer)
- Phase 2: Tasks 2, 3, 4 (3 engineers in parallel, each 3-4h)
- Phase 3: Task 5 (1 engineer, 3-4h)
- Phase 4: Task 6 (1 engineer, 2-3h)
- Phase 5: Task 7 (1 engineer, 3-4h)
```

### Timeline (Ideal, 1 Engineer Sequential)
- **Day 1 AM**: Task 1 (Setup) — 3-4 hours
- **Day 1 PM**: Task 2 (Components) — 3-4 hours
- **Day 2 AM**: Task 3 (Realtime) — 2-3 hours
- **Day 2 PM**: Task 4 (Modals) — 3-4 hours
- **Day 3 AM**: Task 5 (Container) — 3-4 hours
- **Day 3 PM**: Task 6 (ChatGPT) — 2-3 hours
- **Day 4 AM**: Task 7 (Tests) — 3-4 hours
- **Total**: ~23-30 hours (~3-4 days, matching X51LABS-152 estimate)

### Timeline (Ideal, 3 Engineers Parallel)
- **Day 1**: Task 1 (3-4h) + Task 2 (3-4h) in parallel = ~1 day
- **Day 2**: Tasks 3, 4 in parallel (3-4h each) = ~1 day
- **Day 3**: Task 5 (3-4h) = ~0.5 day
- **Day 4**: Task 6 (2-3h) = ~0.5 day
- **Day 4 PM**: Task 7 (3-4h) = ~1 day
- **Total**: ~3-4 days (accelerated)

---

## 🎯 Step 8: Baseline DoD (Applies to ALL 7 Tasks)

See above in Step 3 (shared checklist).

---

## 📋 Output: All Tickets Ready for Jira Creation

**Summary**: 7 tasks × 2-4 hours each = ~20-28 hours total effort (~1 week)

**Next Step**: Create tickets in Jira via Atlassian MCP (will do now)

---

## 📊 FINAL STATISTICS

| Metric | Value |
|--------|-------|
| **Total Tasks** | 7 |
| **Total Effort** | 20-28 hours |
| **Est. Timeline** | 3-4 days (sequential) |
| **Components to Build** | 8 |
| **New Files** | 15+ (components + state + api + tests + styles) |
| **Lines of Code** | ~2,200-2,500 |
| **E2E Test Cases** | 10+ |
| **Coverage Map** | 8 deliverables × 7 tasks (100% coverage) |
| **Parallelizable Tasks** | 2-3 in parallel (Task 2, 3, 4) |
| **Critical Path** | Task 1 → Task 2/3/4 → Task 5 → Task 6 → Task 7 |

---

**Status**: ✅ Decomposition Complete — Ready for Jira Creation via MCP

