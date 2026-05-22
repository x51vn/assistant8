## ADDED Requirements

### Requirement: Canonical assistant branding identity
The system SHALL use Assistant8 as the canonical product identity for extension display surfaces and release metadata.

#### Scenario: Manifest identity is canonical
- **WHEN** extension metadata is generated for runtime/package outputs
- **THEN** manifest name and short-name fields SHALL identify the product as Assistant8

#### Scenario: UI identity is canonical
- **WHEN** users open side panel, settings, and product-labeled UI surfaces
- **THEN** visible product labels SHALL display Assistant8 consistently

### Requirement: Controlled rename scope
The system SHALL apply branding rename to user-facing and packaging/documentation surfaces without changing unrelated runtime protocol or data schema identifiers.

#### Scenario: Protocol compatibility retained
- **WHEN** branding rename is applied in codebase updates
- **THEN** existing message types and persistence schema identifiers SHALL remain unchanged unless explicitly required by a separate approved change

#### Scenario: Data compatibility retained
- **WHEN** migration scripts and Supabase table/column names are evaluated for rename
- **THEN** technical identifiers not used as user-facing branding SHALL NOT be renamed in this change

### Requirement: Rename verification gates
The system SHALL include verification gates to ensure branding consistency and runtime safety before completion.

#### Scenario: Branding audit gate
- **WHEN** rename work is considered complete
- **THEN** a repository audit SHALL confirm no unintended legacy ChatGPT Assistant branding remains in targeted user-facing and release surfaces

#### Scenario: Regression gate
- **WHEN** rename changes are finalized
- **THEN** unit test checks and extension build SHALL pass before the change is marked implementation-ready
