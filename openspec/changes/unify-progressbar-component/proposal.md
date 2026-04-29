## Why

The UI currently renders progress bars with multiple local implementations across modals and pages, which creates duplicated JSX, inconsistent accessibility, and fragmented styling. A shared progressbar capability is needed now because the codebase already has a global loading source of truth, but determinate progress UI still diverges per surface.

## What Changes

- Add a single reusable progressbar component for determinate and indeterminate progress UI.
- Replace duplicated progressbar markup in stock research, portfolio evaluation, market assessment, subscription usage, and password strength surfaces with the shared component.
- Centralize progressbar accessibility semantics, value clamping, sizing, tone/color variants, and shared CSS classes.
- Keep non-progressbar indicators out of scope: toast timeout animation, onboarding step dots, net-worth allocation bars, and market-regime chart bars remain specialized UI/data visualization.
- Add focused component tests and update affected usage tests where needed.

## Capabilities

### New Capabilities
- `unified-progressbar-ui`: Defines the shared progressbar behavior, accessibility contract, and allowed usage boundaries for determinate and indeterminate UI progress indicators.

### Modified Capabilities
- None.

## Impact

- Affected UI code:
  - `src/ui-preact/components/StockResearchModal.jsx`
  - `src/ui-preact/components/PortfolioEvalModal.jsx`
  - `src/ui-preact/pages/MarketPage.jsx`
  - `src/ui-preact/components/billing/SubscriptionPage.jsx`
  - `src/ui-preact/components/auth/RegisterForm.jsx`
  - `src/ui-preact/components/auth/ChangePasswordSection.jsx`
- Affected styling:
  - `src/extension/styles-preact.css`
  - Vite-extracted component CSS from `src/ui-preact/styles/themes.css` if shared theme tokens are needed.
- New code:
  - Shared progressbar component under `src/ui-preact/components/`.
  - Focused unit tests under `tests/unit/components/`.
- No API, database, or background-service changes are expected.
