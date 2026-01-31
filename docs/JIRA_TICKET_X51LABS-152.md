# JIRA TICKET CREATION PLAN & OUTPUT

## A) PLAN (Implementation & Context)

### What Will Change
1. **Create 8 new Preact components** for Portfolio page migration:
   - `PortfolioPage.jsx` - Main container with lifecycle management
   - `PortfolioTable.jsx` - Data grid for stock list
   - `StockRow.jsx` - Individual stock row with P&L calculations
   - `PortfolioSummary.jsx` - Summary statistics (NAV, Entry, Current, P&L)
   - `StockModal.jsx` - Add/Edit modal with conditional CASH handling
   - `PriceUpdateModal.jsx` - Bulk price update modal
   - `PortfolioActions.jsx` - Action buttons (Add, Refresh, Evaluate, TeaStock)
   - Plus API layer and state management

2. **Create 2 new support files**:
   - `src/ui-preact/state/portfolioState.js` - 15+ signal definitions + helper functions
   - `src/ui-preact/api/portfolioApi.js` - Message routing for PORTFOLIO_* messages

3. **Update CSS**:
   - Add portfolio-specific theme tokens and component styles
   - Apply CSS custom properties (light/dark theme support)

### What Will NOT Change
- ✅ Background handlers remain unchanged (PORTFOLIO_GET, ADD, UPDATE, REMOVE already exist)
- ✅ Supabase schema unchanged (portfolio table already structured)
- ✅ Message types frozen (MESSAGE_TYPES.PORTFOLIO_* already defined)
- ✅ Settings page unaffected (separate Preact migration)
- ✅ Vanilla JS portfolio.js remains for reference (will be removed in cleanup phase post-migration)

### Key Risks + Mitigations
| Risk | Mitigation |
|------|-----------|
| **Large data table performance** (100+ stocks) | Start without virtualization; add if needed. Monitor build size. |
| **Realtime price updates stability** | Use existing SSI API polling (60s), proven in vanilla code |
| **Modal state explosion** (3 modals + confirmations) | Centralize in portfolioState.js signals; reuse ConfirmationDialog |
| **P&L calculation bugs** | Copy calculation logic from portfolioPL.js; add unit tests |
| **CASH special handling complexity** | Clear conditional rendering; test both paths |

### Jira Context (MCP Evidence)
- **FACT**: Project X51LABS exists, 23 portfolio-related tickets found
- **FACT**: X51LABS-149/150 in progress (Settings Preact migration - same pattern to follow)
- **FACT**: X51LABS-145 (portfolio page skeleton) already done
- **FACT**: No duplicate "Portfolio Preact migration" ticket exists
- **FACT**: Ready to create X51LABS-152 as next sequential story

### Tests to Run/Add
1. **Unit tests** (`tests/unit/`):
   - Signal initialization and mutations
   - P&L calculations (matchPortfolioPL.js results)
   - Error response handling (dual format: `error` vs `errorCode`)
   
2. **E2E tests** (update `tests/e2e/portfolio.spec.js`):
   - Load portfolio and render table ✓ (already has stub)
   - Add/Edit/Delete stock flows
   - Modal interactions
   - Realtime price updates
   - Evaluate portfolio (ChatGPT integration)

3. **Manual QA**:
   - Dark/light theme toggle
   - CASH special rendering
   - Empty portfolio state
   - Network error handling
   - Large portfolios (50+ stocks)

### Rollout & Rollback
- **Feature flag**: None needed (this is feature-complete replacement)
- **Rollout**: Deploy as part of sprint; full cutover from vanilla to Preact
- **Rollback**: If critical bugs, revert commit and keep vanilla portfolio.js live
- **Data integrity**: Zero impact (Supabase schema unchanged)

---

## B) FINAL JIRA TICKET (Paste-Ready)

### [ISSUE TYPE]: Story

### [SUMMARY]
Migrate Portfolio page from vanilla JS to Preact with signal-based state management

---

## GOAL

