# TICKET BRIEF — X51LABS-155 Task 3: Real-time Pricing

**Ticket Key**: X51LABS-155  
**Status**: ✅ COMPLETE (Jan 31, 2026, 11:51 UTC+7)  
**Priority**: High  
**Type**: Story  

---

## GOAL

Implement **60-second polling loop** for SSI iBoard API with reactive signal updates. When prices refresh, UI automatically re-renders showing new P&L values via Preact signals.

**Success Metric**: currentPrice updates in signal trigger reactive re-renders without user action; all error scenarios handled gracefully.

---

## SCOPE (What Will Be Done)

1. **Polling Architecture**
   - 60-second interval started on portfolio mount
   - Cleanup (interval cleared) on unmount
   - Calls `fetchStockPricesWithRetry()` for all portfolio symbols

2. **Batch Fetching (SSI API)**
   - Max 5 stocks per request
   - 1-second delay between batches (rate limiting)
   - Aggregate prices into symbol→price map

3. **Signal Mutations**
   - Update `portfolioItems[i].currentPrice` atomically
   - Update `lastUpdateTime` signal on success
   - Trigger dependent signals: `totalValue`, `totalPL` re-calculate

4. **Error Handling**
   - Network errors → toast message, retry on next interval
   - Rate limiting (HTTP 429) → exponential backoff (1s, 2s, 4s)
   - Validation errors → log, keep old prices
   - Unknown errors → safe failure (no price update)

5. **Status Tracking**
   - `lastUpdateTime` signal (formatted: "2 phút trước", etc.)
   - `isUpdatingPrices` signal (loading state)
   - `priceUpdateError` signal (error message)
   - Status helper: `getRealtimeStatusIndicator()` (🟢 Live, 🟡 Updating, etc.)

6. **Testing**
   - Polling lifecycle (start, stop, cleanup)
   - Price updates trigger reactive rendering
   - Error scenarios (network, rate limit, validation)
   - Signal mutations verified

---

## NON-GOALS (What Will NOT Be Done)

- ❌ Websocket integration (polling only)
- ❌ Database persistence of prices (in-memory signals only)
- ❌ Manual price override UI
- ❌ Historical price tracking
- ❌ Per-stock update intervals
- ❌ User-configurable polling frequency

---

## CONSTRAINTS

### Explicit Constraints (from ticket + architecture)

1. **Dependency**: ✅ Requires Task 1 (signals state management)
2. **Backward Compatibility**: No breaking changes (new module only)
3. **Performance**: 
   - Polling interval: ≤ 60 seconds
   - Batch request ≤ 5 stocks, 1s delay between batches
   - No memory leaks (cleanup on unmount required)
4. **Security**: 
   - Least privilege: no credentials in client code
   - SSI API timeout: 5s default (prevent hanging)
5. **Rollout**: 
   - Zero-impact feature (side effect only)
   - Can be disabled if SSI API goes down

### ASSUMPTIONS (not explicitly stated)

- SSI API available at `https://iboard-query.ssi.com.vn/stock/price/{symbol}`
- Network errors are transient (retry strategy valid)
- Polling can continue even if single stock fails
- Vietnamese error messages acceptable

---

## CONTEXT (Evidence Anchors)

### Jira
- **Key**: X51LABS-155
- **Epic**: X51LABS-152 (Portfolio Refactoring)
- **Blocked By**: X51LABS-153 (Task 1: State Management) ✅ COMPLETE
- **Related**: X51LABS-156 (Task 4: Modals)
- **Components**: portfolio, realtime, pricing

### Repo (Module Map)
- **State**: `src/ui-preact/state/portfolioState.js` — signals foundation ✅
- **API**: `src/ui-preact/api/portfolioApi.js` — backend calls ✅
- **Implementation** (NEW):
  - `src/ui-preact/api/portfolioPricing.js` — SSI API layer (200 lines)
  - `src/ui-preact/api/portfolioPriceUpdater.js` — polling lifecycle (250 lines)
- **Tests** (NEW):
  - `tests/unit/pricing/task3-pricing.test.js` — 23 tests

### Architecture
- **Framework**: Preact + Signals
- **State Management**: Signals (atomic, no Redux)
- **Async**: async/await with Promises
- **Testing**: Vitest with vi.useFakeTimers()

---

## ACCEPTANCE CRITERIA (Testable Checklist)

### AC-1: Polling Starts on Mount ✅

**Given**: Portfolio component loads with stocks  
**When**: Effect hook runs on mount  
**Then**: 
- 60-second interval started
- `lastUpdateTime` signal updated immediately
- Next poll scheduled for T+60s

**Verification**:
```javascript
✅ test: "should start polling on mount"
✅ test: "should set lastUpdateTime immediately"
✅ test: "should update prices after interval"
```

---

### AC-2: Prices Update Reactively ✅

**Given**: SSI API returns new prices  
**When**: Polling interval fires (60s elapsed)  
**Then**:
- `currentPrice` updated for each stock
- `totalValue` signal recalculates
- `totalPL` signal recalculates
- UI re-renders with new values

**Verification**:
```javascript
✅ test: "should update currentPrice from API response"
✅ test: "should update totalValue signal"
✅ test: "should update totalPL signal"
✅ test: "should handle multiple stock updates"
```

---

### AC-3: Errors Handled Gracefully ✅

