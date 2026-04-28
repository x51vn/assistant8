## Why

The project is close to a shippable Chrome MV3 extension baseline, but current repository hygiene and verification signals are not reliable enough for release work. The latest review found tracked sensitive/generated artifacts, failing unit tests, incomplete messaging standardization, split error-code ownership, missing CI, and stale release documentation.

This change establishes a quality baseline before more product work continues, so later Journal, stock research, billing, and Chrome Web Store work can build on a clean repository and repeatable checks.

## What Changes

- Remove generated extension artifacts, local browser profile data, and signing material from version control while preserving ignored local workflows.
- Treat the tracked extension signing key as a secret incident: remove it from Git going forward, document rotation, and add checks that prevent recurrence.
- Fix the current unit test failures and make navigation/auth tests track intentional behavior.
- Add a CI quality gate for build, unit tests, OpenSpec validation, and extension smoke checks.
- Standardize UI-to-background requests through the existing runtime gateway, leaving only explicit broadcast/listener exceptions.
- Replace raw string handler registrations, response types, and error-code literals with central `MESSAGE_TYPES` and `ERROR_CODES` constants.
- Consolidate active error-code usage around the shared error-code source of truth.
- Update release and Chrome Web Store documentation to match the current manifest, assets, features, privacy behavior, and verification workflow.

## Capabilities

### New Capabilities
- `repository-hygiene`: Requirements for keeping generated artifacts, local browser profiles, and sensitive extension keys out of version control.
- `quality-gates`: Requirements for local and CI verification signals that must pass before a change is considered release-ready.
- `messaging-standardization`: Requirements for canonical UI/background message envelopes, handler registration constants, and error-code source of truth.
- `release-documentation-readiness`: Requirements for keeping Chrome Web Store and project documentation aligned with the current runtime behavior.

### Modified Capabilities
- None.

## Impact

- Affected files and directories:
  - `.gitignore`, tracked `dist.*`, tracked `test-user-data-*`, and generated Playwright profiles.
  - `tests/unit/supabaseAuth.test.js`, `tests/unit/navigationConfig.test.js`, and shared Chrome test mocks.
  - `.github/workflows/*`, `package.json`, `playwright.config.js`, and E2E smoke tests.
  - `src/ui-preact/api/*`, selected UI components/pages, and `src/ui-preact/api/runtimeGateway.js`.
  - `src/background/messageRouter.js`, selected background handlers, `src/shared/messageSchema.js`, and `src/shared/errorCodes.js`.
  - `docs/CWS_LISTING.md`, `docs/confluence/*`, `docs/CHANGELOG.md`, and release/checklist documentation.
- External systems:
  - Git history and extension signing key management require manual rotation if the tracked `dist.pem` has ever been pushed outside the local machine.
  - CI will require repository access to install dependencies and run Chrome/Playwright smoke checks.
