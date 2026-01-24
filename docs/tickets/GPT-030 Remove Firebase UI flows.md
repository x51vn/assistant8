DONE

# GPT-030 Remove Firebase UI flows

## Project Context (MUST READ)
Project chuyển Firebase → Supabase. UI không được dùng Firebase SDK/config/service nữa. Background là middleware duy nhất gọi Supabase.

## Timebox
2–4 giờ.

## Goal
Loại bỏ toàn bộ Firebase UI flows và wiring còn sót.

## Inputs
- src/ui/*
- src/firebaseConfig.js, src/firebaseService.js
- docs/ARCHITECTURE.md

## Requirements
1. Remove UI imports/usages of firebase modules.
2. Ensure UI only calls background via `chrome.runtime.sendMessage`.
3. Verify settings/auth pages không show Firebase-specific UI.
4. Update any docs/UI text referencing Firebase.

## SOLID Notes
- SRP: UI modules không biết backend implementation.

## Acceptance Criteria
- No `firebase` import reachable from UI build.

## DoD
- Grep `firebase` in src/ui returns 0.

## Test Plan
- `npm run build`.
- Smoke: open sidepanel and verify main flows load.

## Dependencies
- GPT-028, GPT-029

## Risks
- Removing shared utilities may break unrelated UI; keep changes scoped.
