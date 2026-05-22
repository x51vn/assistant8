# Project Restructure Research — Redundant, Conflicted, Unused

Date: 2026-04-27  
Mode: `/opsx-explore`  
Scope: research only, no code refactor applied.

## Executive Summary

Project hiện build và unit/integration test vẫn pass, nhưng có nhiều dấu hiệu tích tụ từ các đợt migrate trước: extension entrypoint đã đổi sang `sidepanel-preact.html`, stock research v2 đã thay thế modal cũ, prompt queue đã thay thế enrichment queue, nhưng test, docs, redirect URL, CSS và một số module legacy chưa được dọn cùng lúc.

Ưu tiên refactor nên đi theo 4 lớp:

1. **Fix conflicts có khả năng phá flow thật**: E2E load sai extension path, Stripe/Auth redirect trỏ tới file không tồn tại.
2. **Quyết định product scope cho orphan features**: English page/module, legacy Tea Stock/Evaluate modals.
3. **Dọn unused/redundant có bằng chứng cao**: test file nằm trong `src`, CSS không được load, deps không được import.
4. **Chuẩn hóa architecture**: one messaging gateway, one error code source, one handler registration style, one docs source of truth.

## Baseline Evidence

Commands đã chạy:

- `npm run build` → passed.
- `npm run test:unit -- --run` → passed, `54 files`, `830 tests`.
- `npx --yes knip --reporter compact --no-progress` → reported many issues, but `unused files` có false positives lớn vì chưa cấu hình extension/Vite custom entrypoints.
- `rg`/`find`/`wc` over `src`, `tests`, `docs`, `supabase`.

Project size snapshot:

- `src`: 249 source/support files, khoảng 60,979 LOC JS/JSX/TS.
- `src/ui-preact`: 108 JS/JSX files, khoảng 24,464 LOC.
- `src/background`: 66 JS files, khoảng 21,405 LOC.
- `src/background/handlers`: 44 handler files.
- `src/ui-preact/components`: 45 component files.
- `src/ui-preact/pages`: 14 page files.
- `docs`: 47 top-level markdown files, 65 markdown files including subfolders.

## Architecture Snapshot

Current intended runtime path:

```text
Chrome MV3
  ├─ manifest.json
  │   ├─ background.service_worker = background.js
  │   ├─ side_panel.default_path = sidepanel-preact.html
  │   └─ content scripts = content.js / content-gemini.js / content-claude.js
  ├─ Vite build
  │   ├─ src/background/index.js -> dist/background.js
  │   ├─ src/content.js -> dist/content.js
  │   ├─ src/content/gemini.js -> dist/content-gemini.js
  │   ├─ src/content/claude.js -> dist/content-claude.js
  │   └─ src/ui-preact/settings/index.jsx -> dist/settings-preact.js
  └─ UI
      └─ sidepanel-preact.html -> settings-preact.js -> App -> MainApp -> pages
```

Background handler registration path:

```text
background/index.js
  └─ handlers/index.js
      └─ registerAllHandlers.js
          ├─ coreRegistry.js
          ├─ portfolioRegistry.js
          ├─ authAndProvidersRegistry.js
          └─ settingsAndProductivityRegistry.js
```

## High Priority Conflicts

### 1. E2E tests are pointed at stale extension artifacts

Evidence:

- `tests/e2e/extension-load.spec.js:18` loads `../../src/extension`.
- `src/extension/sidepanel-preact.html:19` expects generated `settings-preact.js`, which exists only after Vite build in `dist`.
- `src/extension/manifest.json:43` points side panel to `sidepanel-preact.html`.
- `tests/e2e/extension-load.spec.js:80` still navigates to `sidepanel.html`.
- `tests/e2e/extension-load.spec.js:103` still navigates to `popup.html`.
- `vite.config.js` explicitly says legacy `sidepanel.html`, `popup.html`, and legacy UI entry were removed.

Impact:

