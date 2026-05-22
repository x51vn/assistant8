# Legacy Feature: English Learning

## 1) Mục tiêu

- Module này là legacy path cho record học tiếng Anh cũ.
- Workflow học tiếng Anh hiện tại nằm trong `WritingPage.jsx` qua Writing Assistant templates (`english_learning`).
- Không còn là primary navigation page.

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

Current primary UI:
- `src/ui-preact/pages/WritingPage.jsx`
- `src/ui-preact/api/writingApi.js`
- `WRITING_TEMPLATE_KEYS.ENGLISH_LEARNING`

Legacy English module từng sử dụng prompt sending flow:
- `sendPromptToChatGPT(prompt, options)` dùng `MESSAGE_TYPES.SEND_PROMPT` (payload-based).
- `getChatGPTOutput()` polling qua `MESSAGE_TYPES.CHATGPT_GET_OUTPUT`; không phải path khuyến nghị cho provider routing mới.

## 5) Privacy

- Khi user gửi prompt, prompt được điền vào ChatGPT tab.
- Record lưu trên Supabase chỉ chứa topic/prompt/chat_id (không tự động scrape thêm dữ liệu).
