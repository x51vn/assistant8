## ADDED Requirements

### Requirement: Execute user-defined automation workflows from market and journal triggers
The system SHALL support user-defined trigger-condition-action workflows for trading assistance.

Supported v1 trigger examples SHALL include:
- market regime transitions
- target/review readiness conditions
- guardrail or checklist state changes

Supported v1 actions SHALL be sandboxed to safe operations (notify, suggest review, queue prompt/task).

#### Scenario: Trigger workflow on regime downgrade
- **WHEN** market regime changes from ON to OFF for a tracked context
- **THEN** matching active workflows are evaluated
- **THEN** configured safe actions are executed once per dedup window

#### Scenario: Suggest close-trade review when exit readiness met
- **WHEN** symbol reaches target and exit checklist conditions are satisfied
- **THEN** system generates a close-trade suggestion action
- **THEN** action is logged with workflow ID and execution timestamp

### Requirement: Provide automation execution audit trail
The system MUST store workflow execution logs including trigger input, evaluation result, action outcome, and dedup metadata.

#### Scenario: Retrieve execution history
- **WHEN** user requests automation history
- **THEN** system returns execution records scoped to the authenticated user
- **THEN** each record includes status, reason, and references to workflow/action IDs
