# GPT-008 UI auth gate + login UX

## Project Context (MUST READ)
App bắt buộc login. Side panel UI không gọi Supabase trực tiếp cho business ops; UI gọi background auth handlers. Khi chưa login: chỉ hiển thị login screen.

## Timebox
2–4 giờ.

## Goal
Tạo auth gate trong UI: login/logout + state rendering.

## Inputs
- src/ui/index.js, src/ui/navigation.js, src/ui/status.js
- MESSAGE_TYPES auth

## Requirements
1. On UI load:
   - call `SUPABASE_AUTH_CHECK`
   - nếu not authenticated → render login screen
   - nếu authenticated → render normal UI
2. Login form:
   - fields: email/password
   - on submit → send `SUPABASE_AUTH_LOGIN`
3. Logout action (settings/menu): send `SUPABASE_AUTH_LOGOUT`
4. Error UX: hiển thị VN message; không show raw stack.

## SOLID Notes
- SRP: auth UI module riêng.
- ISP: UI modules gọi “auth API” (message wrapper) thay vì biết chi tiết supabase.

## Acceptance Criteria
- Fresh install/open side panel → login required.
- Login success → app usable.
- Logout → quay lại login.

## DoD
- No password stored locally.
- UI doesn’t break existing navigation.

## Test Plan
- Playwright: mock background responses cho auth.
- Manual: extension side panel.

## Dependencies
- GPT-007

## Risks
- UI hiện có nhiều modules; cần minimal intrusive integration.
