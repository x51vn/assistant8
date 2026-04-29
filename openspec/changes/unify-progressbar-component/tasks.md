## 1. Shared Component Contract

- [x] 1.1 Add focused unit tests for `ProgressBar` determinate rendering, percent calculation, clamping, labels/captions, and ARIA attributes.
- [x] 1.2 Add focused unit tests for `ProgressBar` indeterminate rendering and unsupported tone/size fallback behavior.
- [x] 1.3 Implement `src/ui-preact/components/ProgressBar.jsx` with value normalization, accessible naming, determinate and indeterminate modes, tone variants, and size variants.
- [x] 1.4 Add shared progressbar CSS using a single namespaced class family and existing theme tokens.

## 2. Surface Migration

- [x] 2.1 Replace stock research pipeline progressbar markup with `ProgressBar`.
- [x] 2.2 Replace portfolio evaluation progressbar markup with `ProgressBar` while preserving partial-results rendering.
- [x] 2.3 Replace market assessment run progressbar markup with `ProgressBar` while preserving status message text.
- [x] 2.4 Replace finite subscription usage bars with `ProgressBar` while preserving the unlimited-usage branch.
- [x] 2.5 Replace register and change-password strength bars with `ProgressBar` while preserving strength labels and semantic colors.

## 3. Cleanup

- [x] 3.1 Remove obsolete operational progressbar CSS selectors no longer referenced by runtime JSX.
- [x] 3.2 Confirm toast timeout animation, onboarding step dots, net-worth allocation bars, dashboard allocation bars, and market-regime bars remain specialized and are not migrated.
- [x] 3.3 Search the UI codebase for remaining raw operational progressbar track/fill markup and either migrate it or document why it is out of scope.

## 4. Verification

- [x] 4.1 Run focused unit tests for the shared progressbar component.
- [x] 4.2 Run relevant UI/component tests for migrated surfaces.
- [x] 4.3 Run `openspec validate unify-progressbar-component --strict --no-interactive`.
- [x] 4.4 Run a production build to verify the Preact bundle and copied extension CSS still compile.
