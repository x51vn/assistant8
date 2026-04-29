## ADDED Requirements

### Requirement: Generated artifacts remain untracked
The repository SHALL keep generated extension builds, packaged artifacts, signing keys, test results, and local browser profile data out of version control.

#### Scenario: Forbidden generated files are present locally
- **WHEN** local files match generated or local-state patterns such as `dist/`, `*.crx`, `*.pem`, `test-results/`, or `test-user-data-*`
- **THEN** Git status MUST NOT show those files as tracked or newly staged files

#### Scenario: Playwright recreates local profile data
- **WHEN** E2E tests create browser profile folders
- **THEN** those folders MUST remain ignored and MUST NOT appear in future commits

### Requirement: Sensitive extension signing material is handled as an incident
The project SHALL remove tracked extension signing keys from the repository index and document the required rotation response when a key may have been shared.

#### Scenario: Tracked signing key is discovered
- **WHEN** a tracked `*.pem` extension signing key is found
- **THEN** the cleanup plan MUST remove it from Git tracking and record that rotation is required if it was pushed or shared

### Requirement: Repository hygiene guard prevents recurrence
The project SHALL include an automated guard that fails when forbidden generated, local-state, or sensitive file patterns are tracked.

#### Scenario: Forbidden file is tracked again
- **WHEN** the hygiene guard scans tracked files and finds a forbidden pattern
- **THEN** the guard MUST fail with the offending path category visible in the output
