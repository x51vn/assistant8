## ADDED Requirements

### Requirement: Status badges display correctly
The system SHALL render journal entry status with colored badges: planned (grey), open (blue), closed (green/red based on P&L), reviewed (purple).

#### Scenario: Planned status shows grey badge
- **WHEN** a journal entry has `status === 'planned'`
- **THEN** the status cell SHALL display a grey badge with label "Kế hoạch"

#### Scenario: Open status shows blue badge
- **WHEN** a journal entry has `status === 'open'`
- **THEN** the status cell SHALL display a blue badge with label "Đang mở"

#### Scenario: Closed positive P&L shows green badge
- **WHEN** a journal entry has `status === 'closed'` and `pnl_pct >= 0`
- **THEN** the status cell SHALL display a green badge with label "Đã đóng"

#### Scenario: Closed negative P&L shows red badge
- **WHEN** a journal entry has `status === 'closed'` and `pnl_pct < 0`
- **THEN** the status cell SHALL display a red badge with label "Đã đóng"

#### Scenario: Reviewed status shows purple badge
- **WHEN** a journal entry has `status === 'reviewed'`
- **THEN** the status cell SHALL display a purple badge with label "Đã review"

---

### Requirement: P&L and R-multiple display with color
The system SHALL render positive P&L/R values in green and negative values in red throughout the journal table and modals.

#### Scenario: Positive P&L colored green
- **WHEN** `pnl_pct > 0` or `r_multiple > 0` is displayed
- **THEN** the value SHALL be rendered with green text color

#### Scenario: Negative P&L colored red
- **WHEN** `pnl_pct < 0` or `r_multiple < 0` is displayed
- **THEN** the value SHALL be rendered with red text color

#### Scenario: Null value shows dash
- **WHEN** `pnl_pct` or `r_multiple` is null
- **THEN** the cell SHALL display "—" with no color applied

---

### Requirement: Metrics bar renders with layout
The system SHALL display the metrics bar above the journal table with 5 equally-spaced metric cards showing label and value.

#### Scenario: Metrics bar visible with data
- **WHEN** `journalMetrics` signal has data
- **THEN** the metrics bar SHALL display all 5 metrics (totalTrades, winRate, avgR, ruleAdherence, periodTrades) in a horizontal row

#### Scenario: Metrics bar hidden without data
- **WHEN** `journalMetrics` signal is null
- **THEN** the metrics bar SHALL not render

---

### Requirement: Journal modals render with consistent styling
The system SHALL render all journal modals (NewEntry, CloseTrade, Review, ChecklistSettings) using the shared modal design system (white card, header, body, footer buttons).

#### Scenario: Modal has visible card container
- **WHEN** any journal modal is opened
- **THEN** a card with white background, border-radius, and box-shadow SHALL be visible centered over the overlay

#### Scenario: Modal close button is accessible
- **WHEN** a journal modal is open
- **THEN** a close button in the top-right of the modal header SHALL be visible and clickable

#### Scenario: Form inputs have correct styling
- **WHEN** a form input or textarea is rendered inside a journal modal
- **THEN** it SHALL have a visible border, padding, and focus ring consistent with other forms in the extension

---

### Requirement: Action buttons in journal table are compact and color-coded
The system SHALL render per-row action buttons in the journal table as small compact buttons with semantic colors.

#### Scenario: "Mở lệnh" button is small and primary-colored
- **WHEN** a planned entry row is rendered
- **THEN** a small blue "Mở lệnh" button SHALL appear in the actions cell

#### Scenario: "Đóng lệnh" button is small and warning-colored
- **WHEN** an open entry row is rendered
- **THEN** a small amber/warning "Đóng lệnh" button SHALL appear

#### Scenario: "Review" button is small and info-colored
- **WHEN** a closed entry row is rendered
- **THEN** a small teal/info "Review" button SHALL appear

---

### Requirement: P&L preview in CloseTradeModal is visually distinct
The system SHALL render the live P&L preview in CloseTradeModal in a visually distinct box with green (positive) or red (negative) background.

#### Scenario: Positive P&L preview shows green
- **WHEN** computed P&L is positive in CloseTradeModal
- **THEN** the preview box SHALL have a green-tinted background and green text

#### Scenario: Negative P&L preview shows red
- **WHEN** computed P&L is negative in CloseTradeModal
- **THEN** the preview box SHALL have a red-tinted background and red text

---

### Requirement: Star rating in ReviewModal is interactive
The system SHALL render 5 clickable star buttons in ReviewModal that visually distinguish filled vs unfilled states.

#### Scenario: Stars display filled state
- **WHEN** user has selected N stars (rating = N)
- **THEN** stars 1 through N SHALL display in golden/filled style and stars N+1 through 5 SHALL display in grey/unfilled style

#### Scenario: Clicking same star deselects
- **WHEN** user clicks the currently selected star
- **THEN** rating SHALL reset to 0 and all stars SHALL display unfilled

---

### Requirement: Checklist settings modal lists rules clearly
The system SHALL render the checklist settings modal with a structured list of rules showing label, key, and action buttons.

#### Scenario: Rules list is visible
- **WHEN** ChecklistSettingsModal is open with templates loaded
- **THEN** each rule SHALL display its order number, label, key in brackets, and toggle/delete buttons

#### Scenario: Default rules show read-only state
- **WHEN** `isDefault` is true (no user-defined templates)
- **THEN** toggle and delete buttons SHALL be hidden and an info banner SHALL be visible

---

### Requirement: Market snapshot prefill banner is prominent
The system SHALL render the market snapshot banner in NewEntryModal in a visually distinct box (e.g., info-tinted background) when regime data is available.

#### Scenario: Prefill banner renders when regime available
- **WHEN** `prefill.regimePrefill` is not null
- **THEN** a banner SHALL display the market regime state, score, and action in a distinct colored box above the form fields
