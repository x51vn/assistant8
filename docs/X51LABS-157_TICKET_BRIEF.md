# Task 5: PortfolioPage Container + Actions — Ticket Brief

**Ticket**: X51LABS-157  
**Epic**: X51LABS-152 (Portfolio Refactoring)  
**Status**: In Progress → Code Review  
**Priority**: High  
**Estimate**: 3-4 hours  

---

## Objective

Create the main **PortfolioPage.jsx** container component that:
1. Orchestrates all sub-components (PortfolioTable, PortfolioSummary, StockModal, PriceUpdateModal, etc.)
2. Implements 4 action buttons (Add Stock, Refresh, Evaluate, Tea Stock)
3. Manages lifecycle: mount → fetch → render, unmount → cleanup
4. Handles loading/error states gracefully

---

## Goal Statement

**Create top-level PortfolioPage.jsx that:**
- Initializes portfolio state + realtime updates on component mount
- Orchestrates all sub-components with proper modal state management
- Implements 4 action buttons with loading indicators
- Manages cleanup on unmount (polling intervals, subscriptions)
- Provides error recovery (retry button, error banner)

---

## Scope

### In-Scope ✓

| Component | Lines | Purpose |
|-----------|-------|---------|
| **PortfolioPage.jsx** | ~250 | Main container, lifecycle management |
| **PortfolioActions.jsx** | ~150 | 4 action buttons + loading spinners |
| **Modification: src/ui-preact/index.js** | ~5 | Add route to PortfolioPage |

### Features

- **Mount Effect**: `portfolioApi.fetchPortfolio()` → load into signals
- **Render**: PortfolioActions + PortfolioSummary + PortfolioTable + all modals
- **Modal Orchestration**: 4 state signals (AddModal, EditModal, PriceModal, EvaluateModal, TeaStockModal)
- **Loading State**: Spinner while fetching, disabled buttons during operations
- **Error State**: Error banner + retry button
- **Unmount Cleanup**: Clear polling intervals, unsubscribe from realtime

### Out-of-Scope ✗

- ChatGPT integration (Task 6)
- E2E tests (Task 7)
- Dark/light theme (Task 7)
- Tea Stock implementation (Task 6)

---

## Non-Goals

- Production-grade error reporting (send to backend)
- Internationalization (i18n) support
- Advanced accessibility (WCAG AAA)

---

## Constraints

| Constraint | Value | Reason |
|-----------|-------|--------|
| Dependencies | Tasks 1, 2, 3, 4 | All sub-components required |
| Max component size | 300 lines | Readability + testing |
| Bundle size | < 30KB | Performance |
| Load time | < 2s (with mock API) | UX perception |

---

## Acceptance Criteria (Testable)

### AC-1: Initialization & Fetch ✓
**Given**: PortfolioPage component mounts  
**When**: useEffect triggers on mount  
**Then**:
- `portfolioApi.fetchPortfolio()` is called
- `isLoading` signal = true
- After fetch completes: `isLoading` = false, `portfolioItems` populated
- Price polling is started via `portfolioPriceUpdater.startPricePolling()`
- **Test**: Verify all calls, state transitions, polling start

### AC-2: Add Stock Action ✓
**Given**: User views PortfolioPage  
**When**: User clicks "Add Stock" button  
**Then**:
- `isAddModalOpen` signal changes to true
- StockModal renders in "Add" mode
- Form is empty (no pre-filled data)
- **Test**: Verify signal toggled, modal rendered, form empty

### AC-3: Edit Stock Action ✓
**Given**: Stock exists in table  
**When**: User clicks "Edit" in row + submits StockModal  
**Then**:
- `isEditModalOpen` signal = true
- Form pre-filled with stock data
- On submit: `portfolioApi.updatePortfolio()` called
- Modal closes, table re-renders with updated data
- Success toast shown
- **Test**: Verify edit flow, data persistence

### AC-4: Refresh Prices Action ✓
**Given**: User clicks "Refresh" button  
**When**: Button click fires  
**Then**:
- `portfolioPriceUpdater.updatePricesNow()` called
- Button shows loading spinner
- Prices update in UI
- "Prices updated" toast shown
- Button returns to normal state
- **Test**: Verify API call, UI updates, toast

### AC-5: Error Handling ✓
**Given**: Network error during fetch  
**When**: `portfolioApi.fetchPortfolio()` throws error  
**Then**:
- Error banner displayed with error message
- "Retry" button available
- Loading spinner hidden
- Click retry → re-fetches
- **Test**: Verify error handling, retry flow

