# GPT-001 Baseline audit & Architecture-Code mapping

## Project Context (MUST READ)
ChatGPT Assistant là Chrome Extension Manifest V3 (MV3) gồm Side Panel UI ↔ Background Service Worker (middleware) ↔ Supabase (PostgreSQL + Auth). Content script chạy trên chatgpt.com để automation DOM. Yêu cầu kiến trúc: **cloud-first**, **login required**, **user-based data (user_id + RLS)**, **không lưu business data locally**, **realtime chỉ ở UI**, **listeners đăng ký top-level sync**, **không dynamic import trong SW**.

## Timebox
2–4 giờ.

## Goal
Tạo “source of truth” mapping giữa kiến trúc trong docs và codebase hiện tại để làm nền cho toàn bộ refactor/implementation.

## Inputs
- docs/ARCHITECTURE.md
- docs/STORAGE_EXPLAINED.md
- src/shared/messageSchema.js
- src/background/index.js, src/background/messageRouter.js
- src/background/handlers/*
- src/ui/*
- src/extension/manifest.json
- package.json

## Requirements
1. Liệt kê rõ các điểm **đang lệch kiến trúc** (ví dụ: Firebase còn tồn tại, business data lưu chrome.storage.local, thiếu Supabase SDK, thiếu auth gate…).
2. Lập bảng mapping:
   - Message types: hiện có vs cần có theo kiến trúc.
   - Handlers: hiện có vs cần có (prompts/categories/supabase auth/portfolio prices/alarms/migration).
   - Storage: keys đang dùng trong UI/background vs chiến lược mới.
   - Permissions/host_permissions cần thiết.
3. Đưa ra đề xuất quyết định “phổ biến” nếu có ambiguity (ví dụ: email/password auth, limit history 100, retry 3 lần).

## SOLID Notes
- SRP: mapping chỉ phục vụ audit, không trộn implementation.
- OCP: mapping giúp thêm handler/message type mới mà không sửa nhiều nơi.

## Acceptance Criteria
- Có checklist gap rõ ràng, actionable.
- Có list file/symbol liên quan cho từng gap.
- Không tạo code change ngoài việc ghi nhận (nếu cần ghi vào ticket description hoặc ghi chú nội bộ).

## Definition of Done (DoD)
- Bản mapping đầy đủ (đủ để implement các tickets tiếp theo không bị thiếu yêu cầu).
- Các rủi ro lớn được nêu (ví dụ: Playwright tests phụ thuộc UI/DOM; MV3 SW lifecycle).

## Test Plan
- N/A (review và đọc code/docs).

## Dependencies
Không.

## Risks
- Kiến trúc docs có thể “đi trước” code; cần lock các quyết định để tránh scope creep.
