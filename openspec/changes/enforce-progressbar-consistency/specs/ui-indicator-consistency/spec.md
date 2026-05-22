## ADDED Requirements

### Requirement: Operational progress uses the shared ProgressBar
The system SHALL render operation or quota completion indicators through the shared `ProgressBar` component and SHALL NOT implement raw progressbar track/fill markup elsewhere.

#### Scenario: Operational progress is displayed
- **WHEN** a UI surface displays finite or indeterminate operation progress
- **THEN** it SHALL render the shared `ProgressBar` component

#### Scenario: Raw semantic progressbar is introduced outside the shared component
- **WHEN** runtime UI source outside `ProgressBar.jsx` contains `role="progressbar"` or a `<progress>` element
- **THEN** the consistency guard SHALL fail

#### Scenario: Raw track and fill progressbar markup is introduced
- **WHEN** runtime UI source outside `ProgressBar.jsx` defines progressbar track/fill markup directly
- **THEN** the consistency guard SHALL fail

### Requirement: Watchlist long-running operations expose shared progress
The system SHALL show shared progress UI for Watchlist long-running operations where operation progress is visible to the user.

#### Scenario: Bulk add is submitting symbols
- **WHEN** the Watchlist add modal is adding multiple parsed symbols
- **THEN** it SHALL render `ProgressBar` with completed symbol count as value and parsed symbol count as max
- **AND** per-symbol chips SHALL remain available for success/error detail

#### Scenario: Batch enrichment is running with known count
- **WHEN** the Watchlist page is enriching multiple symbols and a total symbol count is known
- **THEN** it SHALL render `ProgressBar` for the batch enrichment progress

#### Scenario: Batch enrichment is running without completed count
- **WHEN** the Watchlist page is enriching symbols but only active/running state is known
- **THEN** it SHALL render `ProgressBar` in indeterminate mode

#### Scenario: Single row enrich is busy
- **WHEN** a single Watchlist row is enriching without numeric progress
- **THEN** the row MAY show a spinner icon and SHALL NOT implement a separate progressbar

### Requirement: Non-progress indicators use domain-specific names
The system SHALL name non-progress indicators by their domain semantics rather than using progressbar/progress naming.

#### Scenario: Toast dismiss timer is rendered
- **WHEN** a toast displays auto-dismiss timing
- **THEN** the runtime class names SHALL use timer terminology and SHALL NOT use `toast-progress`

#### Scenario: Onboarding steps are rendered
- **WHEN** onboarding displays step navigation
- **THEN** the runtime class names SHALL use steps or stepper terminology and SHALL NOT use `onboarding-progress`

#### Scenario: Operation status wrappers are rendered
- **WHEN** a modal wraps status text and a shared `ProgressBar`
- **THEN** wrapper class names SHALL use operation/status terminology and SHALL NOT use `research-progress` or `progress-header`

### Requirement: Data visualizations are not named as progressbars
The system SHALL keep chart and allocation visuals separate from progressbar semantics and SHALL name them as charts, columns, strips, segments, or allocations.

#### Scenario: Market regime history chart is rendered
- **WHEN** Market displays regime history
- **THEN** it SHALL use chart column naming and SHALL NOT use `mkt-regime-bar` class names

#### Scenario: Net-worth or dashboard allocation is rendered
- **WHEN** NetWorthSummary or Dashboard displays asset allocation
- **THEN** it SHALL use allocation strip/segment naming and SHALL NOT use `net-worth-bar` or generic `bar-segment` class names

#### Scenario: Asset history chart is rendered
- **WHEN** AssetHistoryChart displays historical value columns
- **THEN** it SHALL use chart column naming and SHALL NOT use chart bar class names

### Requirement: Consistency guard protects future changes
The system SHALL include automated checks that prevent new progressbar-like implementations or ambiguous progress naming outside the approved component/taxonomy.

#### Scenario: Consistency check runs
- **WHEN** the focused UI consistency test runs
- **THEN** it SHALL pass only when `ProgressBar.jsx` is the sole semantic progressbar implementation

#### Scenario: Allowed non-progress names are present
- **WHEN** navigation, search, tab, filter, metrics, or other non-indicator layout names contain `bar`
- **THEN** the consistency guard MAY allow them through an explicit allowlist

#### Scenario: Forbidden ambiguous indicator name is present
- **WHEN** runtime UI source contains a forbidden ambiguous indicator class name
- **THEN** the consistency guard SHALL fail with the file path and matched name
