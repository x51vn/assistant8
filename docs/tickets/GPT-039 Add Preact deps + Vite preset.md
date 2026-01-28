DONE

# GPT-039 Add Preact deps + Vite preset

## Project Context (MUST READ)
UI đang ở dạng vanilla JS + Vite. Mục tiêu migrate từng page sang Preact để modular hóa UI, giữ MV3 sidepanel shell.

## Timebox
2–4 giờ.

## Goal
Thêm Preact runtime và Vite preset để build JSX cho sidepanel UI.

## Inputs
- package.json
- vite.config.js

## Requirements
1. Add dependencies: preact.
2. Add dev dependency: @preact/preset-vite.
3. Update vite config to include preact preset.
4. Build still works with existing entrypoints.

## SOLID Notes
N/A.

## Acceptance Criteria
- `npm run build` passes.
- Bundle includes Preact runtime without breaking background/content scripts.

## DoD
- Dependencies installed and locked.
- Vite config updated and committed.

## Test Plan
- Run `npm run build` and verify no errors.

## Dependencies
- None.

## Risks
- Bundle size increase (minor).