## Context

The current branch has already been reset to the pre-split single-extension baseline, but the codebase still contains churn from multiple UI and architecture migrations. The research document identified four classes of problems:

1. Runtime paths and tests disagree about the real extension entrypoints.
2. Some remote callbacks still target removed extension pages.
3. Product features such as English learning and legacy portfolio flows have unresolved ownership.
4. High-confidence dead files and dependencies remain in the tree and obscure the active architecture.

The goal of this change is not broad redesign. It is to produce one internally consistent baseline that matches what the extension actually builds and exposes to users.

## Goals / Non-Goals

**Goals:**

- Make production callback URLs, extension entrypoints, and E2E coverage refer to the same built pages.
- Decide whether conflicted features are retained, reintegrated, merged, or removed.
- Remove or explicitly wire high-confidence unused assets that survived previous migrations.
- Preserve the current single-extension product while reducing ambiguity for the next development phase.

**Non-Goals:**

- Do not re-split the repository into multiple extensions.
- Do not redesign unrelated UI flows beyond what is required to restore consistency.
- Do not migrate data models unless cleanup decisions require a narrow schema or handler follow-up.
- Do not rewrite stable features solely for stylistic consistency.

## Decisions

### Runtime correctness comes before cosmetic cleanup

The first slice fixes issues that can break real user flows or produce false engineering confidence: stale E2E entrypoints, removed popup assertions, and callback URLs pointing to missing built pages.

Rationale: these problems affect correctness immediately and can mask future regressions.

### The extension must advertise one canonical UI route

Remote redirects and in-extension navigation should converge on a single, built HTML entrypoint with route or hash handling layered inside the UI.

Rationale: callback generators should not need to know about deprecated HTML files, and tests should validate only files that the build emits.

### Orphan features need an explicit ownership decision

Features that still have handlers, messages, or pages but no reachable navigation must be either restored intentionally or removed end-to-end. Partial retention is not acceptable for the stabilized baseline.

Rationale: unreachable features increase support cost and make migrations harder to reason about.

### Cleanup should be evidence-driven

Only items with direct evidence of being unused, stale, or superseded should be removed in this change. For borderline items, wire them properly or defer them with documented reasoning.

Rationale: the repo has already gone through multiple migrations, so this change should reduce ambiguity without causing speculative breakage.

## Risks / Trade-offs

- Repointing callback URLs can break external flows if one route is missed; mitigate with focused callback tests and build-file existence checks.
- Removing legacy components or dependencies can expose hidden imports; mitigate with targeted search, unit coverage, and a full build.
- Restoring an orphan feature to navigation instead of removing it increases scope; if product ownership remains unclear, bias toward removal or deferral rather than shipping another half-connected path.
- Cleaning tests to target `dist` can require fixture and Playwright updates, but that cost is necessary to regain meaningful E2E coverage.

## Migration Plan

1. Fix extension bundle routing references, E2E loaders, and callback URL generation.
2. Decide and implement the ownership path for English learning and superseded portfolio modals.
3. Remove or rewire high-confidence dead tests, CSS, and dependencies identified in the research.
4. Run focused validation for E2E routing assumptions, unit/build health, and OpenSpec strict validation.

## Open Questions

- Whether English learning should remain a standalone page, be merged into Writing, or be removed entirely.
- Whether any of the flagged CSS files are intentionally retained for upcoming work rather than current runtime use.