Complete feature-parity Preact migration of the Portfolio page (currently 1879 lines vanilla JS) to match Settings page pattern (X51LABS-151). Enable:
- ✅ Stock holdings display (entry, current, quantity, P&L)
- ✅ CRUD operations (Add/Edit/Delete) via Supabase
- ✅ Real-time price updates (SSI API 60s polling)
- ✅ Portfolio evaluation (send data + prompt to ChatGPT)
- ✅ Dark/light theme support
- ✅ In-extension modals (no native alerts)
- ✅ User-friendly error handling (Vietnamese messages)

---

## SCOPE (In-scope)

**New components** (8 files, ~870 lines total):
- PortfolioPage.jsx - Main container with lifecycle (load, realtime init, render)
- PortfolioTable.jsx - Data grid with sort (regular stocks first, CASH last)
- StockRow.jsx - Individual row with P&L coloring (green/red/gray)
- PortfolioSummary.jsx - Summary stats box (NAV, Entry, Current, Total P&L)
- StockModal.jsx - Add/Edit modal with CASH special handling
- PriceUpdateModal.jsx - Bulk price update list
- PortfolioActions.jsx - Action buttons (Add/Refresh/Evaluate/TeaStock)
- Utility: API layer + state (signals + helpers)

**Styling**:
- Portfolio-specific CSS in `src/extension/styles.css`
- Theme tokens for light/dark mode (CSS custom properties)
- Card layouts, table styles, modal animations

**Integration**:
- Reuse ConfirmationDialog for delete confirmations
- Reuse StatusMessage for toast notifications
- Follow settingsState.js signal pattern
- Use existing MESSAGE_TYPES.PORTFOLIO_* handlers

**Testing**:
- Update E2E tests (`portfolio.spec.js`)
- Add unit tests for P&L calculations
- Manual QA: dark/light theme, CASH handling, network errors

---

## NON-GOALS (Out-of-scope)

- ❌ Advanced portfolio analytics (diversification, correlation analysis)
- ❌ Virtualization for 1000+ stocks (lazy load not needed for MVP)
- ❌ WebSocket real-time (keep polling as-is)
- ❌ Offline mode or local caching
- ❌ Advanced export/import features
- ❌ Portfolio benchmarking or performance comparison
- ❌ Multi-currency support
- ❌ Removing vanilla portfolio.js (keep for reference post-migration)

---

## CONSTRAINTS

**No new dependencies**:
- Use existing: Preact, @preact/signals, htm, Supabase JS client
- No additional npm packages allowed

**Backward compatibility**:
- Supabase schema frozen (no breaking changes)
- MESSAGE_TYPES unchanged
- Background handlers unchanged (PORTFOLIO_* already implemented)

**Performance & Build size**:
- Build output: < 350 KB (gzipped < 100 KB)
- Initial load: < 2s
- Table render: < 500ms for 50 stocks

**Security & Privacy**:
- No credentials in client code
- RLS policies enforce user isolation (Supabase)
- XSS prevention (escapeHtml on all user input)
- No PII logging

**UI/UX requirements**:
- Theme support (light/dark via CSS custom properties)
- Responsive design (horizontal scroll on mobile)
- CASH item special handling (always bottom, different styling)
- Vietnamese error messages (user-friendly)

---

## CONTEXT (Evidence)

### Confluence SPEC (MCP):
**FACT**: Inline design document at `docs/PORTFOLIO_PAGE_MIGRATION.md`
- Sections: Overview, Current Implementation, Target State, Components, State Management, Data Flow, Migration Strategy
- Acceptance criteria: 12 AC mapped to implementation
- Complexity: HIGH, Estimated 3-4 days
- Special features: CASH handling, P&L coloring, realtime polling, ChatGPT integration

### Jira Context (MCP):
**FACT**: Project X51LABS (key="X51LABS")
- Active migration pattern: X51LABS-149/150 (Settings page Preact migration)
- Completed prerequisite: X51LABS-145 (portfolio page skeleton)
- Completed infrastructure: X51LABS-108/109 (Supabase setup), X51LABS-90 (E2E tests)
- No duplicate: Search for "portfolio" + "preact" + "migrate" = no existing ticket

