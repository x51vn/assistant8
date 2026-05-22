## ADDED Requirements

### Requirement: Create trade journal entry
The system SHALL allow authenticated users to create a trade journal entry capturing a snapshot of their investment decision at the time of entry.

A journal entry SHALL include: `symbol`, `setup`, `thesis_snapshot`, `market_regime_snapshot`, `market_score_snapshot`, `planned_entry`, `planned_target`, `planned_stoploss`, `planned_qty`, `risk_per_trade_pct`, `account_size_snapshot`, `checklist`, and optional `watchlist_id`.

Initial `status` SHALL be `planned` when `actual_entry` is not provided, or `open` when `actual_entry` is provided at creation.

#### Scenario: Create entry with watchlist pre-fill
- **WHEN** user creates a journal entry with `watchlist_id` provided
- **THEN** handler persists all fields including the thesis/regime/score snapshot values
- **THEN** `watchlist_id` is stored as a nullable link (not required to be valid long-term)

#### Scenario: Create entry without watchlist link
- **WHEN** user creates a journal entry without `watchlist_id`
- **THEN** handler persists entry with `watchlist_id = null`
- **THEN** entry is valid and fully functional without the watchlist link

#### Scenario: Initial status auto-set
- **WHEN** user creates entry with `actual_entry` provided
- **THEN** status is set to `open`
- **WHEN** user creates entry without `actual_entry`
- **THEN** status is set to `planned`

---

### Requirement: Read journal entries
The system SHALL allow authenticated users to fetch their journal entries with optional filtering.

The system SHALL support filtering by: `status`, `symbol`, `date range`.

The system SHALL return entries ordered by `created_at DESC` by default.

#### Scenario: Fetch all entries
- **WHEN** user requests all journal entries
- **THEN** handler returns all entries belonging to the authenticated user
- **THEN** entries from other users are never returned (RLS enforced)

#### Scenario: Filter by status
- **WHEN** user requests entries filtered by `status: "open"`
- **THEN** handler returns only entries with `status = "open"`

---

### Requirement: Update journal entry status machine
The system SHALL enforce a status machine with transitions: `planned → open → closed → reviewed`.

The system SHALL NOT allow skipping states (e.g., `planned → closed` directly is NOT allowed).

When transitioning to `closed`, `exit_price` and `exit_date` SHALL be required.

When transitioning to `closed`, handler SHALL compute and persist: `realized_pnl`, `pnl_pct`, `r_multiple`.

#### Scenario: Transition planned to open
- **WHEN** user updates entry with `status: "open"` and provides `actual_entry` and `entry_date`
- **THEN** handler updates status to `open` and persists actual entry fields

#### Scenario: Transition open to closed with auto-calculation
- **WHEN** user updates entry with `status: "closed"`, `exit_price`, and `exit_date`
- **THEN** handler computes `realized_pnl = (exit_price - actual_entry) × actual_qty`
- **THEN** handler computes `pnl_pct = (exit_price - actual_entry) / actual_entry`
- **THEN** handler computes `r_multiple = (exit_price - actual_entry) / (actual_entry - planned_stoploss)` when `actual_entry ≠ planned_stoploss`
- **THEN** `r_multiple` is `null` when `actual_entry = planned_stoploss` (avoid division by zero)
- **THEN** all computed fields are persisted

#### Scenario: Reject invalid status transition
- **WHEN** user tries to transition from `planned` to `closed` directly
- **THEN** handler returns an error with code `INVALID_TRANSITION`

#### Scenario: Transition closed to reviewed
- **WHEN** user updates entry with `status: "reviewed"` and provides `lessons`, `followed_plan`, `error_category`, `rating`
- **THEN** handler updates status to `reviewed` and persists review fields

---

### Requirement: Delete journal entry
The system SHALL allow users to delete their own journal entries.

Only entries with `status: "planned"` MAY be deleted without confirmation. Entries with other statuses SHALL be deletable but the UI MUST require explicit confirmation.

#### Scenario: Delete own entry
- **WHEN** user requests deletion of a journal entry they own
- **THEN** handler deletes the entry and returns `success: true`

#### Scenario: Reject deletion of another user's entry
- **WHEN** user requests deletion of an entry belonging to another user
- **THEN** Supabase RLS rejects the operation and handler returns an error
