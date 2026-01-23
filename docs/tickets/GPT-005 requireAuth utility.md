# GPT-005 requireAuth utility

## Project Context (MUST READ)
Hệ thống bắt buộc login và quản lý dữ liệu theo user. Mọi handler Supabase phải kiểm tra auth và lấy user_id từ session trước khi thao tác DB. RLS sẽ enforce nhưng handler vẫn cần fail fast và trả lỗi thân thiện.

## Timebox
2–4 giờ.

## Goal
Tạo `requireAuth(message)` để dùng trong background handlers.

## Inputs
- src/shared/messageSchema.js (createErrorResponse)
- src/supabaseConfig.js (supabase client)

## Requirements
1. `requireAuth(message)`:
   - gọi `supabase.auth.getUser()`
   - nếu có user → return user.id
   - nếu không → return/throw error response chuẩn: `AUTH_REQUIRED` (hoặc code tương đương) và message VN.
2. Không làm lộ technical error cho UI (đưa vào `details.technicalError` nếu cần).

## SOLID Notes
- SRP: auth check tách khỏi CRUD.
- ISP: handler chỉ cần userId, không cần biết auth internals.

## Acceptance Criteria
- Các unit test cover:
  - no session → trả error response đúng shape
  - has session → return userId

## DoD
- Utility được dùng trong ít nhất 1 handler mẫu.

## Test Plan
- `npm run test:unit`.

## Dependencies
- GPT-003

## Risks
- supabase.auth.getUser() có thể throw khi token invalid; cần map lỗi rõ.
