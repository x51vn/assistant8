DONE

# GPT-019 UI Portfolio refactor to middleware

## Project Context (MUST READ)
UI portfolio không được lưu portfolio trong chrome.storage.local. UI phải fetch/modify qua background middleware và Supabase.

## Timebox
2–4 giờ.

## Goal
Refactor portfolio UI để dùng message calls thay vì local storage.

## Inputs
- src/ui/portfolio.js
- MESSAGE_TYPES portfolio

## Requirements
1. Replace load/save portfolio operations with:
   - PORTFOLIO_GET
   - PORTFOLIO_ADD
   - PORTFOLIO_UPDATE
   - PORTFOLIO_REMOVE
2. Maintain existing UI behaviors (modal, validation messages).
3. Keep realtime market updates mechanism, but data source is Supabase.

## SOLID Notes
- SRP: UI render tách data persistence.

## Acceptance Criteria
- Portfolio UI render từ Supabase, add/update/remove ok.

## DoD
- Không còn write portfolio business data to chrome.storage.local.

## Test Plan
- Playwright: add stock, edit, delete.

## Dependencies
- GPT-018

## Risks
- UI hiện sử dụng field names (code/entryPrice); cần adapter map.
