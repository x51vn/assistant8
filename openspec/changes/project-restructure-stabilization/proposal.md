## Why

The unified extension still builds and passes the current unit suite, but the codebase shows migration residue that weakens runtime correctness and increases maintenance cost. The research in `docs/PROJECT_RESTRUCTURE_RESEARCH_2026-04-27.md` found production-facing conflicts such as E2E coverage targeting stale extension artifacts, auth and billing redirects pointing to files that are no longer built, unreachable but still-registered product features, and several dead or redundant source assets.

These issues should be resolved before any future repo split or larger feature work. The immediate goal is to stabilize the single-extension baseline so build, runtime, tests, docs, and navigation all describe the same product surface.

## What Changes

- Align runtime entrypoints, callback URLs, and E2E coverage with the actual built extension bundle.
- Define one product path for orphaned or half-migrated features, especially English learning and legacy portfolio modal flows.
- Remove or properly wire high-confidence dead code, CSS, and dependencies that remained after prior migrations.
- Consolidate architecture conventions around handler registration, message/error contracts, and source-of-truth docs only where needed to remove active ambiguity.
- Add focused validation so future regressions in extension routing and bundle loading are caught automatically.

## Capabilities

### New Capabilities

- `project-restructure-stability`: Defines the minimum runtime, navigation, cleanup, and validation guarantees required for the stabilized unified extension baseline.

### Modified Capabilities

- None.

## Impact

- Extension runtime and build references: `src/extension/manifest.json`, built HTML entrypoints, Vite config, and related runtime routing helpers.
- E2E coverage: `tests/e2e/**` to ensure tests load `dist` and only assert routes that still exist.
- Auth and billing callback construction: background auth handlers and Supabase Edge Functions that build extension return URLs.
- Product navigation and feature ownership: `src/ui-preact/components/MainApp.jsx`, `src/ui-preact/config/navigationConfig.js`, English-related APIs/handlers/pages, and portfolio modal components.
- Cleanup candidates from the research report: legacy modal components, stray tests under `src`, unused CSS files, and unused package dependencies.
- Validation workflow: focused tests plus `openspec validate project-restructure-stabilization --strict --no-interactive`.