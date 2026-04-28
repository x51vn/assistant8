# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added — Repo Hygiene & Quality Baseline
- Added repository hygiene guard for tracked generated artifacts, local browser profiles, extension packages, PEM files, and env files.
- Added CI quality workflow covering hygiene, build, unit tests, OpenSpec validation, and extension smoke checks.
- Added extension smoke verification for manifest entrypoints, side panel output, content scripts, icons, and web-accessible resources.
- Added UI runtime gateway inventory and architecture guards for direct runtime messaging.
- Added release checklist and security incident response docs for exposed signing material.

### Changed — Messaging & Contracts
- Migrated UI API/settings/assets request-response calls to `runtimeGateway`.
- Standardized reviewed handler registrations and response/error codes on `MESSAGE_TYPES` and shared `ERROR_CODES`.
- Extended warn-only message contract coverage for migrated auth, settings, billing, and journal domains.
- Updated Chrome Web Store and Confluence overview docs to match current manifest, side panel, Writing, Journal, and provider routing paths.

### Fixed — Verification Baseline
- Fixed Supabase auth unit-test Chrome mock for `chrome.runtime.getURL`.
- Updated navigation config test for the current six primary tabs including `journal`.
- Ensured `privacy-policy.html` and `terms-of-service.html` are copied into `dist`.

### Removed — Firebase Cleanup (XST-689..693)
- Deleted Firebase config files from repo root: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
- Removed legacy Firebase auth test artifact: `test-firebase-auth.html` (root + tests/)
- Scrubbed E2E tests of Firebase-specific variable names and assertions (`firebaseSyncCheckbox` → `syncCheckbox`, removed `Firebase` string checks)
- Confirmed `src/ui/sync.js` Firestore code paths already removed; module replaced by local-notes stub
- **Verified**: `grep -r "firebase|Firebase" src/ tests/` → **0 matches**
- All business data managed exclusively via **Supabase** (no Firebase/Firestore dependency remaining)

## [1.0.0] - 2026-02-05
- Initial release.
