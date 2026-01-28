DONE

# GPT-046 Migrate English page to Preact

## Project Context (MUST READ)
English Learning UI hiện ở sidepanel.html + src/ui/english.js. Cần chuyển sang Preact để chuẩn hóa UI.

## Timebox
2–4 giờ.

## Goal
Chuyển English page sang Preact component, giữ workflow generate/save sentences.

## Inputs
- src/ui/english.js
- sidepanel.html (english markup)

## Requirements
1. Create src/ui/English.jsx.
2. Render topic input, generate button, result area.
3. Render saved sentences list + delete action.
4. Keep existing background message flow.

## SOLID Notes
SRP: English component handles UI only.

## Acceptance Criteria
- Generate sentence works.
- Save/delete sentence works.

## DoD
- Legacy DOM logic removed or disabled.

## Test Plan
- Generate, save, delete, reload.

## Dependencies
- GPT-041.

## Risks
- State reset on tab switch; ensure state restored from storage/source.