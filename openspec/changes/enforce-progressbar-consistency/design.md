## Context

`unify-progressbar-component` introduced a shared `ProgressBar` component and migrated several operational progress indicators. The follow-up investigation found two remaining consistency gaps:

- Some long-running Watchlist operations still communicate progress through chips/spinners/text only.
- Several non-progress UI elements still use names such as `progress` or `bar`, which makes repository searches appear to reveal alternate progressbar implementations.

This change tightens the contract from "use a shared progressbar for known operational bars" to "there is exactly one semantic progressbar implementation, and every other indicator is named by its actual purpose."

## Goals / Non-Goals

**Goals:**
- Ensure every operational progress indicator renders through `ProgressBar`.
- Add shared progress UI to Watchlist long-running operations where users need progress feedback.
- Rename non-progress visual indicators so their class names and component comments do not imply progressbar ownership.
- Add static guardrails so future raw progressbar or ambiguous progressbar-like class additions fail tests.
- Preserve existing visual intent and page behavior where possible.

**Non-Goals:**
- Do not convert charts, allocation visuals, steppers, toast timers, or status chips into ARIA progressbars.
- Do not remove spinner icons from buttons where they only indicate local busy state.
- Do not change background queue/message APIs for watchlist enrichment.
- Do not redesign Watchlist, Market, Dashboard, Assets, onboarding, or toast UI layouts.

## Decisions

### Decision: Treat only operation/quota completion as `ProgressBar`

Use `ProgressBar` for UI that communicates operation completion or finite quota usage. Examples:
- Watchlist bulk add completion count.
- Watchlist batch enrichment count when total symbols are known.
- Existing stock research, portfolio evaluation, market run, subscription usage, password strength, and confidence indicators.

Do not use `ProgressBar` for:
- Toast dismiss countdowns.
- Onboarding step dots.
- Allocation segments.
- Historical/regime/value charts.
- Status chips.
- Button-only busy spinners.

Rationale: this preserves correct accessibility semantics while ensuring operational progress is owned by the shared component. Alternative considered: force all visual bars through `ProgressBar`; rejected because chart columns and allocation segments are not progressbars.

### Decision: Rename non-progress classes to semantic names

Rename ambiguous classes so a project-wide search for progressbar/progress/bar no longer suggests alternate progressbar implementations:
- `toast-progress` → `toast-timer`
- `onboarding-progress` → `onboarding-steps`
- `research-progress` → `operation-status`
- `progress-header` → `operation-status__header`
- `mkt-regime-bar*` → `mkt-regime-column*`
- `net-worth-bar` → `allocation-strip`
- `bar-segment` → `allocation-segment`
- `chart-bars` / `chart-bar*` in asset history → `chart-columns` / `chart-column*`

Rationale: class names are part of maintainability. The previous implementation was semantically correct in some places but still confusing to inspect and review.

### Decision: Watchlist gets explicit shared progress, not only chips

Add `ProgressBar` to Watchlist surfaces where there is a known total:
- Bulk add modal: value = completed symbols, max = total parsed symbols.
- Enrich all status: value = completed symbols when known, max = total symbols; indeterminate while only an active symbol count is known.

Per-row enrich buttons may keep spinner icons because each row has no numeric progress and the button state is a local busy affordance, not a progressbar.

Rationale: this addresses the user-visible inconsistency on Watchlist without requiring background schema changes. Alternative considered: replace per-symbol chips entirely with `ProgressBar`; rejected because chips show per-symbol success/error detail that a single progressbar cannot express.

### Decision: Add static guard tests

Add a unit/static test that scans runtime UI source files for:
- raw `role="progressbar"` outside `ProgressBar.jsx`
- `<progress>` elements
- forbidden class names such as `*-progress`, `*-progressbar`, `progress-*`, `*-bar` in known migrated indicator contexts
- direct track/fill progressbar class names outside `ProgressBar.jsx`

Allowlist non-ambiguous classes that are unrelated navigation/layout terms only when necessary, such as `navbar` or `search-bar`.

Rationale: the inconsistency is discoverability-driven and will regress unless guarded. Static tests are cheap and match the maintenance risk.

## Risks / Trade-offs

- Renaming CSS classes can cause missed selectors → Mitigate by updating JSX and CSS in the same task and running source searches plus build.
- Static guard can be too broad and block legitimate UI naming → Mitigate with a narrow allowlist and comments explaining why each allowed term is not progressbar-related.
- Watchlist enrichment may not expose completed/total counts today → Use indeterminate `ProgressBar` for active queue state until enough local state exists; do not change background API in this change.
- Existing docs/tests may mention old names → Update runtime tests where needed; leave historical docs unless they block checks.
- Concurrent active change dependency → Apply `unify-progressbar-component` before this change, or merge/archive it first so `ProgressBar` exists.

## Migration Plan

1. Add static guard tests that initially fail on existing ambiguous names.
2. Add Watchlist operational progress usage through `ProgressBar`.
3. Rename non-progress timer/stepper/status/chart/allocation classes in JSX and CSS.
4. Run source searches for `progress`, `progressbar`, `bar`, `track`, and `fill` to verify only allowed semantics remain.
5. Run focused unit/static tests, OpenSpec validation, and production build.

Rollback is low risk: revert class renames and remove the guard test. No database or background migration is required.

## Open Questions

- Should the static guard disallow all `*-bar` names, or only `*-bar` names in visual indicator contexts?
- Should Watchlist enrichment progress become determinate by extending the background status messages in a later change?
