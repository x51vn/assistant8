## ADDED Requirements

### Requirement: Produce explainable AI research card output
The system SHALL generate research card output in a structured and explainable format rather than free-form narrative only.

Research card payload MUST include:
- `thesis`
- `confidence` (normalized score)
- `supportingEvidence[]`
- `counterEvidence[]`
- `invalidConditions[]`
- `sources[]`

#### Scenario: Return complete explainable payload
- **WHEN** user requests stock research generation
- **THEN** system returns all required explainability fields
- **THEN** each evidence item includes source reference or provenance metadata

#### Scenario: Degrade safely when evidence is limited
- **WHEN** system cannot gather sufficient supporting evidence
- **THEN** response still includes required fields with reduced confidence
- **THEN** counter-evidence and invalid conditions remain populated when available

### Requirement: Validate explainable research schema before response
The system MUST validate research card output against a defined schema and reject malformed payloads.

#### Scenario: Reject malformed explainable output
- **WHEN** generated payload is missing one or more required fields
- **THEN** system rejects the malformed payload
- **THEN** caller receives a structured error indicating schema validation failure
