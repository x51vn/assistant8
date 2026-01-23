# GPT-017 UI Errors refactor to middleware

## Project Context (MUST READ)
Errors UI phải load/save từ Supabase thông qua background middleware. Không lưu errors locally.

## Timebox
2–4 giờ.

## Goal
Refactor errors UI để dùng message calls.

## Inputs
- src/ui/errors.js
- MESSAGE_TYPES error

## Requirements
1. Replace local storage reads/writes with:
   - ERROR_GET_ALL
   - ERROR_ADD
   - ERROR_UPDATE
   - ERROR_DELETE
2. Add optimistic UI update (optional) và rollback on error.
3. Error UX VN.

## SOLID Notes
- SRP: UI render vs data ops.

## Acceptance Criteria
- Errors UI hoạt động end-to-end.

## DoD
- Không còn chrome.storage.local business errors.

## Test Plan
- Playwright: add/update/delete error.

## Dependencies
- GPT-016

## Risks
- UI hiện có format khác; cần mapping.
