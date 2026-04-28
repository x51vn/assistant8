# checklist-templates Specification

## Purpose
TBD - created by archiving change trading-journal-mvp. Update Purpose after archive.
## Requirements
### Requirement: Manage checklist rule templates
The system SHALL allow authenticated users to create, read, update, and delete checklist rule templates.

Each template rule SHALL have: `rule_key` (unique per user, snake_case), `label` (display text), `is_active` (boolean), `order_num` (integer for display ordering).

The system SHALL provide a set of default rules when a user has no templates defined.

Default rules SHALL include:
1. `regime_ok` — "Market regime phải ON"
2. `sector_ok` — "Sector trend không DOWN"
3. `entry_at_zone` — "Entry tại vùng kế hoạch"
4. `stoploss_set` — "Stoploss đã xác định"
5. `position_sized` — "Position size đã tính"
6. `thesis_written` — "Thesis đã viết rõ ràng"

#### Scenario: Fetch templates returns defaults when empty
- **WHEN** user fetches their checklist templates and has no templates stored
- **THEN** handler returns the 6 default rules with `is_default: true` flag
- **THEN** no records are inserted into `checklist_templates` table at this point

#### Scenario: Fetch templates returns user-defined templates
- **WHEN** user has existing templates in `checklist_templates`
- **THEN** handler returns only their defined templates ordered by `order_num`

#### Scenario: Create custom rule
- **WHEN** user creates a new checklist rule with valid `rule_key` and `label`
- **THEN** handler persists the rule to `checklist_templates` with `is_active: true`

#### Scenario: Reject duplicate rule_key
- **WHEN** user creates a rule with a `rule_key` that already exists for their account
- **THEN** handler returns an error with code `CONFLICT`

#### Scenario: Update rule label or active status
- **WHEN** user updates `label` or `is_active` on an existing template rule
- **THEN** handler persists the change

#### Scenario: Delete template rule
- **WHEN** user deletes a template rule
- **THEN** handler removes the rule from `checklist_templates`
- **THEN** existing journal entries that already captured the checklist are NOT affected (snapshot already saved as JSONB)

---

### Requirement: Provide checklist snapshot for new journal entry
The system SHALL return the active checklist template rules when pre-filling a new journal entry, so the UI can render the checklist with all items defaulting to unchecked.

#### Scenario: Load checklist for new entry
- **WHEN** UI requests pre-fill data for a new journal entry
- **THEN** response includes `checklistTemplate` array of active rules (`is_active: true`) ordered by `order_num`
- **THEN** each rule has `rule_key` and `label`
- **THEN** UI renders checklist with all rules unchecked by default