- E2E suite is not validating the real production bundle.
- Several E2E specs will fail or pass against invalid assumptions.
- CI confidence is misleading if only unit tests are green.

Recommended cleanup:

- Build before E2E and load `dist`, not `src/extension`.
- Replace every `sidepanel.html` reference with `sidepanel-preact.html`.
- Remove popup assertions unless popup is restored in manifest/build.
- Add a guard test that verifies `dist/manifest.json` referenced files actually exist.

### 2. Auth and billing redirects point to non-existent extension pages

Evidence:

- `supabase/functions/create-checkout-session/index.ts:135` redirects to `chrome-extension://<id>/index.html?checkout=success`.
- `supabase/functions/create-checkout-session/index.ts:137` redirects to `chrome-extension://<id>/index.html?checkout=cancel`.
- `supabase/functions/create-portal-session/index.ts:86` redirects to `chrome-extension://<id>/index.html`.
- `src/background/handlers/supabaseAuth.js:462` redirects reset password to `settings.html#reset-password`.
- `src/background/handlers/supabaseAuth.js:561` and `:643` redirect email confirmation to `settings.html#email-confirmed`.
- Build output contains `sidepanel-preact.html`, not `index.html` or `settings.html`.

Impact:

- Stripe Checkout success/cancel and portal return can land on missing extension pages.
- Password reset/email confirmation callback can land on missing pages.

Recommended cleanup:

- Define one canonical extension app route, probably `sidepanel-preact.html`.
- Update Edge Functions and Supabase auth redirects to that route.
- Add a small route/hash handler inside UI for `#reset-password`, `#email-confirmed`, and checkout status.
- Add tests that assert redirect URLs are files copied to `dist`.

## Orphan Or Conflicted Features

### 3. English module is half-connected

Evidence:

- `src/ui-preact/pages/EnglishPage.jsx` exists and is feature-complete.
- `src/ui-preact/config/navigationConfig.js` has no `english` page id.
- `src/ui-preact/components/MainApp.jsx` has no `EnglishPage` import/case.
- `src/background/handlers/registries/settingsAndProductivityRegistry.js:7` still imports `english.js`, so background handlers are registered.
- `src/ui-preact/api/englishApi.js` and `MESSAGE_TYPES.ENGLISH_*` still exist.
- Newer prompt work also has `writing.english_learning`, which overlaps the English learning domain.

Impact:

- Code, schema, handlers, and migrations exist for a page users cannot reach.
- Product ownership is unclear: English is either a standalone module or part of Writing.

Recommended decision:

- Option A: remove `EnglishPage`, `englishApi`, `english.js`, `ENGLISH_*` messages, and associated docs/migrations only if data model is no longer needed.
- Option B: re-add page to navigation and E2E.
- Option C: merge English functionality into Writing and keep only one prompt/data path.

### 4. Legacy portfolio modals are replaced but still in source

Evidence:

- `src/ui-preact/pages/PortfolioPage.jsx:516-522` renders `StockResearchModal` and `PortfolioEvalModal`.
- `src/ui-preact/pages/PortfolioPage.jsx:530-533` states `TeaStockModal` and `EvaluatePortfolioModal` were replaced.
- `src/ui-preact/components/StockResearchModal.jsx:14` states it replaces `TeaStockModal`.
- `src/ui-preact/components/PortfolioEvalModal.jsx` implements the newer portfolio evaluation flow.
- `src/ui-preact/components/TeaStockModal.jsx` and `src/ui-preact/components/EvaluatePortfolioModal.jsx` are not imported by production code.

Impact:

- Legacy UI paths remain as dead code candidates.
- Tests/comments still mention old modal names, which hides the actual product behavior.

Recommended cleanup:

- Confirm feature flag fallback no longer imports legacy components.
- Delete `TeaStockModal.jsx` and `EvaluatePortfolioModal.jsx`.
- Rename stale tests/comments from old modal names to current modal names.

## Unused Or Redundant Candidates

### 5. Test file inside `src` is not run by Vitest

