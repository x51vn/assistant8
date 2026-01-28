DONE

# GPT-042 Migrate Portfolio page to Preact

## Project Context (MUST READ)
Portfolio UI đang dùng DOM manipulation trong src/ui/portfolio.js và markup trong sidepanel.html. Migrate từng page bắt đầu từ Portfolio để validate approach.

## Timebox
2–4 giờ.

## Goal
Chuyển Portfolio page sang Preact component và giữ nguyên hành vi hiện tại.

## Inputs
- src/ui/portfolio.js
- src/extension/sidepanel.html (portfolio markup)
- src/utils/numberFormat.js

## Requirements
1. Create src/ui/Portfolio.jsx.
2. Move markup + handlers into component.
3. Use existing background message flow (no local storage).
4. Preserve compact number formatting.
5. Scope portfolio styles to avoid affecting header/nav.

## SOLID Notes
SRP: Portfolio component handles UI, background handlers stay unchanged.

## Acceptance Criteria
- Portfolio renders data and actions work (add, evaluate, run, refresh prices).
- No regression in header button styling.

## DoD
- Legacy Portfolio DOM code removed or wrapped.
- Component is lazy-loadable by router.

## Test Plan
- Open sidepanel, click Portfolio tab, verify CRUD + price update works.

## Dependencies
- GPT-041.

## Risks
- Event handler duplication if legacy JS not disabled.