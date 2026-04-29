## Why

The previous progressbar refactor unified the operational progressbar component, but the project still contains progress-like UI and `bar/progress` naming across Watchlist, Market, charts, toast, onboarding, and data-visualization surfaces. This creates ongoing confusion about which UI is the canonical progressbar and makes future consistency regressions likely.

## What Changes

- Enforce a project-wide UI indicator taxonomy:
  - Operational progress SHALL use the shared `ProgressBar` component.
  - Status chips, spinners, steppers, timers, and data visualizations SHALL use domain-specific names and not call themselves progressbars.
- Add shared `ProgressBar` usage to Watchlist long-running operations where the UI communicates operation progress.
- Rename progressbar-like but non-progress UI classes to semantic names:
  - `toast-progress` → toast timer naming.
  - `onboarding-progress` → onboarding step/stepper naming.
  - `research-progress` / `progress-header` wrappers → operation status naming.
  - market regime chart `*-bar` naming → chart column/visual naming.
  - allocation/chart bar naming → allocation segment or chart column naming.
- Add repository checks/tests to detect forbidden raw progressbar implementations and ambiguous `progressbar`/`progress` class names outside the shared component.
- Keep visual behavior intentionally stable; this change is about consistency, semantic ownership, and future guardrails, not a broad redesign.

## Capabilities

### New Capabilities
- `ui-indicator-consistency`: Defines the canonical taxonomy and guardrails for operational progressbars, progress-like status UI, timers, steppers, and chart/data-visualization indicators across the Preact UI.

### Modified Capabilities
- None.

## Impact

- Affected UI/runtime areas:
  - `src/ui-preact/components/ProgressBar.jsx`
  - `src/ui-preact/pages/WatchlistPage.jsx`
  - `src/ui-preact/components/WatchlistTable.jsx`
  - `src/ui-preact/components/WatchlistForms.jsx`
  - `src/ui-preact/pages/MarketPage.jsx`
  - `src/ui-preact/components/StockResearchModal.jsx`
  - `src/ui-preact/components/PortfolioEvalModal.jsx`
  - `src/ui-preact/context/ToastContext.jsx`
  - `src/ui-preact/components/OnboardingWizard.jsx`
  - `src/ui-preact/pages/DashboardPage.jsx`
  - `src/ui-preact/components/NetWorthSummary.jsx`
  - `src/ui-preact/components/AssetHistoryChart.jsx`
- Affected CSS:
  - `src/extension/styles-preact.css`
  - `src/ui-preact/styles/themes.css`
- Affected tests/checks:
  - Add or extend unit/static tests under `tests/unit/` to enforce one semantic progressbar implementation.
- Dependency:
  - This change expects the shared `ProgressBar` component from `unify-progressbar-component` to exist before implementation.
- No background API, database, or message schema changes are expected.