**Given**: SSI API error (network, timeout, 429, validation)  
**When**: Error occurs during polling  
**Then**:
- Error classified (NETWORK_ERROR, RATE_LIMIT, TIMEOUT, VALIDATION_ERROR)
- User message shown in toast
- Old prices kept (no update)
- Retry scheduled on next interval
- No crash or silent failure

**Verification**:
```javascript
✅ test: "should handle network errors gracefully"
✅ test: "should handle rate limit errors"
✅ test: "should handle timeout errors"
✅ test: "should handle validation errors"
✅ test: "should retry on next polling interval"
✅ test: "should keep old prices on error"
```

---

### AC-4: Polling Cleanup on Unmount ✅

**Given**: Portfolio page in polling state  
**When**: Component unmounts  
**Then**:
- Polling interval cleared
- No more API calls scheduled
- Memory freed (no leak)

**Verification**:
```javascript
✅ test: "should stop polling on unmount"
✅ test: "should clear lastUpdateTime on unmount"
```

---

## IMPLEMENTATION SUMMARY (POST-AUDIT)

### Files Implemented

**1. portfolioPricing.js** (200 lines)
- `fetchStockPrice(symbol)` — Fetch single stock price
- `fetchStockPricesBatch(symbols)` — Batch with rate limiting
- `fetchStockPricesWithRetry(symbols, retryCount)` — Retry logic
- `classifyPricingError(error)` — Error classification

**2. portfolioPriceUpdater.js** (250 lines)
- `startPricePolling()` — Start 60s interval
- `stopPricePolling()` — Cleanup
- `updatePricesNow()` — Manual trigger
- Signals: `lastUpdateTime`, `isUpdatingPrices`, `priceUpdateError`
- Helpers: `getLastUpdateTimeFormatted()`, `getRealtimeStatusIndicator()`

**3. task3-pricing.test.js** (580 lines)
- 23 comprehensive tests
- All AC covered
- Error scenarios tested

### Test Results

```
✅ 23/23 tests PASSING
✅ All AC verified
✅ Zero breaking changes
✅ 100% code coverage for new code
```

### AC → Verification Map

| AC | Implementation | Test File | Status |
|----|----------------|-----------|--------|
| AC-1 | `startPricePolling()` + 60s interval | task3-pricing.test.js:L45-60 | ✅ PASS |
| AC-2 | `portfolioItems` signal mutation | task3-pricing.test.js:L75-120 | ✅ PASS |
| AC-3 | `classifyPricingError()` + retry logic | task3-pricing.test.js:L135-220 | ✅ PASS |
| AC-4 | `stopPricePolling()` cleanup | task3-pricing.test.js:L230-250 | ✅ PASS |

---

## SECURITY & OPERATIONAL GATES

### Security Gate ✅

| Check | Status | Mitigation |
|-------|--------|-----------|
| Authentication | ✅ N/A | Client polling (no auth needed) |
| Authorization | ✅ OK | User data isolated by portfolioItems signal |
| Input Validation | ✅ OK | Symbol validation in batchFetch |
| PII/Secrets | ✅ OK | No credentials in code, SSI API key in manifest |
| Injection Risks | ✅ OK | No user input in API URL |
| Dependency Safety | ✅ OK | No new dependencies added |
| Rate Limiting | ✅ OK | Max 5 stocks/batch, 1s delay between batches |

### Operational Readiness ✅

| Check | Status | Evidence |
|-------|--------|----------|
| Observability | ✅ OK | `lastUpdateTime`, `isUpdatingPrices` signals visible |
| Error Handling | ✅ OK | `priceUpdateError` signal + toast messages |
| Performance | ✅ OK | 60s interval, batch size 5, 1s delay |
| Timeouts | ✅ OK | 5s default fetch timeout |
| Monitoring | ✅ OK | Status indicator emoji (🟢 Live, 🟡 Updating, 🔴 Error) |
| Rollback | ✅ OK | Disable polling = no API calls (safe) |

---

## RISK ASSESSMENT

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| SSI API downtime | Medium | Low | Retry logic, keep old prices |
| Rate limiting (429) | Low | Medium | Exponential backoff strategy |
| Network interruption | Medium | Low | Transient retry on next interval |
| Performance regression | Low | Low | 60s interval is acceptable |
| Memory leak | Low | Critical | Cleanup on unmount enforced |

---

## DEPLOYMENT & ROLLOUT

### Pre-deployment
- [x] Code review (ready)
- [x] All tests passing (127/127 including Tasks 1-2)
- [x] Zero breaking changes
- [x] Documentation complete

### Rollout Plan
1. **Stage 1**: Merge to develop (this week)
2. **Stage 2**: Deploy to staging (test with real SSI API)
3. **Stage 3**: Monitor error rates + CPU usage
4. **Stage 4**: Gradual production rollout (25% → 50% → 100%)

### Rollback Plan
- Disable polling: remove `startPricePolling()` call from component mount
- Safe: no data loss, just stale prices until page reload
- Estimated rollback time: <5 minutes

---

## REFERENCES

- **Jira Epic**: X51LABS-152 (Portfolio Refactoring)
- **Task 1** (dependency): X51LABS-153 ✅ COMPLETE
- **Documentation**: `docs/X51LABS-155-156_TASKS3-4_COMPLETION.md`
- **Branch**: `feature/preact-ui-migration`

---

**Status**: ✅ **IMPLEMENTATION COMPLETE & VERIFIED**  
**Recommendation**: Ready for code review and merge to develop  
**Sign-off Date**: 2026-01-31 12:00 UTC+7

