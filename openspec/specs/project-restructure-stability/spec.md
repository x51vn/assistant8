## ADDED Requirements

### Requirement: Extension runtime and callback targets SHALL match built entrypoints
The system SHALL ensure that extension runtime references, external callback URLs, and automated coverage target only HTML entrypoints that are emitted by the current build.

#### Scenario: E2E loads the built extension bundle
- **WHEN** automated browser tests load the extension for end-to-end validation
- **THEN** they load the built extension bundle rather than stale source-only artifacts
- **AND** the asserted side panel and related entrypoints correspond to files emitted by the current build

#### Scenario: Auth or billing flow returns to the extension
- **WHEN** auth, password reset, email confirmation, checkout, or portal flows generate a return URL into the extension
- **THEN** the URL targets the canonical built extension route
- **AND** the target file exists in the built bundle

### Requirement: Reachable product surfaces SHALL have one consistent ownership path
The system SHALL not keep feature surfaces half-connected between navigation, handlers, message contracts, and UI pages.

#### Scenario: Feature page is retained
- **WHEN** a feature such as English learning remains part of the product surface
- **THEN** it is reachable from the active navigation or other intentional entrypoint
- **AND** its supporting handlers, messages, and UI modules remain wired consistently

#### Scenario: Feature path is retired
- **WHEN** a superseded or orphaned feature path is intentionally removed
- **THEN** obsolete navigation entries, handlers, messages, and UI components for that path are removed or retired together
- **AND** the runtime no longer references the retired path

### Requirement: Superseded assets and dependencies SHALL not remain ambiguous
The system SHALL remove or intentionally wire high-confidence dead code, assets, and dependencies identified by direct repository evidence.

#### Scenario: Legacy modal flow has been replaced
- **WHEN** a newer production component replaces an older modal or page flow
- **THEN** the superseded component and stale references are removed or explicitly retained with a documented runtime purpose

#### Scenario: Unused CSS, tests, or package dependencies are identified
- **WHEN** direct import, build, and test evidence shows a CSS file, in-source test, or dependency is not part of the active runtime or test path
- **THEN** it is removed, relocated, or wired into the active path intentionally
- **AND** the resulting build and test configuration continue to pass

### Requirement: Stabilization changes SHALL be validated against the real bundle
The system SHALL validate restructure cleanup against the real extension bundle and the repository's OpenSpec workflow.

#### Scenario: Stabilization change is prepared for merge
- **WHEN** the restructure cleanup is ready for review
- **THEN** the maintainers run the focused tests for touched routing and feature surfaces
- **AND** they run the relevant unit coverage and a production build
- **AND** `openspec validate project-restructure-stabilization --strict --no-interactive` passes