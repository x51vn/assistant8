## ADDED Requirements

### Requirement: Local verification baseline is green
The project SHALL have a documented local verification baseline that includes build, unit tests, OpenSpec validation, and an extension smoke check.

#### Scenario: Developer verifies release readiness locally
- **WHEN** the documented verification commands are run on a clean checkout with dependencies installed
- **THEN** build, unit tests, OpenSpec validation, and the smoke check MUST pass before the branch is considered release-ready

### Requirement: Current unit failures are corrected
The project SHALL keep navigation and Supabase auth handler tests aligned with current runtime behavior.

#### Scenario: Supabase auth handler test imports the handler
- **WHEN** the unit test imports `supabaseAuth.js`
- **THEN** the Chrome runtime mock MUST provide the APIs used during module initialization, including `runtime.getURL`

#### Scenario: Primary navigation count changes intentionally
- **WHEN** a primary navigation item is added or removed
- **THEN** the navigation test MUST assert the intended behavior instead of a stale hard-coded count

### Requirement: CI enforces the baseline
The repository SHALL include a CI workflow that runs the agreed quality gates on pull requests or pushes.

#### Scenario: Pull request updates source or tests
- **WHEN** CI runs for the branch
- **THEN** it MUST execute install, build, unit tests, OpenSpec validation, and the extension smoke check

### Requirement: Smoke checks use built extension artifacts
Extension smoke tests SHALL load and validate the built `dist` bundle instead of stale source artifacts.

#### Scenario: Extension smoke test starts
- **WHEN** the smoke test launches Chromium with the extension
- **THEN** it MUST load `dist`, validate manifest entrypoints, and verify the side panel entrypoint exists
