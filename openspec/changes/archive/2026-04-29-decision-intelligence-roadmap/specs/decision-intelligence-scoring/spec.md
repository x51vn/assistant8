## ADDED Requirements

### Requirement: Compute decision intelligence score before trade confirmation
The system SHALL compute a deterministic decision score for each pre-trade evaluation using weighted rule checks from checklist compliance, market regime state, and user-specific historical mistake patterns.

The response SHALL include `decisionScore` (0-100), `grade`, `ruleBreakdown[]`, `blockingReasons[]`, and `advice[]`.

#### Scenario: Compute score with full input context
- **WHEN** user requests decision evaluation with symbol, plan fields, checklist, and latest market assessment
- **THEN** system returns `decisionScore` with a complete per-rule breakdown
- **THEN** each rule item includes `ruleKey`, `weight`, `result`, and `explanation`

#### Scenario: Penalize repeated mistakes from journal history
- **WHEN** user has repeated `error_category` patterns in recent reviewed trades
- **THEN** scoring engine applies configured penalties for matching patterns
- **THEN** response includes explanation linking penalties to repeated behavior patterns

### Requirement: Support explainable and auditable scoring output
The system MUST persist a score snapshot for each evaluated entry candidate so that users can review why a decision was accepted, warned, or blocked.

Snapshot SHALL include input fingerprint, score result, versioned scoring policy ID, and evaluation timestamp.

#### Scenario: Persist score snapshot
- **WHEN** score evaluation is completed
- **THEN** system stores a snapshot record scoped to the authenticated user
- **THEN** snapshot can be retrieved later for journal review and coaching insights
