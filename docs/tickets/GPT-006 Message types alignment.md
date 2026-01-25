DONE

# GPT-006 Message types alignment (Prompts/Categories/Auth/Portfolio)

## Project Context (MUST READ)
Kiến trúc dùng message-based communication. UI và background contract qua MESSAGE_TYPES. Hiện codebase còn Firebase message types; kiến trúc yêu cầu Supabase auth + prompt/category CRUD + portfolio price updates.

## Timebox
2–4 giờ.

## Goal
Cập nhật `MESSAGE_TYPES` và tests để phản ánh contract theo kiến trúc, giữ backward compatibility nếu cần.

## Inputs
- src/shared/messageSchema.js
- docs/ARCHITECTURE.md (handlers table + message schema)

## Requirements
1. Add message types:
   - Auth: `SUPABASE_AUTH_LOGIN`, `SUPABASE_AUTH_LOGOUT`, `SUPABASE_AUTH_CHECK` (+ response types)
   - Prompts: `PROMPT_GET_ALL`, `PROMPT_GET_BY_ID`, `PROMPT_ADD`, `PROMPT_UPDATE`, `PROMPT_DELETE`, `PROMPT_SEARCH` (+ response types)
   - Categories: `CATEGORY_GET_ALL`, `CATEGORY_ADD`, `CATEGORY_UPDATE`, `CATEGORY_DELETE` (+ response types)
   - Portfolio: `PORTFOLIO_GET`, `PORTFOLIO_UPDATE_PRICES` (+ response types)
2. Đảm bảo createMessage/createResponse/createErrorResponse vẫn pass tests.
3. Không remove FIREBASE_* trong ticket này (sẽ có tickets cleanup riêng).

## SOLID Notes
- OCP: thêm types mà không phá cấu trúc schema.

## Acceptance Criteria
- Unit tests liên quan message schema pass.
- Không phá existing UI calls.

## DoD
- MESSAGE_TYPES được update + tests update.

## Test Plan
- `npm run test:unit`.

## Dependencies
- GPT-001 (mapping), GPT-002 (build ok)

## Risks
- Naming conflict với existing types (PROMPT_SEND vs PROMPT_ADD…). Cần thống nhất theo kiến trúc, giữ alias nếu cần.
