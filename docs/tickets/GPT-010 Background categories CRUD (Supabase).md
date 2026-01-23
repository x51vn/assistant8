# GPT-010 Background categories CRUD (Supabase)

## Project Context (MUST READ)
Categories là dữ liệu user-based trong Supabase. UI gọi background handlers qua message. Không lưu categories trong chrome.storage.local.

## Timebox
2–4 giờ.

## Goal
Implement CRUD categories ở background theo chuẩn middleware.

## Inputs
- MESSAGE_TYPES categories (GPT-006)
- supabaseConfig + requireAuth + supabaseWithRetry

## Requirements
1. Handlers:
   - CATEGORY_GET_ALL → trả list theo user
   - CATEGORY_ADD → validate name non-empty; enforce unique per user
   - CATEGORY_UPDATE → update own row only
   - CATEGORY_DELETE → delete own row only
2. Query phải filter `eq('user_id', userId)` hoặc rely on RLS + still filter to be explicit.
3. Error mapping VN: duplicate name, network.

## SOLID Notes
- SRP: categories handler module chỉ lo categories.
- OCP: thêm field mới (color/icon) không làm thay đổi flow.

## Acceptance Criteria
- CRUD hoạt động end-to-end khi gọi bằng messages.
- Cross-user isolation đúng.

## DoD
- Handler registered in src/background/handlers/index.js.

## Test Plan
- Unit tests: mock supabase responses cho each CRUD.
- Manual: UI call (có thể bằng console sendMessage).

## Dependencies
- GPT-003, GPT-004, GPT-005, GPT-006, GPT-009

## Risks
- Name uniqueness: rely on DB constraint unique(user_id,name) để tránh race.
