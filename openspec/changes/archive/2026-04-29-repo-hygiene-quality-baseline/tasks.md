## 1. Repository Hygiene and Secret Cleanup

- [x] 1.1 Inventory tracked forbidden files with `git ls-files` and classify generated artifacts, local browser profiles, and sensitive signing material.
- [x] 1.2 Remove `dist.crx`, `dist.pem`, and tracked `test-user-data-*` files from the Git index while preserving local ignored copies where practical.
- [x] 1.3 Update `.gitignore` to cover Playwright browser profile folders, E2E reports, generated extension packages, and any newly identified local-state outputs.
- [x] 1.4 Add a repository hygiene check that fails when forbidden file patterns are tracked.
- [x] 1.5 Document the `dist.pem` exposure response, including when extension key rotation is required and what cannot be fixed by `.gitignore` alone.

## 2. Restore Local Verification Baseline

- [x] 2.1 Fix the Supabase auth unit test Chrome mock so importing `supabaseAuth.js` has `chrome.runtime.getURL`.
- [x] 2.2 Update the navigation config test to assert the intended primary navigation behavior after adding `journal`.
- [x] 2.3 Run the focused failing tests and confirm both failures are fixed.
- [x] 2.4 Run the full unit suite with `npm run test:unit -- --run` and capture any remaining failures as tasks or fixes.
- [x] 2.5 Run `npm run build` and `npx openspec validate --all` after cleanup to confirm baseline checks still pass.

## 3. CI and Smoke Verification

- [x] 3.1 Add package scripts for non-watch unit tests, OpenSpec validation, repository hygiene check, and a narrow extension smoke test if missing.
- [x] 3.2 Add a GitHub Actions workflow that installs dependencies and runs repository hygiene, build, unit tests, OpenSpec validation, and extension smoke checks.
- [x] 3.3 Ensure the extension smoke test builds first, loads `dist`, and verifies manifest entrypoints and side panel output files.
- [x] 3.4 Document the local and CI verification commands in the release or contributor documentation.

## 4. UI Runtime Gateway Migration

- [x] 4.1 Inventory direct `chrome.runtime.sendMessage` calls in `src/ui-preact` and classify each as request-response, broadcast listener, or allowed low-level exception.
- [x] 4.2 Migrate UI API wrappers for portfolio, watchlist, history, assets, commodity, writing, auth, billing/settings submodules, and market data to `runtimeGateway` where they are request-response calls.
- [x] 4.3 Keep response shapes backward compatible while migrating each API wrapper.
- [x] 4.4 Add or update tests for migrated API wrappers to verify standard envelopes and error handling.
- [x] 4.5 Add an architecture guard that rejects direct UI request-response `chrome.runtime.sendMessage` calls outside an explicit allowlist.

## 5. Handler, Error Code, and Contract Standardization

- [x] 5.1 Add missing `MESSAGE_TYPES` constants for active API key, price alert, multi-portfolio, and legacy watchlist enrich aliases that still use raw strings.
- [x] 5.2 Migrate raw `registerHandler('...')` calls and raw response type strings in the reviewed handlers to `MESSAGE_TYPES` constants.
- [x] 5.3 Migrate reviewed raw error-code strings to canonical `ERROR_CODES` constants or documented compatibility aliases.
- [x] 5.4 Move active `ERROR_CODES` imports in router/provider/platform paths from `types.js` to `shared/errorCodes.js` where behavior is equivalent.
- [x] 5.5 Extend message contract registry coverage for migrated auth/settings/billing/journal or other migrated domains, using warn-only where compatibility still requires it.
- [x] 5.6 Add architecture tests that reject raw handler registration strings and legacy error-code imports outside documented allowlists.

## 6. Release Documentation Readiness

- [x] 6.1 Update Chrome Web Store documentation so icon paths, host permissions, side panel entrypoint, and screenshots match the current manifest and assets.
- [x] 6.2 Update project overview and Confluence docs to remove stale feature references and describe the current English/Writing path accurately.
- [x] 6.3 Add a release checklist that includes repository hygiene, secret exposure review, build, unit tests, OpenSpec validation, and extension smoke checks.
- [x] 6.4 Update `docs/CHANGELOG.md` with the quality-baseline cleanup and verification expectations.

## 7. Final Validation

- [x] 7.1 Run repository hygiene check and confirm no forbidden tracked files remain.
- [x] 7.2 Run `npm run build`.
- [x] 7.3 Run `npm run test:unit -- --run`.
- [x] 7.4 Run `npx openspec validate --all`.
- [x] 7.5 Run the extension smoke check or document the blocker if the environment cannot launch Chromium.
- [x] 7.6 Review `git status --short` to confirm only intentional source, docs, OpenSpec, and index-removal changes are present.
