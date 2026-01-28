DONE

# GPT-040 Preact app shell + mount point

## Project Context (MUST READ)
Sidepanel hiện là một file HTML lớn. Migrate từng page yêu cầu tạo Preact app shell và mount point để render UI theo route.

## Timebox
2–4 giờ.

## Goal
Tạo Preact app entry và cập nhật sidepanel.html để mount vào #app.

## Inputs
- src/extension/sidepanel.html
- src/extension/styles.css
- (new) src/extension/app.jsx

## Requirements
1. Add <div id="app"></div> trong sidepanel shell.
2. Load app entry (module script) thay cho render DOM trực tiếp.
3. Keep header/nav static or render by Preact (choose one, document in code).

## SOLID Notes
SRP: app entry chỉ mount + điều phối page.

## Acceptance Criteria
- Sidepanel loads with header/nav intact.
- App entry runs without runtime errors.

## DoD
- app entry created.
- sidepanel.html updated and lint/build OK.

## Test Plan
- Open sidepanel in Chrome: UI renders.

## Dependencies
- GPT-039.

## Risks
- Nav event wiring conflicts with existing DOM handlers.