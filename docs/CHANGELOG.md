# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Removed — Firebase Cleanup (XST-689..693)
- Deleted Firebase config files from repo root: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
- Removed legacy Firebase auth test artifact: `test-firebase-auth.html` (root + tests/)
- Scrubbed E2E tests of Firebase-specific variable names and assertions (`firebaseSyncCheckbox` → `syncCheckbox`, removed `Firebase` string checks)
- Confirmed `src/ui/sync.js` Firestore code paths already removed; module replaced by local-notes stub
- **Verified**: `grep -r "firebase|Firebase" src/ tests/` → **0 matches**
- All business data managed exclusively via **Supabase** (no Firebase/Firestore dependency remaining)

## [1.0.0] - 2026-02-05
- Initial release.

