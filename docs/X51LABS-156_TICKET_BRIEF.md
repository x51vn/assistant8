# TICKET BRIEF — X51LABS-156 (Task 4: Modals & Validation)

**Ticket Key**: X51LABS-156  
**Status**: ✅ **COMPLETE** (Ready for Code Review)  
**Priority**: High  
**Assignee**: Vu D.  
**Created**: 2026-01-31 09:52 UTC+7  
**Last Updated**: 2026-01-31 11:51 UTC+7  

---

## GOAL

Create three modal components for CRUD operations on portfolio items with proper form validation, error handling, and special case handling for CASH symbol:

1. **StockModal.jsx** — Add/Edit stock modal with conditional field display
2. **PriceUpdateModal.jsx** — Bulk price update modal
3. **formValidation.js** — Centralized validation utilities

**Measurable Target**: 100% AC coverage, all validations working, error handling robust.

---

## SCOPE (In-Scope)

### 1. StockModal Component (~300 lines)
- **Dual-mode operation**: Add mode vs Edit mode
  - Add mode: All fields editable, title "Thêm cổ phiếu"
  - Edit mode: Symbol disabled (read-only), title "Sửa cổ phiếu"
- **Fields**: Symbol, Entry Price, Quantity
  - **CASH special case**: Entry Price field hidden when symbol="CASH"
- **Validation rules**:
  - Symbol: 1-10 chars, uppercase alphanumeric, required, unique (case-insensitive)
  - Entry Price: > 0, ≤ 1,000,000, numeric, required (unless CASH)
  - Quantity: integer, > 0, ≤ 1,000,000, required
- **Real-time validation**: Errors shown below fields immediately on input change
- **Submit behavior**:
  - Call `addPortfolio()` in Add mode
  - Call `updatePortfolio()` in Edit mode
  - Disable submit until form valid
  - Show loading state during submission
  - Show error toast on API failure
  - Close modal on success

### 2. PriceUpdateModal Component (~200 lines)
- **Display**: List of all stocks (except CASH) with manual price input fields
- **Validation**: New Price > 0
- **Submit behavior**:
  - Batch update via `updatePortfolioPrices()`
  - Loading state
  - Error handling
  - Close modal on success
- **Empty state**: Show message if no stocks in portfolio

### 3. Form Validation Utilities (~150 lines)
- **Functions**:
  - `validateSymbol(symbol)` — Check 1-10 chars, uppercase, required
  - `validateEntryPrice(price)` — Check > 0, ≤ 1M, numeric
  - `validateQuantity(qty)` — Check integer, > 0, ≤ 1M
  - `validateNewPrice(price)` — Check > 0, numeric (for price updates)
  - `isSymbolDuplicate(symbol, portfolio, excludeId)` — Case-insensitive check
  - `validateStockForm(formData, portfolioItems)` — Complete form validation
- **Return format**: `{ isValid: boolean, error: string | null }` or `{ isValid: boolean, errors: object }`
- **Error messages**: All in Vietnamese
- **Duplicate detection**: Case-insensitive comparison, supports edit mode (excludeId parameter)

---

## NON-GOALS (Out of Scope)

1. **API integration with backend** — Use existing `addPortfolio()`, `updatePortfolio()`, `updatePortfolioPrices()` from Task 1
2. **Real-time pricing during modal input** — Pricing updates handled separately in Task 3
3. **Advanced error recovery** — Basic error toasts, no retry logic
4. **Multi-language UI** — Vietnamese localization only (as per product spec)
5. **Accessibility (ARIA)** — Beyond basic button/label semantics
6. **Animation/transition effects** — Static modal display
7. **Modal stacking** — Single modal instance only

---

## CONSTRAINTS

### API Contracts (Hard)
- Must use `portfolioItems` signal from Task 1
- Must call `portfolioApi.addPortfolio()`, `updatePortfolio()`, `updateStockPrices()`
- Return type for API calls must be consistent with Task 1 schema
- No new backend endpoints required

