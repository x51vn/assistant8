DONE

# GPT-045 Migrate Settings page to Preact

## Project Context (MUST READ)
Settings UI hiện trong sidepanel.html + src/ui/settings.js, gồm prompts, toggles, và auth section. Cần chuyển sang Preact để giảm DOM manipulation.

## Timebox
2–4 giờ.

## Goal
Chuyển Settings page sang Preact component và giữ logic lưu/đọc settings qua background.

## Inputs
- src/ui/settings.js
- sidepanel.html (settings markup)

## Requirements
1. Create src/ui/Settings.jsx.
2. Render prompts inputs, toggles, và save status.
3. Preserve validation + error messages (VN).
4. Keep auth summary block intact (or move to separate Auth component if needed).

## SOLID Notes
SRP: Settings component handles UI only.

## Acceptance Criteria
- Save/Reset/Send works as before.
- Status messages appear correctly.

## DoD
- Legacy DOM logic removed or disabled.

## Test Plan
- Update prompts/toggles, save, reload, verify persisted.

## Dependencies
- GPT-041.

## Risks
- Large form state handling in Preact; ensure no regression.