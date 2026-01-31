# X51LABS-152 Decomposition Complete ✅

## 📊 Summary: 7 Tasks Created via Jira MCP

**Status**: All subtasks created and ready for development  
**Date**: January 31, 2026  
**Process**: breakdown-tasks.prompt.md (Steps 0-8 completed)

---

## 🎯 Big Task

**X51LABS-152**: Migrate Portfolio page from vanilla JS to Preact with signal-based state management

**Status**: Epic Story → ✅ **Decomposed into 7 sequential tasks**

---

## 📋 Subtasks Created

| # | Jira Key | Task | Duration | Status |
|---|----------|------|----------|--------|
| 1 | **X51LABS-153** | Setup: portfolioState signals + portfolioApi router | 3-4h | To Do |
| 2 | **X51LABS-154** | Build Table/Row/Summary components | 3-4h | To Do |
| 3 | **X51LABS-155** | Realtime: SSI API polling + signal updates | 2-3h | To Do |
| 4 | **X51LABS-156** | Build StockModal + PriceUpdateModal components | 3-4h | To Do |
| 5 | **X51LABS-157** | PortfolioPage container + PortfolioActions bar | 3-4h | To Do |
| 6 | **X51LABS-158** | ChatGPT: Evaluate + Tea Stock flows | 2-3h | To Do |
| 7 | **X51LABS-159** | E2E tests + theme + build polish | 3-4h | To Do |

**Total Effort**: 20-28 hours (~1 week sequential, 3-4 days with parallelization)

---

## 🔗 Dependency Graph

```
Task 1 (Setup) ← CRITICAL BLOCKER
  ↓
  ├─→ Task 2 (Components)  ───────┐
  ├─→ Task 3 (Realtime)    ───────┤
  ├─→ Task 4 (Modals)      ───────┼─→ Task 5 (Container) ─→ Task 6 (ChatGPT) ─→ Task 7 (Tests)
  │                               │
  └───────────────────────────────┘

PHASES:
- Day 1: Task 1 (3-4h)
- Day 2: Tasks 2, 3, 4 in parallel (~3-4h each)
- Day 3: Task 5 (3-4h)
- Day 4: Task 6 (2-3h) + Task 7 (3-4h)
```

---

## ✅ Coverage Guarantee

All 8 Big-Task deliverables covered:

| Deliverable | Task(s) | Evidence |
|-------------|---------|----------|
| Preact rendering | 1, 2, 5 | Components + container integration |
| Full CRUD ops | 1, 4, 5 | Signal helpers + modals + API |
| Real-time prices | 1, 3 | SSI polling + signal updates |
| Dark/light theme | 7 | CSS custom properties + testing |
| ChatGPT integration | 6 | Evaluate + Tea Stock modals |
| User-friendly errors | 1, 3, 4, 5, 6 | Error mapping + toasts |
| Zero schema changes | 1-7 | No Supabase migrations |
| E2E tests pass | 7 | Full test coverage (10+ cases) |

**Coverage**: ✅ 8/8 deliverables (100%)

---

## 📌 Key Constraints (All Satisfied)

✅ **No new dependencies** — Use Preact 10.28.2, @preact/signals 1.3.3  
✅ **Backward compatible** — Supabase schema frozen, MESSAGE_TYPES unchanged  
✅ **Component pattern** — Follow X51LABS-151 (Settings) precedent  
✅ **Error handling** — Vietnamese user-friendly messages  
✅ **Theme support** — Dark/light via CSS custom properties  
✅ **Build optimization** — Target <50KB increase from Settings (31.4KB base)

---

## 🚀 Implementation Sequence

### Phase 1: Foundation (Day 1)
**Task 1 (3-4h)**: portfolioState.js + portfolioApi.js
- 15+ signals defined
- 5+ API wrapper functions
- Ready for all components

### Phase 2: Components (Day 2, Parallel)
**Task 2 (3-4h)**: Display components (Table, Row, Summary)
**Task 3 (2-3h)**: Realtime polling (SSI API integration)
**Task 4 (3-4h)**: Modals (Add, Edit, Price Update)

### Phase 3: Integration (Day 3)
**Task 5 (3-4h)**: PortfolioPage container + Actions
- Orchestrates all sub-components
- Lifecycle management
- 4 action buttons (Add, Refresh, Evaluate, Tea Stock)

### Phase 4: ChatGPT (Day 4 AM)
**Task 6 (2-3h)**: ChatGPT flows
- Evaluate Portfolio modal
- Tea Stock search modal
- History integration

### Phase 5: Quality (Day 4 PM)
**Task 7 (3-4h)**: E2E tests + polish
- 10+ E2E test cases
- Theme verification
- Build optimization
- Manual QA

---

## 📊 Baseline Definition of Done (All Tasks)

