## 1. Consistency Guard

- [x] 1.1 Add a failing static unit test that detects raw semantic progressbar implementations outside `src/ui-preact/components/ProgressBar.jsx`.
- [x] 1.2 Extend the static unit test to detect forbidden ambiguous indicator names such as `toast-progress`, `onboarding-progress`, `research-progress`, `progress-header`, `mkt-regime-bar`, `net-worth-bar`, `bar-segment`, and chart bar names.
- [x] 1.3 Add an explicit allowlist for legitimate non-indicator layout names such as navigation bars, search bars, tab bars, filter bars, and metrics bars.

## 2. Watchlist Progress

- [x] 2.1 Add shared `ProgressBar` usage to the Watchlist bulk-add modal with completed symbol count as value and parsed symbol count as max.
- [x] 2.2 Add shared `ProgressBar` usage to Watchlist batch enrichment status, using determinate values when available and indeterminate mode when only active state is known.
- [x] 2.3 Preserve Watchlist per-symbol chips and per-row spinner affordances as status details, not alternate progressbar implementations.

## 3. Semantic Renames

- [x] 3.1 Rename toast auto-dismiss progress classes and keyframes to timer terminology.
- [x] 3.2 Rename onboarding progress classes to step/stepper terminology.
- [x] 3.3 Rename stock research and portfolio evaluation operation wrappers from progress terminology to operation status terminology.
- [x] 3.4 Rename Market regime chart classes from bar terminology to chart column terminology.
- [x] 3.5 Rename Dashboard and NetWorth allocation classes from generic bar terminology to allocation strip/segment terminology.
- [x] 3.6 Rename AssetHistoryChart classes from bar terminology to chart column terminology.

## 4. Verification

- [x] 4.1 Run the focused UI indicator consistency/static tests and confirm they pass.
- [x] 4.2 Run focused component tests covering `ProgressBar` and affected Watchlist/Market surfaces where available.
- [x] 4.3 Run source searches for `progress`, `progressbar`, `bar`, `track`, and `fill` to confirm only allowed semantics remain.
- [x] 4.4 Run `openspec validate enforce-progressbar-consistency --strict --no-interactive`.
- [x] 4.5 Run a production build to verify renamed JSX/CSS references compile.
