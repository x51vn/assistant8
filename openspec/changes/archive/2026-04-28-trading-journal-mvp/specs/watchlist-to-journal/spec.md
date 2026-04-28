## ADDED Requirements

### Requirement: Pre-fill journal entry from watchlist item
The system SHALL provide a pre-fill endpoint that returns watchlist data and the most recent market assessment for a given symbol, allowing the UI to auto-populate a new journal entry form.

Pre-fill data SHALL include:
- From watchlist (when `watchlist_id` provided): `symbol`, `entry`, `target`, `stoploss`, `investment_thesis`, `pprofit`, `risk`
- From market_assessment (latest by `symbol`, ordered by `created_at DESC`): `market_regime_state`, `market_regime_score`, `action`, `symbol_score`, `sector_score`, `sector_trend`
- From checklist_templates: active template rules for pre-rendering checklist

#### Scenario: Pre-fill with matching watchlist and market data
- **WHEN** user requests pre-fill with valid `watchlist_id` and the symbol has a recent market assessment
- **THEN** handler returns merged data from both watchlist and market_assessment
- **THEN** all watchlist price fields are returned as numbers

#### Scenario: Pre-fill when no market assessment exists for symbol
- **WHEN** user requests pre-fill for a symbol with no market_assessment records
- **THEN** handler returns watchlist data successfully
- **THEN** `regimePrefill` field is `null` in response
- **THEN** no error is thrown — partial pre-fill is valid

#### Scenario: Pre-fill without watchlist_id (manual entry)
- **WHEN** user requests pre-fill with only `symbol` (no watchlist_id)
- **THEN** handler looks up market_assessment by symbol only
- **THEN** `watchlistPrefill` field is `null` in response

---

### Requirement: UI provides "Create Journal Entry" action from Watchlist item
The Watchlist page SHALL display a "Journal Entry" button on each watchlist item that navigates the user to the Journal page with a pre-filled new entry form.

#### Scenario: Open journal entry form from Watchlist
- **WHEN** user clicks "Journal Entry" on a watchlist item
- **THEN** UI navigates to the Journal page
- **THEN** the "New Entry" form opens with fields pre-filled from the watchlist item and latest market assessment
- **THEN** user can review, modify, and save the pre-filled data

#### Scenario: Checklist is pre-rendered with active rules
- **WHEN** journal entry form opens (from watchlist or manually)
- **THEN** all active checklist template rules are displayed as unchecked checkboxes
- **THEN** user can check/uncheck each rule before saving

#### Scenario: Pre-fill is read-only in snapshot fields
- **WHEN** user views `thesis_snapshot`, `market_regime_snapshot`, `market_score_snapshot` in the form
- **THEN** these fields are displayed but clearly labeled as "snapshot at time of entry"
- **THEN** user MAY edit them before saving (they become the permanent record)
