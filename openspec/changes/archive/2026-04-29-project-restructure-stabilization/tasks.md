## 1. Runtime and Callback Alignment

- [x] 1.1 Update extension E2E tests to load the built `dist` bundle instead of stale source artifacts.
- [x] 1.2 Replace obsolete `sidepanel.html`, `popup.html`, and similar assertions with checks against the actual built entrypoints.
- [x] 1.3 Point auth, billing, and other extension callback URLs to the canonical built UI route.
- [x] 1.4 Add a guard that verifies files referenced from callback URLs and manifest entrypoints exist in the built bundle.

## 2. Product Scope Decisions

- [x] 2.1 Decide the final ownership path for English learning: restore to navigation, merge into Writing, or remove end-to-end.
- [x] 2.2 Implement the chosen English learning path consistently across UI navigation, message types, handlers, and tests.
- [x] 2.3 Confirm legacy portfolio modals are no longer needed, then remove or fully replace them and rename stale references.

## 3. Evidence-Driven Cleanup

- [x] 3.1 Move or delete the excluded Vitest file currently living under `src`.
- [x] 3.2 Remove, import, or merge CSS files under `src/ui-preact/styles` based on verified runtime usage.
- [x] 3.3 Remove confirmed unused dependencies and add any missing direct test dependencies needed by the current helpers.
- [x] 3.4 Reduce architecture ambiguity where the research found duplicate registration or source-of-truth patterns that directly affect the touched surfaces.

## 4. Validation

- [x] 4.1 Run focused tests for callback routing and any restored or removed feature surfaces.
- [x] 4.2 Run the relevant unit suite for touched modules.
- [x] 4.3 Run `npm run build` to confirm the unified MV3 bundle still builds cleanly.
- [x] 4.4 Run `npx openspec validate project-restructure-stabilization --strict --no-interactive`.