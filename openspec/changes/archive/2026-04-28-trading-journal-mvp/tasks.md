## 1. Database Migration

- [x] 1.1 Create `023_create_trade_journal_tables.sql` migration: `trade_journal` table with all fields (symbol, snapshot fields, plan fields, actual fields, checklist JSONB, status, post-trade fields, review fields, r_multiple, account_size_snapshot)
- [x] 1.2 Add `CONSTRAINT valid_status CHECK (status IN ('planned', 'open', 'closed', 'reviewed'))` and `CONSTRAINT valid_rating CHECK (rating BETWEEN 1 AND 5)` to migration
- [x] 1.3 Create `checklist_templates` table in same migration: `rule_key`, `label`, `is_active`, `order_num`, `UNIQUE(user_id, rule_key)`
- [x] 1.4 Add RLS policies on both tables: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- [x] 1.5 Add indexes: `(user_id, status)`, `(user_id, symbol)`, `(user_id, created_at DESC)` on `trade_journal`; `(user_id, is_active, order_num)` on `checklist_templates`

## 2. Message Schema

- [x] 2.1 Add to `src/shared/messageSchema.js` — request types: `JOURNAL_CREATE`, `JOURNAL_GET_ALL`, `JOURNAL_UPDATE`, `JOURNAL_DELETE`, `JOURNAL_GET_PREFILL`, `JOURNAL_GET_METRICS`, `JOURNAL_GET_SUMMARY`
- [x] 2.2 Add response types: `JOURNAL_CREATED`, `JOURNAL_LIST`, `JOURNAL_UPDATED`, `JOURNAL_DELETED`, `JOURNAL_PREFILL`, `JOURNAL_METRICS`, `JOURNAL_SUMMARY`
- [x] 2.3 Add checklist template types: `CHECKLIST_TEMPLATES_GET`, `CHECKLIST_TEMPLATE_CREATE`, `CHECKLIST_TEMPLATE_UPDATE`, `CHECKLIST_TEMPLATE_DELETE`, `CHECKLIST_TEMPLATES_DATA`

## 3. Background Handler — Journal CRUD

- [x] 3.1 Create `src/background/handlers/journal.js` — register handlers for `JOURNAL_GET_ALL` (with optional filters: `status`, `symbol`) using `requireAuth` + `supabaseWithRetry`
- [x] 3.2 Implement `JOURNAL_CREATE` handler: validate required fields (`symbol`), set initial status (`planned` or `open`), insert to `trade_journal`, return `createResponse` with `JOURNAL_CREATED`
- [x] 3.3 Implement `JOURNAL_UPDATE` handler: enforce status machine transitions (`planned→open→closed→reviewed`); return `INVALID_TRANSITION` error on invalid transition; compute `realized_pnl`, `pnl_pct`, `r_multiple` when transitioning to `closed`
- [x] 3.4 Handle R-multiple edge case: when `actual_entry === planned_stoploss`, set `r_multiple = null`
- [x] 3.5 Implement `JOURNAL_DELETE` handler: delete entry by id with user_id RLS enforcement

## 4. Background Handler — Prefill & Metrics

- [x] 4.1 Implement `JOURNAL_GET_PREFILL` handler: accept `{ watchlist_id?, symbol }`, query watchlist by id if provided, query `market_assessment` for latest by symbol (`ORDER BY created_at DESC LIMIT 1`), query active checklist templates, return merged `JOURNAL_PREFILL` response
- [x] 4.2 Handle partial prefill: when no market_assessment exists for symbol, return `regimePrefill: null` (no error)
- [x] 4.3 Implement `JOURNAL_GET_METRICS` handler: query all `closed`/`reviewed` entries for user, compute `totalTrades`, `winCount`, `lossCount`, `winRate`, `avgRMultiple` (exclude null r_multiple), `ruleAdherenceRate` (exclude empty checklist), `topErrors` (top 3 error_category by count), `periodTrades` (last 30 days)
- [x] 4.4 Implement `JOURNAL_GET_SUMMARY` handler: return `openCount`, `plannedCount`, `recentWinRate` (last 30 days), `avgRMultiple` (last 30 days) for Dashboard widget

## 5. Background Handler — Checklist Templates

- [x] 5.1 Implement `CHECKLIST_TEMPLATES_GET` handler: fetch user's templates; if no templates exist, return the 6 default rules with `is_default: true` flag (do NOT insert defaults into DB)
- [x] 5.2 Implement `CHECKLIST_TEMPLATE_CREATE` handler: insert new rule, handle unique constraint violation → return `CONFLICT` error
- [x] 5.3 Implement `CHECKLIST_TEMPLATE_UPDATE` handler: update `label`, `is_active`, or `order_num`
- [x] 5.4 Implement `CHECKLIST_TEMPLATE_DELETE` handler: delete template rule by id

