## Context

The review found a release-readiness problem rather than a single isolated bug. The project builds and OpenSpec validation currently pass, but the unit suite is red, generated/local files are tracked, a signing key is tracked, UI messaging is partially migrated, handler/error-code conventions are split, and release documentation does not fully match the current manifest and code.

The codebase already has several foundations to build on:

- `.gitignore` ignores `*.crx`, `*.pem`, `dist/`, and test results, but previously tracked files remain in Git.
- `runtimeGateway.js` exists and is already used by some UI modules.
- `MessageContractRegistry` and router ingress validation exist for pilot domains.
- Handler registries are split by broad domain, but some handlers still use raw message strings.
- E2E helpers now load `dist`, and OpenSpec changes already capture several completed architecture improvements.

## Goals / Non-Goals

**Goals:**

- Make the repository clean enough for release work by removing tracked generated files, local browser profile state, and signing material.
- Restore a green local verification baseline for build, unit tests, OpenSpec validation, and extension smoke checks.
- Add CI so quality signals are repeatable outside a local machine.
- Finish the next migration slice for messaging and error-code consistency.
- Bring release and Chrome Web Store documentation back in line with the actual extension.

**Non-Goals:**

- Rewrite the whole extension architecture.
- Implement new product features such as new Journal workflows, new billing plans, or new stock research behavior.
- Rewrite Git history automatically. If the signing key has been pushed, history purge and key rotation are manual security operations.
- Remove all logging or all direct Chrome API usage. Runtime broadcasts, content script communication, and platform adapters can keep direct Chrome calls when explicitly allowlisted.

## Decisions

### 1. Treat tracked signing material as an incident, not just cleanup

`dist.pem` is an extension private key. Removing it from the index prevents future exposure, but it does not undo prior exposure if the file was pushed. The implementation will remove tracked key/build artifacts, add recurrence checks, and document key rotation.

Alternative considered: only update `.gitignore`. This is insufficient because ignored files already tracked by Git remain tracked.

### 2. Fix current tests before adding broader gates

The current unit failures are concrete and small: a missing Chrome test mock API and a stale navigation expectation. These should be fixed before using CI as an enforcement mechanism, otherwise CI would start red and provide little signal.

Alternative considered: add CI first and fix tests later. That creates a known-broken mainline gate and normalizes failures.

### 3. Use `runtimeGateway` as the canonical UI request path

UI modules that initiate request-response calls to the background should use `sendRuntimeMessage` so envelopes, domain versioning, and error handling stay consistent. Direct `chrome.runtime.sendMessage` remains allowed for explicit broadcasts/listeners, platform-level adapters, content scripts, and low-level provider integrations.

Alternative considered: keep per-module message construction. That preserves current behavior but makes schema changes and contract validation expensive.

### 4. Consolidate constants without a big-bang rewrite

Raw handler registrations and split error-code imports should be migrated domain by domain. The first implementation slice should cover known offenders from the review: API keys, price alerts, multi-portfolio, watchlist enrich legacy responses, `messageRouter`, and provider imports.

Alternative considered: rewrite all message definitions into new domain files at once. That increases risk and overlaps with previous OpenSpec work.

### 5. Add guard tests for conventions

Once the target convention exists, add tests that reject tracked forbidden files, direct UI request calls outside allowlists, raw `registerHandler('...')` registrations outside legacy allowlists, and stale manifest/documentation references where feasible.

Alternative considered: rely on manual review. The same issues already slipped into the repo, so automation is warranted.

## Risks / Trade-offs

- [Risk] Removing tracked Playwright profile data may affect local E2E convenience. -> Mitigation: keep ignored local folders and let Playwright recreate them.
- [Risk] Removing `dist.pem` may change the extension ID for future local builds. -> Mitigation: document the impact and require a new secure key if stable ID is needed.
- [Risk] Gateway migration can break older UI flows that depend on response quirks. -> Mitigation: migrate API modules first, keep response shapes unchanged, and run focused tests per domain.
- [Risk] CI E2E smoke tests can be flaky in headless environments. -> Mitigation: start with a narrow build-artifact/manifest smoke check and keep full headed E2E manual until stable.
- [Risk] Error-code consolidation can break consumers expecting legacy strings. -> Mitigation: preserve compatibility aliases where needed and test canonical error envelopes.

## Migration Plan

1. Remove generated/local/sensitive tracked files from Git index without deleting the user's local working copies where avoidable.
2. Add ignore and guard coverage for forbidden tracked file patterns.
3. Fix the two current unit failures and verify the full unit suite.
4. Add CI with build, unit, OpenSpec validation, and a narrow extension smoke check.
5. Migrate UI API wrappers to `runtimeGateway` in small batches, then add guard tests.
6. Migrate raw handler registrations and error-code imports to shared constants, then add guard tests.
7. Update release documentation and Chrome Web Store materials to match the current manifest and assets.

Rollback is straightforward for source changes by reverting the change branch. Secret rotation cannot be rolled back; if a key was exposed, the correct recovery is to continue with the rotated key.

## Open Questions

- Has `dist.pem` ever been pushed to a remote repository or shared archive? If yes, rotate the extension key and consider history rewriting outside this code change.
- Should CI run full Playwright E2E on every PR, or only smoke E2E on PR with full E2E on release branches?
- Which direct UI `chrome.runtime.sendMessage` calls are intentional broadcasts and should be allowlisted?
