## Context

The extension already centralizes blocking loading state in `src/ui-preact/state/appState.js` and renders a single global loading overlay from `App.jsx`. That solves full-app loading, but determinate progress indicators are still implemented locally across pages and modals.

Current duplicated progressbar patterns include:
- Stock research pipeline progress in `StockResearchModal.jsx`
- Portfolio evaluation progress in `PortfolioEvalModal.jsx`
- Market assessment run progress in `MarketPage.jsx`
- Subscription usage bars in `SubscriptionPage.jsx`
- Password strength bars in register/change-password forms

There are also visual bars that are not operational progressbars, such as toast timeout animations, onboarding step dots, net-worth allocation bars, and market-regime history bars. Treating those as progressbars would blur UI semantics and create the wrong abstraction.

## Goals / Non-Goals

**Goals:**
- Introduce one shared progressbar component for operational determinate and indeterminate progress indicators.
- Centralize accessibility attributes, percentage calculation, value clamping, tone variants, sizing, labels, and captions.
- Replace duplicated progressbar track/fill JSX in the affected UI surfaces.
- Keep global loading overlay behavior separate from embedded progressbar behavior.
- Keep the implementation compatible with existing Preact, CSS, and build conventions.

**Non-Goals:**
- Do not redesign the affected pages or modals beyond swapping duplicated progressbar markup.
- Do not change background progress event schemas, stock research orchestration, market assessment status messages, billing usage data, or password-strength scoring.
- Do not convert data visualizations or step indicators into progressbars.
- Do not add a third-party progressbar dependency.

## Decisions

### Decision: Add `ProgressBar.jsx` as the only operational progressbar component

Create a shared component under `src/ui-preact/components/ProgressBar.jsx`. Existing feature surfaces will import this component rather than rendering raw progressbar track/fill DOM.

Suggested public props:
- `value`: current numeric value for determinate mode
- `max`: maximum numeric value, defaulting to `100`
- `label`: optional visible or accessible label
- `caption`: optional helper text below or beside the bar
- `tone`: visual semantic variant such as `primary`, `success`, `warning`, `danger`, `neutral`
- `size`: visual size such as `sm`, `md`
- `indeterminate`: render an indeterminate progress indicator and omit `aria-valuenow`
- `showValue`: optional percentage/value display

Rationale: a single explicit component keeps behavior discoverable and testable without adding global state for every progress use case. Alternatives considered:
- Extend `appState.js`: rejected because global loading is a blocking overlay, while these are embedded local progress indicators.
- Keep local JSX and share CSS only: rejected because it still duplicates accessibility and value calculation.
- Add a third-party component: rejected because the project already has simple UI primitives and no dependency is needed.

### Decision: Clamp and normalize values inside the shared component

The component should compute percentage from `value / max`, clamp output to `0..100`, and handle invalid values defensively. Callers can pass domain values such as `currentStep`/`totalSteps`, `used`/`limit`, or password score/max without duplicating the math.

Rationale: local percentage calculations are one source of duplication today. Centralizing them keeps every progressbar consistent and avoids negative/over-100 widths. Alternatives considered:
- Require callers to pass only percentage: rejected because it keeps calculation duplicated at call sites.
- Throw on invalid values: rejected because UI progress should degrade safely.

### Decision: Keep CSS class names namespaced to the shared component

Use a single class family such as `progressbar`, `progressbar__track`, `progressbar__fill`, `progressbar__label`, and modifier classes for tone/size/indeterminate state. Remove or stop using generic/local classes like `progress-bar-container`, `progress-bar`, `mkt-run-progress`, `mkt-run-bar`, `usage-bar-track`, `usage-bar-fill`, `strength-bar`, and `strength-fill` where they represent operational progressbars.

Rationale: namespaced classes make future repository searches reliable and prevent accidental style collisions. Alternatives considered:
- Reuse existing generic class names: rejected because their semantics are ambiguous and already fragmented.

### Decision: Exclude non-operational bars from this component

The following should remain specialized:
- `toast-progress`: a time-dismiss animation, not a progressbar
- `onboarding-progress`: a stepper/navigation indicator
- `net-worth-bar` and `bar-segment`: allocation visualization
- `mkt-regime-bar`: historical market score visualization

Rationale: these elements communicate different semantics and accessibility contracts. Sharing a component there would reduce clarity.

## Risks / Trade-offs

- Existing CSS may rely on old local class names → Replace only progressbar-related classes used by migrated JSX and leave unrelated visualization classes intact.
- Password strength currently injects color through inline styles → Preserve semantic color by mapping strength to a supported `tone`, or allow a constrained CSS variable only if tone mapping cannot express the existing states.
- Some usage bars show "unlimited" without a visual bar → Preserve this branch and use `ProgressBar` only when a finite limit exists.
- Market assessment progress uses event fields that may be missing → Use the shared component's defensive value handling and keep status text rendering unchanged.
- Visual regressions across compact modals are possible → Keep size variants small and verify focused UI snapshots or component DOM tests.

## Migration Plan

1. Add focused tests for `ProgressBar` covering determinate rendering, value clamping, indeterminate mode, labels/captions, and accessibility attributes.
2. Implement `ProgressBar.jsx` and its shared CSS.
3. Replace duplicated progressbar JSX in Stock Research, Portfolio Evaluation, Market Assessment, Subscription usage, and password strength surfaces.
4. Remove obsolete local progressbar CSS selectors that no longer have runtime usage.
5. Run focused component/unit tests and a production build.

Rollback is straightforward: restore the previous local JSX for affected surfaces and remove the shared component import. No data migration or background rollback is required.

## Open Questions

- Should password strength expose the existing exact colors, or is mapping to shared semantic tones acceptable?
- Should `label` be visible by default, or should compact surfaces pass `ariaLabel` for screen-reader-only labeling when the surrounding text already identifies the progressbar?