**FACT**: Issue type conventions
- "Story" used for feature implementations (X51LABS-151 is Story)
- Components: Portfolio, Settings, UI, Frontend
- Labels: preact-migration, feature, high-complexity

### Repo Evidence (FACT):

**Current vanilla implementation**:
- `src/ui/portfolio.js` (1879 lines) - Main UI logic
  - Lines 24-76: `getPortfolioFromSupabase()` - Fetch via background handler
  - Lines 189-380: `initPortfolio()` - Setup event listeners
  - Lines 382-550: `loadPortfolioUI()` - Render table with P&L calculations
  - Lines 664-755: `openAddStockModal()` / `openEditStockModal()` - Modal logic
  - Lines 771-895: `evaluatePortfolio()` - Build portfolio markdown + send to ChatGPT
  - Lines 1006-1100: `openPriceUpdateModal()` / `savePriceUpdates()` - Price updates
  - Lines 1123+: `startRealtimeUpdates()` - SSI API polling (60s)

- `src/ui/portfolioPL.js` (216 lines) - P&L calculations
  - `calculateStockPL(stock)` - Per-stock P&L with percent
  - `calculatePortfolioTotalPL(portfolio)` - Total P&L aggregation
  - Reusable formulas to copy into Preact components

- `src/background/handlers/portfolio.js` (500 lines) - Supabase CRUD
  - `MESSAGE_TYPES.PORTFOLIO_GET` - Fetch all stocks
  - `MESSAGE_TYPES.PORTFOLIO_ADD` - Insert with validation + unique constraint
  - `MESSAGE_TYPES.PORTFOLIO_UPDATE` - Update stock fields
  - `MESSAGE_TYPES.PORTFOLIO_REMOVE` - Delete by symbol
  - Error handling with user-friendly messages (Vietnamese)

**Preact migration reference**:
- `src/ui-preact/state/settingsState.js` - Signal pattern for portfolio to follow
  - 10+ signals defined with consistent naming
  - Helper functions: `loadSettings()`, `updateSetting()`, `resetSettings()`
  - Error state management + clearing
  
- `src/ui-preact/api/authApi.js` - API error handling pattern
  - Dual format handling: `response.error?.message` vs `response.errorCode`
  - User-friendly error mapping
  - Async/await with try-catch

- `src/ui-preact/components/SettingsForm.jsx` - Form component pattern
  - Signal binding + input handlers
  - Validation feedback
  - Save/Reset buttons

- `src/ui-preact/components/ConfirmationDialog.jsx` - Modal reuse
  - Signal-driven visibility + callbacks
  - Theme support (CSS variables)

**Existing build setup**:
- `package.json` (FACT):
  - Framework: Preact 10.28.2 + @preact/signals 1.3.3
  - Build: Vite 5.0.0
  - Test: Playwright + Vitest
  - No portfolio-specific dependencies

- `vite.config.js` - Build output directory: `dist/`
  - Entry points: background, content, ui (will add settings-preact, portfolio-preact)

- `tests/e2e/portfolio.spec.js` - Existing E2E stub
  - Test structure established; ready to extend

**Theme tokens** (FACT):
- `src/extension/styles.css` contains CSS custom properties for light/dark mode
  - --app-bg, --surface-bg, --body-text, --input-bg, --success-bg, --error-bg, etc.
  - Applied to Settings page; will apply to Portfolio

---

## ACCEPTANCE CRITERIA (Pass/Fail)

### AC1: Portfolio Data Display
- [ ] Load portfolio from Supabase on page open → table renders with N stocks
- [ ] Display columns: Code, Entry, Current, Quantity, P&L (for non-CASH)
- [ ] CASH item at bottom with light blue background + bold text
- [ ] Summary stats box shows: NAV (nav value), Entry Value, Current Value, Total P&L
- [ ] P&L values colored: green (positive), red (negative), gray (no price)
- [ ] Empty state message when no stocks: "Chưa có mã nào. Nhấn "+ Thêm mã" để thêm."
- [ ] All numbers formatted: short format (200M) in summary, currency in modals

