DONE

# GPT-041 Preact nav router + lazy loading

## Project Context (MUST READ)
Sidepanel có nhiều page (portfolio, results, errors, settings, english). Migrate incremental cần router/lazy-load để giữ bundle nhẹ và giảm rủi ro.

## Timebox
2–4 giờ.

## Goal
Implement router đơn giản (state-driven) và lazy-load component theo nav.

## Inputs
- src/extension/app.jsx
- src/ui/* (future Preact pages)

## Requirements
1. Router state = page name.
2. Lazy-load component khi user chọn tab (dynamic import).
3. Preserve existing nav button active state UI.
4. Default page = results.

## SOLID Notes
SRP: router chỉ định tuyến, không chứa business logic.

## Acceptance Criteria
- Switching tabs loads đúng component.
- First load stays fast (lazy load works).

## DoD
- Router implemented + documented.

## Test Plan
- Click each nav button and verify correct page renders.

## Dependencies
- GPT-040.

## Risks
- Dynamic import path mismatch in Vite build.