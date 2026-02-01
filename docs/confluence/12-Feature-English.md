# Feature: English Learning

## 1) Mục tiêu

- Hỗ trợ user chạy các prompt học tiếng Anh theo topic.
- Lưu lại record đã tạo để quản lý và tái sử dụng.

## 2) Data model

Supabase table: `public.english` (migration 006)
- `id` (UUID)
- `user_id`
- `chat_id` (ChatGPT conversation ID)
- `topic`
- `prompt` (full prompt text)
- `created_at`, `updated_at`

Unique: `(user_id, chat_id)` để hỗ trợ upsert/dedupe.

## 3) Background handler

File: `src/background/handlers/english.js`

- `ENGLISH_GET_ALL` → `ENGLISH_DATA`
  - Response: `{ items: [...] }` (top-level)

- `ENGLISH_ADD` → `ENGLISH_ADDED`
  - Input: `{ chat_id, topic, prompt }`
  - Upsert onConflict: `user_id,chat_id`
  - Response: `{ item }`

- `ENGLISH_DELETE` → `ENGLISH_DELETED`
  - Input: `{ id }`

Tất cả ops:
- `requireAuth()` trước khi query
- `supabaseWithRetry()`

## 4) UI integration

- API module: `src/ui-preact/api/englishApi.js`
  - `fetchEnglishList()`
  - `addEnglish(chatId, topic, prompt)`
  - `deleteEnglish(id)`

English module cũng sử dụng prompt sending flow:
- `sendPromptToChatGPT(prompt, options)` dùng `MESSAGE_TYPES.SEND_PROMPT` (payload-based).
- `getChatGPTOutput()` (polling) dùng `MESSAGE_TYPES.CHATGPT_GET_OUTPUT` để lấy response.

## 5) Privacy

- Khi user gửi prompt, prompt được điền vào ChatGPT tab.
- Record lưu trên Supabase chỉ chứa topic/prompt/chat_id (không tự động scrape thêm dữ liệu).