### Schema Constraints
- `portfolioItems` structure: `{ id, symbol, quantity, avg_price, current_price, entry_price }`
- CASH special case: `{ symbol: "CASH", quantity: X, entry_price: 1 }`
- Validation errors must include field name + Vietnamese message

### Backward Compatibility
- Must not break existing PortfolioTable, PortfolioSummary components
- Must not modify Task 1 signals or API contracts
- New imports only, no refactoring of shared code

### Performance
- Validation: < 1ms per field
- Form render: < 100ms (max 5 fields)
- Duplicate detection: < 10ms even with 1000 stocks
- No unnecessary re-renders on parent

### Security
- Input validation on all fields (no XSS via symbol names)
- CASH symbol is reserved, prevent override
- No PII logged in error messages
- No hardcoded passwords/secrets

### Observability
- Error types classified: VALIDATION_ERROR, DUPLICATE_ERROR, API_ERROR, NETWORK_ERROR
- Logging compatible with existing logger (if available)
- User-friendly error messages distinct from technical errors

### Rollout
- Can deploy independently of Task 3 (pricing)
- Can deploy with or without Task 2 (components)
- Should not affect existing portfolio viewing

---

## ASSUMPTIONS

**ASSUMPTION-1**: Task 1 signals (`portfolioItems`, `addPortfolio()`, `updatePortfolio()`) are stable and tested  
**ASSUMPTION-2**: Error messages in Vietnamese are acceptable (no i18n framework needed)  
**ASSUMPTION-3**: Modal will be mounted by parent (e.g., PortfolioPage in Task 5), not self-mounted  
**ASSUMPTION-4**: Form state is component-local, no Redux/global state needed  
**ASSUMPTION-5**: CASH symbol is always reserved and cannot be removed by users (enforced by API)  

---

## ACCEPTANCE CRITERIA (Testable Checklist)

### AC-1: Stock Form Validation & Add Flow
**Given**: StockModal opens in Add mode  
**When**: User enters valid data (symbol="VNM", entry_price="85000", quantity="100") and clicks Submit  
**Then**: 
- ✅ `portfolioApi.addPortfolio()` called with correct data
- ✅ `portfolioItems` signal updated
- ✅ Modal closes
- ✅ Success toast shown

**Given**: User enters empty symbol  
**When**: Tries to submit  
**Then**: 
- ✅ Error message shown below Symbol field ("Ký hiệu cổ phiếu là bắt buộc")
- ✅ Submit button disabled
- ✅ Form not submitted

**Given**: User enters invalid entry_price (negative, non-numeric, or > 1M)  
**When**: Tries to submit  
**Then**: 
- ✅ Error message shown ("Giá nhập phải > 0 và ≤ 1,000,000")
- ✅ Submit button disabled

**Given**: User enters invalid quantity (zero, negative, non-integer, or > 1M)  
**When**: Tries to submit  
**Then**: 
- ✅ Error message shown ("Số lượng phải là số nguyên dương ≤ 1,000,000")
- ✅ Submit button disabled

**Given**: API call fails  
**When**: User submits form  
**Then**: 
- ✅ Error toast shown with message (e.g., "Không thể thêm cổ phiếu")
- ✅ Modal stays open for retry
- ✅ Form data preserved

---

### AC-2: Duplicate Symbol Detection
**Given**: Portfolio already contains symbol="VNM" (case-insensitive)  
**When**: User tries to add symbol="vnm" or "VNM" (different case)  
**Then**: 
- ✅ Error shown ("Cổ phiếu này đã có trong danh sách")
- ✅ Submit disabled
- ✅ Form not submitted

**Given**: StockModal in Edit mode with symbol="VNM"  
**When**: User tries to change to existing symbol (but same ID, so not a duplicate)  
**Then**: 
- ✅ Symbol field is disabled (read-only)
- ✅ Edit proceeds for price/quantity only

**Given**: Portfolio contains both "VNM" and "VIC"  
**When**: User adds new symbol "BID"  
**Then**: 
- ✅ No duplicate error
- ✅ Form validates successfully
- ✅ API call succeeds

---