**Test**: Load portfolio page, verify table structure + empty state, verify CASH styling

### AC2: Add Stock Operation
- [ ] "+ Add Stock" button opens modal
- [ ] Modal fields: Code (required, uppercase), Entry Price (required, > 0), Quantity (required, > 0)
- [ ] Entry Price field hidden when code = "CASH"
- [ ] If stock exists → merge (add quantities)
- [ ] If new stock → insert to Supabase
- [ ] Success message: "Added VNM" (3s auto-dismiss)
- [ ] Table auto-refreshes after add

**Test**: Add VNM (100 @ 85000) → verify insert; add VNM again (50 @ 86000) → verify merge to 150 qty

### AC3: Edit Stock Operation
- [ ] Edit button on each row opens modal in "Edit" mode
- [ ] Code field is readonly (disabled input)
- [ ] Can modify: Entry Price, Quantity
- [ ] Save updates Supabase (PORTFOLIO_UPDATE)
- [ ] Success message: "Updated VNM"
- [ ] Table auto-refreshes

**Test**: Edit VNM qty 150 → 200, entry 86000 → 87000 → verify update

### AC4: Delete Stock Operation
- [ ] Delete button on each row
- [ ] Click delete → ConfirmationDialog: "Xóa VNM?"
- [ ] Cancel → modal closes, no change
- [ ] Confirm → DELETE from Supabase (PORTFOLIO_REMOVE)
- [ ] Success message: "Deleted VNM"
- [ ] Table auto-refreshes (stock removed)

**Test**: Delete VNM → confirm → verify stock gone from table

### AC5: Price Updates & Realtime
- [ ] "Refresh Prices" button → spinner, fetch from SSI API, update table rows
- [ ] "Price Update" modal button → list all non-CASH stocks with input fields
- [ ] Show reference entry prices in each row
- [ ] Save updates all prices to Supabase (PORTFOLIO_UPDATE)
- [ ] Realtime polling every 60s (if enabled) updates table without page refresh
- [ ] Last update time displayed: "Last updated: 2 min ago"

**Test**: Manually update price VNM 90000 → 91000 → verify DB + table; wait 60s → verify polling updates (if realtime enabled)

### AC6: Portfolio Evaluation
- [ ] "Evaluate" button (requires prompt in settings)
- [ ] Build markdown table: `| Code | Entry | Current | Qty | P&L |`
- [ ] Send to ChatGPT with user prompt (MESSAGE_TYPES.SEND_PROMPT)
- [ ] Poll for ChatGPT response (max 2 min)
- [ ] Auto-save to chat_history table (HISTORY_ADD + HISTORY_UPDATE)
- [ ] Success message: "Evaluation sent"
- [ ] Button shows spinner while sending

**Test**: Set eval prompt in settings → click Evaluate → verify ChatGPT tab opens + markdown table → verify history saved

### AC7: Tea Stock Search
- [ ] "Tea Stock" button (requires prompt in settings)
- [ ] Send prompt to ChatGPT (SEND_PROMPT)
- [ ] Auto-save to chat history
- [ ] Success message: "Tea stock search sent"
- [ ] Button shows spinner while sending

**Test**: Set tea stock prompt → click button → verify ChatGPT response → verify history saved

