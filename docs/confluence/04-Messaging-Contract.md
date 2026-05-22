# Messaging Contract (UI ⇄ Background ⇄ Content)

## 1) Schema bắt buộc

Message schema được định nghĩa ở `src/shared/messageSchema.js`.

Mọi message phải có:
- `v`: schema version (hiện tại = 1)
- `type`: từ `MESSAGE_TYPES`
- `correlationId`: trace id
- `timestamp`

Payload conventions:
- UI thường gửi payload trong `data`:
  - `{ v, type, correlationId, timestamp, data: {...} }`
- Một số legacy handler hỗ trợ `payload` (vd `prompt.js` dùng `message.payload || message.data`).

## 2) createMessage / createResponse / createErrorResponse

- `createMessage(type, payload)`:
  - Tạo object với `v/type/correlationId/timestamp` và **spread payload trực tiếp**.

- `createResponse(original, responseType, payload)`:
  - Trả response giữ nguyên `correlationId` của request.
  - **Quan trọng**: response cũng **spread payload trực tiếp**, KHÔNG bọc trong `data`.

Ví dụ:
- Handler trả:
  - `createResponse(msg, MESSAGE_TYPES.PORTFOLIO_DATA, { items })`
- UI nhận:
  - ✅ `response.items`
  - ❌ `response.data.items` (không tồn tại)

- `createErrorResponse(...)`:
  - Trả `type: MESSAGE_TYPES.ERROR` và `error: { code, message, details }`.

## 3) Message router

Background dùng `src/background/messageRouter.js`:
- `registerHandler(type, handlerFn)` đăng ký handler theo message type.
- Router trả error response nếu:
  - Không có handler
  - Handler throw exception
- Có logging slow handler để debug.

## 4) Auth broadcasts

Supabase Auth module (`src/background/handlers/supabaseAuth.js`) phát broadcast:
- `AUTH_STATE_CHANGED` khi SIGNED_IN / SIGNED_OUT
- `AUTH_TOKEN_REFRESHED` khi TOKEN_REFRESHED

UI AuthContext/Hook subscribe runtime messages để cập nhật trạng thái.

## 5) Categories message types (high-level)

- Auth: `SUPABASE_AUTH_LOGIN`, `SUPABASE_AUTH_CHECK`, `SUPABASE_AUTH_LOGOUT`, `AUTH_STATE_CHANGED`, `AUTH_TOKEN_REFRESHED`
- Settings: `SETTINGS_GET`, `SETTINGS_UPDATE`, `SETTINGS_DELETE`
- Portfolio: `PORTFOLIO_GET/ADD/UPDATE/REMOVE/UPDATE_PRICES` (+ evaluate)
- Assets: `ASSETS_GET`, `ASSET_ADD/UPDATE/DELETE`
- Net worth & history: `NET_WORTH_GET`, `ASSET_HISTORY_GET`, `ASSET_SNAPSHOT_CREATE`
- History: `HISTORY_*`, `CHAT_OPEN`
- Errors: `ERROR_*`
- English: `ENGLISH_*`
- ChatGPT automation: `SEND_PROMPT`, `ENSURE_CHATGPT_OPEN`, `CHATGPT_SEND_INPUT`, `CHATGPT_GET_OUTPUT`
- Telemetry: `TELEMETRY_REPORT`

## 6) Backward-compat notes

Một số handler/flow giữ message type cũ để không break UI cũ.
Khi thêm message type mới:
- Bắt buộc thêm vào `MESSAGE_TYPES`
- Bắt buộc tuân schema (v/type/correlationId/timestamp + data)