### AC-6: Unmount Cleanup ✓
**Given**: PortfolioPage component unmounts  
**When**: useEffect cleanup runs  
**Then**:
- `portfolioPriceUpdater.stopPricePolling()` called
- Polling interval cleared (no more API calls)
- No memory leaks (checked via DevTools)
- **Test**: Verify cleanup called, no lingering intervals

### AC-7: Modal State Management ✓
**Given**: User opens multiple modals  
**When**: Actions fired  
**Then**:
- Only one modal open at a time
- Opening new modal closes previous
- Modals properly receive close callbacks
- **Test**: Verify exclusive modal state

---

## Implementation Plan

### Phase 1: Core Container (45 min)
1. Create `PortfolioPage.jsx` skeleton
2. Add mount/unmount effects
3. Add modal state signals (5 signals)
4. Render all sub-components

### Phase 2: Actions Bar (30 min)
1. Create `PortfolioActions.jsx`
2. Implement 4 buttons with loading states
3. Wire button click handlers to parent

### Phase 3: Integration (45 min)
1. Wire modal callbacks
2. Implement error handling + retry
3. Update routing in `src/ui-preact/index.js`
4. Test all flows manually

---

## Technical Details

### Signals Required

```javascript
// Modal states
isAddModalOpen    // StockModal Add mode
isEditModalOpen   // StockModal Edit mode
editingStockId    // Which stock being edited
isPriceModalOpen  // PriceUpdateModal
isEvaluateModalOpen  // EvaluatePortfolioModal
isTeaStockModalOpen  // TeaStockModal

// UI states
isLoading         // Page loading
pageError         // Error message (null if ok)
showSuccessToast   // Success message
showErrorToast     // Error message
```

### Mount Effect

```javascript
useEffect(() => {
  const load = async () => {
    try {
      setIsLoading(true);
      await portfolioApi.fetchPortfolio();
      portfolioPriceUpdater.startPricePolling();
    } catch (err) {
      setPageError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  load();
  
  return () => {
    portfolioPriceUpdater.stopPricePolling();
  };
}, []);
```

### Modal Orchestration

```javascript
const openAddModal = () => {
  setIsEditModalOpen(false);
  setIsPriceModalOpen(false);
  setIsEvaluateModalOpen(false);
  setIsTeaStockModalOpen(false);
  setIsAddModalOpen(true);
};

const closeAllModals = () => {
  setIsAddModalOpen(false);
  setIsEditModalOpen(false);
  setIsPriceModalOpen(false);
  setIsEvaluateModalOpen(false);
  setIsTeaStockModalOpen(false);
};

const handleStockSaved = (newStock) => {
  closeAllModals();
  setShowSuccessToast(`Stock ${newStock.symbol} saved!`);
};
```

---

## Testing Strategy

### Unit Tests (task5-container.test.js)
- ✓ Mount effect: fetch called, polling started
- ✓ Unmount: cleanup called, polling stopped
- ✓ Add modal: opens/closes correctly
- ✓ Edit modal: opens with data, closes on save
- ✓ Refresh button: calls updatePricesNow
- ✓ Error handling: shows error banner, retry works
- ✓ Modal exclusivity: only one open at a time
- ✓ Loading states: disabled buttons, spinner shown
- **Target**: 30+ test cases, 100% AC coverage

### Manual QA
- [ ] Load page: table renders with data
- [ ] Click Add: modal opens, form empty
- [ ] Click Refresh: spinner, prices update
- [ ] Network error: banner shows, retry works
- [ ] F12 DevTools: no console errors, no memory leaks

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Modal state explosion | Medium | Use exclusive close-all function |
| Memory leaks on unmount | High | Comprehensive cleanup in useEffect return |
| Timing issues (fetch + polling) | Medium | Explicit state sequencing |
| Component re-render storms | Medium | Use stable callbacks + effect dependencies |

---

## Success Criteria

✅ All 7 AC passed with tests  
✅ All sub-components render correctly  
✅ No console errors  
✅ No memory leaks (DevTools)  
✅ All 4 action buttons work  
✅ Error handling robust  
✅ Cleanup verified  

---

## Sign-Off

**Created**: 2026-01-31  
**Task**: X51LABS-157  
**Status**: Ready for implementation  
**Dependencies Met**: ✅ Tasks 1, 2, 3, 4 complete
