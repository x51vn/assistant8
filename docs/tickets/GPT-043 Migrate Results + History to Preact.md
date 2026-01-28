DONE

# GPT-043 Migrate Results + History to Preact

## Project Context (MUST READ)
Results/History hiện dùng DOM thao tác trực tiếp trong src/ui/results.js và src/ui/history.js; cần chuyển sang Preact để đồng nhất UI architecture.

## Timebox
2–4 giờ.

## Goal
Chuyển Results + History section sang Preact components, giữ nguyên hành vi.

## Inputs
- src/ui/results.js
- src/ui/history.js
- sidepanel.html (results markup)

## Requirements
1. Create src/ui/Results.jsx + History subcomponent (hoặc combine).
2. Render history list và action buttons (refresh, clear).
3. Preserve link to chat URL và view-in-history.
4. Sanitize/escape HTML in rendered content.

## SOLID Notes
SRP: Results component handles UI only.

## Acceptance Criteria
- Results render correctly with chat URL + history link.
- History refresh/clear works via background messaging.

## DoD
- Legacy DOM handlers removed or disabled.

## Test Plan
- Trigger prompt flow and verify results + history list update.

## Dependencies
- GPT-041.

## Risks
- XSS if response content not escaped.