### AC8: Theme Support (Light/Dark)
- [ ] Light theme: white backgrounds, dark text, standard colors
- [ ] Dark theme: dark surfaces (#111827), light text (#e5e7eb)
- [ ] Respects system `prefers-color-scheme` media query
- [ ] All component text/backgrounds use CSS custom properties (var(--*))
- [ ] Switch system theme → page updates without reload

**Test**: Open DevTools → Emulate dark mode → portfolio page updates; switch to light → verify colors

### AC9: Modals & Dialogs (In-Extension Popups)
- [ ] Add/Edit modal: custom overlay + form
- [ ] Price Update modal: custom overlay + stock list
- [ ] Delete confirmation: use ConfirmationDialog component
- [ ] NO native `confirm()`, `alert()`, or `prompt()`
- [ ] All modals have close (X) + Cancel buttons
- [ ] Smooth fade in/out animations

**Test**: Open each modal → verify custom UI (not native); click X → verify closes smoothly

### AC10: Error Handling (User-Friendly Vietnamese)
- [ ] Duplicate stock: "Cổ phiếu VNM đã có trong danh mục"
- [ ] Network error: "Không thể kết nối đến Supabase"
- [ ] Auth expired: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại."
- [ ] Validation error: "Mã cổ phiếu là bắt buộc"
- [ ] Show errors in StatusMessage component
- [ ] Auto-dismiss after 5s

**Test**: Trigger each error → verify message + auto-dismiss

### AC11: Responsive Design
- [ ] Table scrolls horizontally on screens < 800px
- [ ] Modals scale to viewport (max-width 90%)
- [ ] Buttons min height 40px (touch-friendly)
- [ ] Action dropdown menu works on touch (mobile)

**Test**: Resize viewport to 375px (mobile) → verify table scrolls + modals fit + buttons tappable

### AC12: Performance & Build Size
- [ ] Initial page load < 2s (portfolio + realtime init)
- [ ] Smooth table scrolling (60fps)
- [ ] Realtime updates without lag
- [ ] No memory leaks on unmount (cleanup signals + subscriptions)
- [ ] Build output: dist/portfolio-preact.js < 350 KB (gzipped < 100 KB)
- [ ] No TypeScript errors in build

**Test**: npm run build → check output size; load page → DevTools Network tab; scroll table + update prices → Monitor memory

---

## DoD (Definition of Done) — Checklist (Pass/Fail)

**Code Quality**:
- [ ] All 8 components created + follow settingsState.js pattern
- [ ] Signal state centralized in `portfolioState.js` (no component-local state except UI-only)
- [ ] Message error handling supports dual format (`error` vs `errorCode`)
- [ ] HTML escaped to prevent XSS (escapeHtml on all user inputs)
- [ ] Vietnamese error messages from `errorCodes.js` or hardcoded mappings

**Styling**:
- [ ] CSS uses theme tokens (var(--*)) for all colors
- [ ] Dark/light theme works via `@media (prefers-color-scheme: dark)`
- [ ] Card layouts + table styles + modal animations applied
- [ ] Theme tokens added to `src/extension/styles.css`

**Functionality**:
- [ ] All AC1-AC12 pass (manual + automated tests)
- [ ] PORTFOLIO_GET/ADD/UPDATE/REMOVE messages work end-to-end
- [ ] Realtime polling updates table (60s interval)
- [ ] ChatGPT evaluation flow: send + poll + save history
- [ ] CASH special handling: hidden entry field, different styling, bottom position

**Testing**:
- [ ] E2E tests updated (`tests/e2e/portfolio.spec.js`) + passing
  - [ ] Load portfolio + render table
  - [ ] Add/Edit/Delete flows
  - [ ] Modal interactions
  - [ ] Price updates
  - [ ] Evaluate portfolio
- [ ] Unit tests for P&L calculations (match portfolioPL.js results)
- [ ] Manual QA completed:
  - [ ] Dark/light theme toggle
  - [ ] CASH special rendering
  - [ ] Empty portfolio state
  - [ ] Network error handling
  - [ ] Large portfolio (50+ stocks)

**Integration**:
- [ ] Reuse ConfirmationDialog + StatusMessage components (no duplicate code)
- [ ] Follow settingsState.js signal pattern + naming conventions
- [ ] API error handling follows authApi.js pattern
- [ ] No breaking changes to existing PORTFOLIO_* handlers
- [ ] Supabase schema unchanged

**Build & Deployment**:
- [ ] `npm run build` succeeds with zero errors/warnings
- [ ] Output: dist/portfolio-preact.js < 350 KB (gzipped < 100 KB)
- [ ] No new dependencies added (use existing Preact + signals + Supabase)
- [ ] Backward compatible (vanilla portfolio.js kept for reference)

**Documentation**:
- [ ] Code comments for complex P&L calculations
- [ ] Jira ticket updated with final status + commit hash
- [ ] PORTFOLIO_PAGE_MIGRATION.md marked as COMPLETED
- [ ] ADR or ARCHITECTURE.md updated if patterns changed

**Review**:
- [ ] Code review completed (PR approved)
- [ ] Test coverage > 80% (AC + edge cases)
- [ ] Performance validated (< 2s load, < 500ms table render)
- [ ] No console errors/warnings in production

---

## TEST PLAN

### Unit Tests (to add in `tests/unit/`)

**File**: `tests/unit/portfolio.test.js`
- Test `calculateStockPL()` matches portfolioPL.js results
- Test `calculatePortfolioTotalPL()` with multiple stocks
- Test signal initialization + mutations
- Test error response handling (dual format)

**Commands**:
```bash
npm run test:unit -- portfolio.test.js
```

### E2E Tests (update `tests/e2e/portfolio.spec.js`)

**Test cases**:
1. Load portfolio page + render table with stocks
2. Add new stock (VNM 100 @ 85000)
3. Merge existing stock (add VNM 50 @ 86000 → qty becomes 150)
4. Edit stock (change VNM qty to 200)
5. Delete stock + confirm dialog
6. Update prices manually + verify DB
7. Evaluate portfolio + verify ChatGPT prompt + history save
8. Tea stock search + verify history save
9. Dark/light theme switch
10. Error handling (network, validation, auth)

**Commands**:
```bash
npm run test:e2e -- portfolio.spec.js
npm run test:e2e:ui  # Interactive mode
```

### Edge Cases

- Portfolio with 0 stocks (empty state)
- Portfolio with only CASH
- Portfolio with 100+ stocks (performance)
- Network timeout during price fetch
- Session expired mid-operation
- Large numbers (millions) formatting
- Special characters in notes field

---

## RISKS / ROLLBACK

### Risks

1. **Performance regression** (table slow with 100+ stocks)
   - Mitigation: No virtualization in MVP; monitor via Lighthouse/DevTools
   - Rollback: Add React.memo / useMemo if needed

2. **Realtime price updates instability** (SSI API CORS / disconnects)
   - Mitigation: Keep existing polling approach (proven)
   - Fallback: Manual refresh button always available

3. **State management bugs** (signals not updating correctly)
   - Mitigation: Follow settingsState.js pattern precisely; thorough testing
   - Rollback: Simple signal mutations; easy to debug

4. **Modal state explosion** (multiple modals conflicting)
   - Mitigation: Centralize all modal open/data in signals
   - Rollback: Simple boolean flags; close others on open new

### Mitigations

- Code review by senior engineer familiar with Preact + signals
- Comprehensive E2E test suite (cover all flows)
- Manual QA on multiple devices + browsers
- Gradual rollout: feature flag if needed (though not planned for MVP)
- Rollback plan: revert commit + keep vanilla portfolio.js live

### Rollback

If critical bugs post-deployment:
```bash
git revert <portfolio-preact-commit-hash>
# Vanilla portfolio.js remains functional (no breaking changes to handlers)
# Communicate to users: "Portfolio page temporarily using legacy UI"
```

---

## REFERENCES

### Confluence Pages (MCP)
- **FACT**: Inline spec document: `docs/PORTFOLIO_PAGE_MIGRATION.md`
  - 12 sections describing components, state, flows, migration strategy
  - Acceptance criteria + complexity assessment

### Jira Issues
- **FACT**: X51LABS-151 (Settings page Preact migration) - REFERENCE for pattern
- **FACT**: X51LABS-150 (Signals + background API) - Prerequisite completed
- **FACT**: X51LABS-145 (Portfolio page skeleton) - Context
- **FACT**: X51LABS-90 (E2E test suite) - Testing infrastructure ready

### Repo Files (Evidence)

**Current vanilla code** (to refactor):
- [src/ui/portfolio.js](src/ui/portfolio.js) (1879 lines)
- [src/ui/portfolioPL.js](src/ui/portfolioPL.js) (216 lines)
- [src/background/handlers/portfolio.js](src/background/handlers/portfolio.js) (500 lines)

**Reference patterns** (follow):
- [src/ui-preact/state/settingsState.js](src/ui-preact/state/settingsState.js) - Signal pattern
- [src/ui-preact/api/authApi.js](src/ui-preact/api/authApi.js) - Error handling
- [src/ui-preact/components/ConfirmationDialog.jsx](src/ui-preact/components/ConfirmationDialog.jsx) - Modal reuse
- [src/ui-preact/settings/SettingsPage.jsx](src/ui-preact/settings/SettingsPage.jsx) - Container pattern

**Existing infrastructure**:
- [src/shared/messageSchema.js](src/shared/messageSchema.js) - MESSAGE_TYPES
- [src/extension/styles.css](src/extension/styles.css) - Theme tokens
- [tests/e2e/portfolio.spec.js](tests/e2e/portfolio.spec.js) - E2E stub

---

## C) QUALITY GATE (Verification Checklist)

✅ **Each FACT has evidence**:
- [x] Vanilla portfolio.js analyzed (1879 lines, line ranges cited)
- [x] Preact settings migration referenced (X51LABS-151 exists in Jira)
- [x] Message types exist (MESSAGE_TYPES.PORTFOLIO_* verified in codebase)
- [x] Supabase handlers exist (portfolio.js backend handler verified)
- [x] Build tooling confirmed (Vite + Preact + Signals in package.json)

✅ **Each AC is testable + pass/fail**:
- [x] AC1-AC12 all have concrete test steps + expected outcomes
- [x] No "works" language; all observable (table renders, DB updates, error message appears)
- [x] Can automate via E2E + manual verification steps specified

✅ **DoD is concrete (no "works")**:
- [x] Build output size measured (< 350 KB)
- [x] Performance measured (< 2s load, < 500ms render)
- [x] Tests specified (E2E + unit + manual cases listed)
- [x] Code review required (explicit)

✅ **Constraints addressed**:
- [x] No new dependencies (uses existing Preact + Signals)
- [x] Backward compatible (Supabase schema frozen, handlers unchanged)
- [x] Security (RLS policies, XSS prevention, no credentials)
- [x] Performance SLA (< 2s, < 500ms, < 350 KB)

✅ **Remaining ASSUMPTION / QUESTION (minimal)**:
- ASSUMPTION: SSI API remains available + responsive (no backend changes to polling logic)
- ASSUMPTION: Realtime polling 60s interval acceptable (no need for WebSocket in MVP)
- ASSUMPTION: 100+ stock optimization not needed (monitor post-launch)

✅ **Issue type selection justified**:
- **Story** chosen (vs Task/Bug) because:
  - Feature-complete replacement (new capability set)
  - Multiple acceptance criteria (AC1-AC12)
  - Cross-functional effort (UI + state + API + testing)
  - Extends existing codebase (not one-off fix)

---

## Ready to Create Jira Ticket ✅

**Recommended**:
1. Create issue in X51LABS project
2. Issue type: Story
3. Title: "Migrate Portfolio page from vanilla JS to Preact with signal-based state management"
4. Link as: **Relates to** X51LABS-151 (Settings Preact migration - same pattern)
5. Link as: **Blocks** X51LABS-?? (any future UI consolidation work)
6. Assign to: [Developer familiar with Preact + signals]
7. Sprint: Current / Next (based on capacity)
8. Estimate: 13 story points (3-4 days * 2-person review buffer)

**Next steps after creation**:
- Post link to PORTFOLIO_PAGE_MIGRATION.md in Jira description
- Tag as: `preact-migration`, `high-complexity`, `ui`
- Comment: "Reference: X51LABS-151 for Preact patterns; follow settingsState.js + authApi.js"

