## ADDED Requirements

### Requirement: Chrome Web Store documentation matches manifest
Chrome Web Store documentation SHALL match the current manifest permissions, host permissions, icons, content scripts, and side panel entrypoint.

#### Scenario: Manifest asset paths change
- **WHEN** the manifest references SVG icons under `src/extension/images`
- **THEN** the Chrome Web Store documentation MUST NOT claim PNG icons under a different path

#### Scenario: Host permissions are updated
- **WHEN** host permissions are added or removed from the manifest
- **THEN** the documentation MUST update the permission justification list in the same release cycle

### Requirement: Product documentation matches reachable features
Project overview and release documentation SHALL describe features that are reachable in the current UI and background registrations.

#### Scenario: Feature is removed or merged
- **WHEN** a feature such as English learning is removed from navigation or merged into Writing
- **THEN** overview and release documents MUST describe the actual reachable path

### Requirement: Release checklist includes security and verification gates
The release checklist SHALL include repository hygiene, secret exposure review, build, unit tests, OpenSpec validation, and extension smoke checks.

#### Scenario: Release candidate is prepared
- **WHEN** a release candidate is prepared for packaging or Chrome Web Store submission
- **THEN** the checklist MUST require clean hygiene guard output and passing verification commands before packaging
