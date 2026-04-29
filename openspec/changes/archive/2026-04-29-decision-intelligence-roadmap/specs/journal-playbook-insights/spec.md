## ADDED Requirements

### Requirement: Generate personal playbook insights from journal history
The system SHALL generate user-specific playbook insights from journal entries to identify winning setups, repeated mistakes, and context-performance patterns.

Insights SHALL include at minimum:
- top winning setups
- top recurring error categories
- time-window and sector/context patterns when available
- recommended behavior adjustments

#### Scenario: Generate weekly playbook summary
- **WHEN** scheduled insight generation runs for an authenticated user with sufficient journal history
- **THEN** system stores a ranked list of insights with confidence metadata
- **THEN** each insight includes a recommendation and supporting evidence summary

#### Scenario: Handle sparse history
- **WHEN** user has insufficient reviewed/closed trades to support robust pattern extraction
- **THEN** system returns a reduced insight set with explicit low-confidence flags
- **THEN** recommendations remain non-blocking and informational

### Requirement: Track playbook insight adoption feedback
The system MUST allow users to mark an insight as helpful or not helpful and SHALL record feedback for future ranking improvements.

#### Scenario: Record helpful feedback
- **WHEN** user marks an insight as helpful
- **THEN** system stores feedback linked to user and insight ID
- **THEN** future insight ranking can incorporate aggregate feedback signals