Evidence:

- `src/background/services/chatHistoryService.test.js` contains Vitest tests.
- `vitest.config.js:27` only includes `tests/unit/**/*.test.js` and `tests/integration/**/*.test.js`.

Impact:

- The file looks like a test but is excluded from test runs.
- It contributes to source noise and static analysis confusion.

Recommended cleanup:

- Move it to `tests/unit/chatHistoryService.test.js`, or delete it if obsolete.
- Prefer testing exported functions from `chatHistoryService.js` instead of duplicating private helper implementations inside the test file.

### 6. CSS files under `src/ui-preact/styles` are likely not loaded

Evidence:

- Files exist: `market.css`, `status.css`, `writingTemplatesSection.css`, `themes.css`.
- Only `themes.css` is imported by `src/ui-preact/settings/index.jsx`.
- `sidepanel-preact.html` loads `styles-shared.css`, `styles-preact.css`, `styles-settings.css`, and generated `assets/settings-preact.css`.
- `rg` found no imports/links for `market.css`, `status.css`, or `writingTemplatesSection.css`.

Impact:

- Styling may be duplicated in the large `src/extension/styles-preact.css`.
- Or the CSS files are dead and can be removed.

Recommended cleanup:

- For each CSS file, decide: import it from component/app entry, merge it into `styles-preact.css`, or delete it.
- Add a build/screenshot check for pages affected by `market`, `status`, and writing templates before removal.

### 7. Dependency hygiene issues

Knip findings that are high-confidence after manual search:

- `htm` in `dependencies` is not imported.
- `react-router-dom` in `dependencies` is not imported; navigation is signal/switch based.
- `@testing-library/preact` and `@testing-library/preact-hooks` are not imported directly.
- `tests/test-utils/preact-render.js` imports `@testing-library/dom`, but `@testing-library/dom` is not declared directly in `package.json`.

Candidate:

- `supabase` CLI devDependency is not referenced by package scripts; keep only if local workflow intentionally uses `npx supabase`/global CLI differently.

Recommended cleanup:

- Remove unused runtime deps first: `htm`, `react-router-dom`.
- Add direct devDependency for `@testing-library/dom`.
- Re-evaluate `@testing-library/preact` and `@testing-library/preact-hooks` after confirming the custom `preact-render` helper is the intended permanent path.
- Decide whether `supabase` should stay as pinned local CLI or move to docs-only `npx supabase`.

## Architecture Inconsistencies

### 8. UI messaging has two patterns

Evidence:

- `src/ui-preact/api/runtimeGateway.js` exists and standardizes `createMessage`, domain version, and error handling.
- Only `settingsApi.js` and `StockResearchModal.jsx` use `sendRuntimeMessage`.
- 35 UI files still call `chrome.runtime.sendMessage` directly.

Impact:

- Payload shape, `domainVersion`, callback-vs-promise style, and error handling vary by feature.
- Future message schema changes will require broad manual edits.

Recommended cleanup:

- Make `runtimeGateway.js` the only UI-to-background request path.
- Keep direct `chrome.runtime.onMessage` only for broadcast listeners.
- Convert feature API modules first, then components/pages.

### 9. Error code source of truth is split

Evidence:

- `src/types.js:56` exports a legacy `ERROR_CODES`.
- `src/shared/errorCodes.js:15` exports the newer, larger `ERROR_CODES`.
- `src/platform/messaging.js`, `src/platform/tabs.js`, `src/platform/storage.js`, `src/chatgptSession.js`, `src/background/messageRouter.js`, and `src/background/handlers/providers/chatgpt.js` still import from `types.js`.
- Most modern handlers import from `shared/errorCodes.js`.

Impact:

- New code can import the wrong `ERROR_CODES` and miss keys like `AUTH_REQUIRED`.
- Error response semantics differ across platform/background layers.

Recommended cleanup:

- Move tab/content-script-specific codes into `shared/errorCodes.js`.
- Update imports from `types.js` to `shared/errorCodes.js`.
- Keep `types.js` only for response shape helpers or remove it after migration.