## 6. Import Handlers in Background Index

- [x] 6.1 Import `journal.js` in `src/background/index.js` (side-effect import to register handlers)

## 7. UI API Layer

- [x] 7.1 Create `src/ui-preact/api/journalApi.js` with functions: `fetchJournalEntries(filters?)`, `createJournalEntry(data)`, `updateJournalEntry(id, updates)`, `deleteJournalEntry(id)`, `getJournalPrefill(symbol, watchlistId?)`, `getJournalMetrics()`, `getJournalSummary()`
- [x] 7.2 Create `src/ui-preact/api/checklistApi.js` with functions: `fetchChecklistTemplates()`, `createChecklistRule(data)`, `updateChecklistRule(id, updates)`, `deleteChecklistRule(id)`

## 8. UI State

- [x] 8.1 Create `src/ui-preact/state/journalState.js` with Preact signals: `journalEntries`, `journalLoading`, `journalError`, `journalMetrics`, `selectedEntry`, `isNewEntryModalOpen`, `isCloseEntryModalOpen`, `isReviewModalOpen`, `prefillData`
- [x] 8.2 Create `src/ui-preact/state/checklistState.js` with signals: `checklistTemplates`, `checklistLoading`

## 9. JournalPage — Entry List View

- [x] 9.1 Create `src/ui-preact/pages/JournalPage.jsx` with auth check, entry list table (symbol, setup, status badge, planned_entry, exit_price, pnl_pct, r_multiple, entry_date), empty state, loading state
- [x] 9.2 Add status badge colors: `planned` = grey, `open` = blue, `closed` = green/red by pnl, `reviewed` = purple
- [x] 9.3 Add action buttons per row: "Open Entry" (planned→open), "Close Trade" (open→closed), "Write Review" (closed→reviewed), "Delete" (planned only without confirmation; others with confirmation modal)
- [x] 9.4 Add metrics summary bar at top of JournalPage: win rate, avg R, rule adherence %, total trades

## 10. Journal Modals

- [x] 10.1 Create `NewEntryModal.jsx`: form with all plan fields; renders checklist from `prefillData.checklistTemplate` as checkboxes; `thesis_snapshot` / `market_regime_snapshot` clearly labelled as snapshot; pre-fills from `prefillData` when available
- [x] 10.2 Create `CloseTradeModal.jsx`: form for `exit_price`, `exit_date`, `followed_plan` checkbox; shows computed preview of `realized_pnl` and `r_multiple` before save
- [x] 10.3 Create `ReviewModal.jsx`: form for `lessons`, `error_category` dropdown (common categories), `rating` 1–5 stars
- [x] 10.4 Create `ChecklistSettingsModal.jsx` (accessible from JournalPage header): list of template rules with toggle `is_active`, reorder, add custom rule, delete rule

## 11. Watchlist Integration

- [x] 11.1 Add "Journal Entry" icon button to each row/card in `WatchlistTable.jsx` (or `WatchlistCard.jsx`)
- [x] 11.2 On click: call `getJournalPrefill(symbol, watchlistId)`, navigate to `journal` page, open `NewEntryModal` with prefill data

## 12. Navigation & Routing

- [x] 12.1 Add `{ id: 'journal', label: 'Journal', icon: 'fas fa-book', primary: false, order: 5.5 }` to `src/ui-preact/config/navigationConfig.js`
- [x] 12.2 Add `case 'journal': return <JournalPage />;` to `MainApp.jsx` renderPage switch

## 13. Dashboard Integration

- [x] 13.1 Add journal summary card to `DashboardPage.jsx`: call `getJournalSummary()`, display `openCount`, `plannedCount`, `recentWinRate`, with link to Journal page

## 14. Tests

- [x] 14.1 Unit test: R-multiple calculation (normal case, stoploss = entry edge case, negative R)
- [x] 14.2 Unit test: Status machine transition validation (valid transitions, invalid transition rejection)
- [x] 14.3 Unit test: Metrics computation (win rate, avg R excludes nulls, rule adherence excludes empty checklists, topErrors top-3)
- [x] 14.4 Unit test: Prefill handler returns `regimePrefill: null` when no market assessment found
- [x] 14.5 Unit test: Checklist templates GET returns defaults when table is empty
