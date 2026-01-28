DONE

# GPT-048 Cleanup legacy DOM scripts + CSS scoping

## Project Context (MUST READ)
Sau khi migrate pages sang Preact, cần dọn các DOM handlers cũ và scope CSS để tránh bleed (đặc biệt header/nav).

## Timebox
2–4 giờ.

## Goal
Remove/disable legacy UI scripts and add CSS scoping to stabilize layout.

## Inputs
- src/ui/*.js (legacy DOM modules)
- src/extension/styles.css
- sidepanel.html

## Requirements
1. Remove unused DOM event bindings for migrated pages.
2. Ensure only Preact renders page content.
3. Scope styles by page/container (#portfolio, #results, #errors, #settings, #english).
4. Avoid regressions in header/nav buttons.

## SOLID Notes
N/A.

## Acceptance Criteria
- No duplicate events or double-render.
- Visual regressions resolved.

## DoD
- Dead code removed or gated behind feature flag.

## Test Plan
- Smoke test all tabs; verify no console errors.

## Dependencies
- GPT-042, GPT-043, GPT-044, GPT-045, GPT-046.

## Risks
- Removing legacy code too early can break pages not yet migrated.