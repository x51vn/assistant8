# GPT-015 UI History refactor to middleware

## Project Context (MUST READ)
UI side panel không được đọc/ghi business data từ chrome.storage.local. History UI phải gọi background handler (Supabase-backed).

## Timebox
2–4 giờ.

## Goal
Refactor UI history page để sử dụng message calls.

## Inputs
- src/ui/history.js
- MESSAGE_TYPES history

## Requirements
1. Thay toàn bộ đọc/ghi `CHAT_HISTORY_KEY` (nếu có) bằng sendMessage:
   - load list: HISTORY_GET_ALL
   - open item: HISTORY_GET_BY_ID
   - clear: HISTORY_CLEAR
2. Error UX VN.

## SOLID Notes
- SRP: UI render tách khỏi data layer.

## Acceptance Criteria
- History UI render từ Supabase data.

## DoD
- Không còn chrome.storage.local usage cho history business data (trừ migration ticket).

## Test Plan
- Playwright: history load + clear.

## Dependencies
- GPT-014

## Risks
- Existing UI logic phụ thuộc local shape; cần adapter mapping.
