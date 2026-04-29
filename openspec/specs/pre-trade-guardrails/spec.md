## ADDED Requirements

### Requirement: Enforce pre-trade guardrails before entry confirmation
The system SHALL evaluate mandatory guardrails before allowing a trade entry to be confirmed.

Mandatory checks SHALL include:
- risk per trade threshold validation
- stoploss presence and validity
- market regime compatibility
- minimum checklist pass threshold

#### Scenario: Block entry when critical guardrail fails
- **WHEN** user attempts to confirm an entry and one or more critical checks fail
- **THEN** system returns `allowed = false` with `blockingReasons[]`
- **THEN** trade confirmation flow is prevented from finalizing

#### Scenario: Warn without blocking for non-critical checks
- **WHEN** only non-critical checks fail
- **THEN** system returns `allowed = true` with `warnings[]`
- **THEN** user can proceed after reviewing warnings

### Requirement: Preserve guardrail decision traceability
The system MUST persist guardrail evaluation results for each attempted trade confirmation.

#### Scenario: Save guardrail evaluation record
- **WHEN** a guardrail evaluation is executed
- **THEN** system stores the evaluation outcome including check-by-check results and policy version
- **THEN** record is linked to user and relevant journal context for auditability