### AC-3: CASH Symbol Special Handling
**Given**: User selects symbol="CASH"  
**When**: StockModal form renders  
**Then**: 
- ✅ Entry Price field is **HIDDEN** (not just disabled)
- ✅ Quantity field is **VISIBLE** and required
- ✅ Display note: "📝 Tiền mặt - Giá nhập được đặt thành 1"

**Given**: User submits CASH form with quantity="5000"  
**When**: API is called  
**Then**: 
- ✅ `addPortfolio()` called with: `{ symbol: "CASH", quantity: 5000, entry_price: 1 }`
- ✅ `current_price` remains null or 0 (CASH has no market price)
- ✅ Modal closes on success

**Given**: Portfolio contains CASH with quantity=5000  
**When**: Edit CASH entry  
**Then**: 
- ✅ Entry Price field still hidden
- ✅ Only quantity editable
- ✅ CASH quantity increases/decreases correctly

---

### AC-4: Price Update Modal & Batch Operations
**Given**: PriceUpdateModal opens  
**When**: Portfolio has 3 stocks (VNM, VIC, BID) — CASH excluded  
**Then**: 
- ✅ 3 input fields shown (one per stock)
- ✅ Each field has current market price as placeholder
- ✅ CASH is NOT in the list (no price update needed)

**Given**: User enters new prices for all stocks and clicks Submit  
**When**: All prices are valid (> 0)  
**Then**: 
- ✅ `portfolioApi.updateStockPrices()` called with batch: `[{ symbol: "VNM", current_price: 85500 }, ...]`
- ✅ `currentPrice` signal updated for each stock
- ✅ Modal closes
- ✅ Success toast shown

**Given**: User enters invalid price (0, negative, or non-numeric)  
**When**: Tries to submit  
**Then**: 
- ✅ Error shown below that field ("Giá phải > 0")
- ✅ Submit button disabled
- ✅ Other valid prices not submitted

**Given**: Portfolio is empty (no stocks)  
**When**: PriceUpdateModal opens  
**Then**: 
- ✅ Empty state message shown: "Không có cổ phiếu nào để cập nhật giá"
- ✅ No input fields rendered

**Given**: Batch price update API fails  
**When**: User submits  
**Then**: 
- ✅ Error toast shown ("Không thể cập nhật giá")
- ✅ Modal stays open for retry
- ✅ Prices remain unchanged in UI

---

## CONTEXT (Evidence Anchors)

### Jira
- **Key**: X51LABS-156
- **Epic**: X51LABS-152 (Portfolio Refactoring)
- **Related Tasks**: 
  - **Blocker**: X51LABS-153 (Task 1: State Management) ✅ COMPLETE
  - **Blocked By**: None
  - **Blocks**: X51LABS-157 (Task 5: Container) ⏳

### Repository
- **Branch**: `feature/preact-ui-migration`
- **Likely modules**:
  - `src/ui-preact/state/portfolioState.js` (Task 1 — signals + API)
  - `src/ui-preact/api/portfolioApi.js` (Task 1 — API contracts)
  - `src/ui-preact/components/StockModal.jsx` (NEW — this task)
  - `src/ui-preact/components/PriceUpdateModal.jsx` (NEW — this task)
  - `src/ui-preact/utils/formValidation.js` (NEW — this task)
  - `tests/unit/modals/task4-modals.test.js` (NEW — 36 tests)

### Test Framework
- **Framework**: Vitest
- **Pattern**: Signal mocking + Component testing
- **Coverage Target**: 100% AC coverage

---

## SUMMARY

**Task 4** delivers form validation and two modal components to enable users to:
1. **Add/Edit stocks** with real-time validation
2. **Handle CASH special case** (no entry price)
3. **Batch update prices** efficiently

**Inputs** from Task 1: `portfolioItems` signal, `addPortfolio()`, `updatePortfolio()`, `updateStockPrices()`  
**Outputs** for Task 5: Modals ready to mount in PortfolioPage container  
**Tests**: 36 comprehensive tests covering all AC + edge cases  
**Risk Level**: LOW (self-contained, no breaking changes)

---

**Status**: ✅ COMPLETE — All 4 AC verified, ready for code review.