✅ Code reviewed per repo policy  
✅ Tests added/updated and passing  
✅ No secrets/PII introduced  
✅ Backward compatible  
✅ Docs updated (JSDoc comments)  
✅ Clear verification steps  
✅ Minimal change principle  
✅ Component pattern matches X51LABS-151  
✅ Signal usage follows portfolioState.js design  
✅ Error handling includes Vietnamese messages  
✅ Theme support tested  
✅ Build passes (`npm run build`)

---

## 🎓 References & Evidence

**Design Document**: `/docs/PORTFOLIO_PAGE_MIGRATION.md` (7.5K, 12 sections)  
**Ticket Plan**: `/docs/JIRA_TICKET_X51LABS-152.md` (4K, paste-ready)  
**Breakdown Plan**: `/docs/BREAKDOWN_X51LABS-152.md` (11.5K, full decomposition)

**Code Evidence**:
- Vanilla portfolio.js: 1879 lines (implementation reference)
- portfolioPL.js: 216 lines (P&L calculations to copy)
- portfolio handler: 500 lines (CRUD already works)
- Settings pattern: X51LABS-151 (Preact migration template)

**Jira Evidence**:
- Project X51LABS confirmed (10000)
- No duplicate "Portfolio Preact" ticket found
- Pattern established (X51LABS-150 Signals, X51LABS-151 Settings)

---

## 🎯 Next Steps

### For Developer(s):
1. ✅ Review all 7 tasks in Jira (read descriptions)
2. ✅ Verify dependencies (Task 1 must be done first)
3. ✅ Start with Task 1 (Setup foundation)
4. ✅ Once Task 1 complete, parallelize Tasks 2, 3, 4
5. ✅ Continue sequential: 5 → 6 → 7

### For Project Manager:
1. ✅ Assign tasks to engineer(s)
2. ✅ Monitor Task 1 completion (blocker for others)
3. ✅ Verify E2E tests in Task 7 all pass before merge
4. ✅ Check build size (target <50KB increase)

### For QA:
1. ✅ Review E2E test plan in Task 7 (10+ test cases)
2. ✅ Manual QA checklist:
   - Dark/light theme toggle
   - CASH special rendering (blue + bold)
   - Portfolio CRUD flows
   - ChatGPT evaluation + Tea Stock
   - Error handling (network, validation, auth)
   - Empty state
   - Responsive design

---

## 📈 Metrics

**7 Tasks** × 2-4 hours = **20-28 hours total**  
**Estimate**: 3-4 days sequential, ~1 week if needed  
**Parallelizable**: 3 tasks (Task 2, 3, 4) can run in parallel  
**Accelerated Timeline**: 1 engineer: 4 days sequential, 2-3 engineers: ~2 days parallel

---

## ✨ Quality Assurance

**Baseline DoD**: 12-point checklist (applies to all 7 tasks)  
**E2E Coverage**: 10+ test cases (Task 7)  
**Manual QA**: Dark/light theme, CASH special case, responsive, errors  
**Build**: `npm run build` must succeed, <50KB increase  
**Code Review**: Per repo policy (linting, JSDoc, no secrets)

---

## 🔄 References to Previous Work

**X51LABS-150**: Signals foundation (prerequisite)  
**X51LABS-151**: Settings page Preact migration (pattern reference)  
**X51LABS-145**: Portfolio skeleton (feature reference)  

**Pattern Files to Use**:
- `src/ui-preact/state/settingsState.js` — Signal pattern
- `src/ui-preact/api/authApi.js` — API wrapper pattern
- `src/ui-preact/settings/SettingsPage.jsx` — Container pattern
- `src/ui-preact/components/ConfirmationDialog.jsx` — Modal pattern

---

## 🎉 Completion Status

✅ **Step 0**: MCP + Spec intake — Design doc reviewed  
✅ **Step 1**: Restate big task — Done (8 deliverables)  
✅ **Step 2**: Impact map — Done (files, modules, dependencies)  
✅ **Step 3**: Break into tasks — Done (7 tasks, 2-4h each)  
✅ **Step 4**: Coverage matrix — Done (100% deliverable coverage)  
✅ **Step 5**: Ticket template — Done (all 7 tasks formatted)  
✅ **Step 6**: Baseline DoD — Done (12-point shared checklist)  
✅ **Step 7**: Create Jira tickets — ✅ **DONE (7 tickets created)**  
✅ **Step 8**: Output format — Done (this document)

---

**Status**: ✅ **DECOMPOSITION COMPLETE - READY FOR DEVELOPMENT**

**Jira Tickets**: X51LABS-153, 154, 155, 156, 157, 158, 159  
**Start Date**: Can begin immediately (Task 1 has no blockers)  
**Estimated Completion**: 3-4 days (sequential), 2 days (with parallelization)

---

**Created**: January 31, 2026  
**Process**: breakdown-tasks.prompt.md (9-step enterprise decomposition)  
**Compliance**: ✅ All rules followed (2-4h sizing, coverage guarantee, MCP integration)

