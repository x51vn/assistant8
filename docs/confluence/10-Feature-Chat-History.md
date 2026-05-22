# Feature: Chat History

## 1) Mục tiêu

- Lưu lịch sử prompt/response gắn với ChatGPT conversation (`chat_id`, `chat_url`).
- Cho phép xem/xoá/clear lịch sử trong UI.

## 2) Data model

Supabase table: `public.chat_history` (migration 001 + 002)
- `chat_id` (nullable theo migration 002)
- `chat_url`
- `prompt` (required)
- `response` (nullable)
- `timestamp` (bigint milliseconds)
- Optional: `prompt_id`, `run_id`, `metadata` JSONB

Unique constraint (logic):
- User + chat_id unique khi chat_id không null.

## 3) Background handlers

File: `src/background/handlers/chatHistory.js`

- `HISTORY_GET_ALL` → `HISTORY_LIST`
  - payload: `{ limit }` (cap bởi `MAX_CHAT_HISTORY`)
  - response: `{ history: [...] }`

- `HISTORY_ADD` → `HISTORY_ADDED`
  - payload: `{ prompt, response, chat_id, chat_url, prompt_id, run_id }`
  - Cho phép lưu khi `chat_id` null (content script not ready), có thể update sau.

- `HISTORY_UPDATE` → `HISTORY_UPDATED`
  - Update bằng `id` hoặc `chat_id`.
  - Thường dùng để fill `response`/`chat_url` sau khi có output.

- `HISTORY_DELETE` → `HISTORY_DELETED`
- `HISTORY_CLEAR` → `HISTORY_CLEARED`

## 4) UI integration

- UI layer có API module: `src/ui-preact/api/historyApi.js`
  - `fetchHistory(limit)` dùng `HISTORY_GET_ALL`
  - `deleteHistory(id)` dùng `HISTORY_DELETE`
  - `clearAllHistory()` dùng `HISTORY_CLEAR`
  - `openChat(chatUrl)` mở tab mới (không qua background)

## 5) Error handling

- Background:
  - `requireAuth()`
  - `supabaseWithRetry()`
  - Map lỗi network (“Failed to fetch”) → message thân thiện.

- UI:
  - `extractError(response)` xử lý cả `response.errorCode` và `response.error`.
