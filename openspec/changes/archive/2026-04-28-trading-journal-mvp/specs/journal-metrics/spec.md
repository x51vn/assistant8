## ADDED Requirements

### Requirement: Compute journal metrics for user
The system SHALL compute and return aggregate statistics from all `closed` and `reviewed` journal entries belonging to the authenticated user.

Metrics SHALL include:
- `totalTrades` — total count of closed/reviewed entries
- `winCount` — entries where `pnl_pct > 0`
- `lossCount` — entries where `pnl_pct <= 0`
- `winRate` — `winCount / totalTrades` (null when totalTrades = 0)
- `avgRMultiple` — arithmetic mean of `r_multiple` values (excluding null r_multiple entries)
- `ruleAdherenceRate` — percentage of checklist items checked `true` across all entries with non-empty checklist snapshots
- `topErrors` — top 3 most frequent `error_category` values from reviewed entries (excludes null)
- `periodTrades` — count of trades in the last 30 days (default period)

#### Scenario: Compute metrics with sufficient data
- **WHEN** user requests journal metrics and has at least one closed/reviewed entry
- **THEN** handler returns all metric fields computed from that user's data
- **THEN** `winRate` is a decimal between 0 and 1

#### Scenario: Return empty metrics when no closed trades
- **WHEN** user has no closed or reviewed journal entries
- **THEN** handler returns `{ totalTrades: 0, winCount: 0, lossCount: 0, winRate: null, avgRMultiple: null, ruleAdherenceRate: null, topErrors: [], periodTrades: 0 }`

#### Scenario: Rule adherence excludes entries without checklist
- **WHEN** some entries have empty checklist JSONB `{}`
- **THEN** those entries are excluded from the `ruleAdherenceRate` calculation

#### Scenario: Avg R-multiple excludes null r_multiple entries
- **WHEN** some entries have `r_multiple = null` (e.g., stoploss = entry)
- **THEN** those entries are excluded from the `avgRMultiple` calculation

---

### Requirement: Journal summary card on Dashboard
The system SHALL expose a summary payload that the Dashboard can display as a compact stats card.

The summary SHALL include: `openCount` (open entries), `plannedCount` (planned entries), `recentWinRate` (last 30 days), `avgRMultiple` (last 30 days).

#### Scenario: Fetch journal summary for Dashboard
- **WHEN** Dashboard requests journal summary
- **THEN** handler returns `openCount`, `plannedCount`, `recentWinRate`, `avgRMultiple`
- **THEN** all fields are present (null when insufficient data, never missing)