### 10. Handler registration is mostly constant-based but not fully

Evidence:

Raw string handler registrations remain in:

- `src/background/handlers/apiKeys.js`
- `src/background/handlers/priceAlerts.js`
- `src/background/handlers/multiPortfolio.js`
- Legacy `WATCHLIST_ENRICH_SYMBOL` in `watchlistEnrich.js`

Impact:

- Low immediate risk if strings match constants.
- Medium future risk because typos bypass compile-time/search consistency.

Recommended cleanup:

- Convert non-legacy registrations to `MESSAGE_TYPES.*`.
- Keep explicit comments for truly legacy aliases.
- Add a small architecture fitness test that rejects raw string `registerHandler('...')` except allowlisted legacy aliases.

## Documentation Redundancy

Docs have useful history but too many “report/complete/final/fix” files now compete with canonical docs.

High-signal docs should remain:

- `docs/confluence/*` as canonical architecture/feature docs.
- `docs/CHANGELOG.md`.
- Active OpenSpec changes under `openspec/changes/*`.
- Current feature specs only when not superseded.

Archive candidates:

- `*_COMPLETE.md`
- `*_FINAL_SUMMARY.md`
- `*_FIX*.md`
- historical bug reports after fix is released
- duplicate architecture diagrams (`architecture.mermaid.md`, `flowchart LR.mmd`) after one canonical diagram is chosen

Recommended cleanup:

- Create `docs/archive/2026-04/`.
- Move stale implementation reports there instead of deleting immediately.
- Add `docs/README.md` that points to canonical docs and marks archive as historical.

## Static Analysis Notes

Knip default output is useful but not directly actionable yet.

Why:

- The project has custom extension entrypoints in `vite.config.js` and `manifest.json`.
- Many handler modules self-register by side-effect imports.
- Browser extension content scripts and Supabase Edge Functions are not standard app entrypoints.

Recommended setup before automated removal:

- Add `knip.json` with explicit entrypoints:
  - `src/background/index.js`
  - `src/content.js`
  - `src/content/gemini.js`
  - `src/content/claude.js`
  - `src/ui-preact/settings/index.jsx`
  - `supabase/functions/*/index.ts`
  - `tests/unit/**/*.test.js`
  - `tests/integration/**/*.test.js`
- Ignore generated outputs: `dist/**`, `tests/e2e/reports/**`.
- Treat `unused files` as advisory until config is tuned.
- Treat `dependencies` and `unlisted dependencies` as higher confidence.

## Suggested Refactor Sequence

Phase 1: Safety rails

- Add configured Knip or equivalent static analysis.
- Add dist manifest artifact test.
- Update E2E to build/load `dist`.

Phase 2: Broken links and redirects

- Replace `sidepanel.html`, `popup.html`, `settings.html`, and `index.html` assumptions with current extension route.
- Add tests for Auth and Billing redirect URLs.

Phase 3: Remove dead UI paths

- Decide English ownership.
- Delete or reconnect `EnglishPage`.
- Delete legacy `TeaStockModal` and `EvaluatePortfolioModal` after flag fallback confirmation.

Phase 4: Dependency and CSS cleanup

- Remove unused deps and declare direct deps.
- Resolve unused CSS files by import/merge/delete.

Phase 5: Architecture normalization

- Migrate UI requests to `runtimeGateway`.
- Merge `ERROR_CODES`.
- Convert raw string handler registrations.
- Archive stale docs.

## Open Questions

1. English learning nên là page riêng hay một template/workflow trong Writing?
2. Có còn cần popup không, hay extension chỉ dùng side panel?
3. `supabase` CLI cần pinned trong `devDependencies` hay dùng external CLI/npx?
4. Legacy `SEND_PROMPT` fallback trong portfolio eval còn cần giữ bao lâu?
5. Có muốn giữ historical docs trong repo hay chuyển sang external knowledge base?
