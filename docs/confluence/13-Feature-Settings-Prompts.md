# Feature: Settings & Prompt Templates

## 1) Mục tiêu

- Cấu hình hệ thống (flags, intervals, prompt templates) lưu trên Supabase.
- Cung cấp các prompt template cho:
  - Master prompt
  - Portfolio prompt
  - Stock evaluation prompt
  - Tea stock prompt
  - Context menu prompt
  - English prompt

## 2) Data model

Supabase table: `public.settings`
- primary key: `user_id`
- `config` JSONB

Config shape (hiện tại, normalized):
```json
{
  "autoRun": false,
  "evaluatePrevious": false,
  "reviewPrompt": false,
  "realtimeEnabled": false,
  "interval": 5,
  "prompts": {
    "master": "...",
    "portfolio": "...",
    "stockEval": "...",
    "teaStock": "...",
    "contextMenu": "Hãy phân tích nội dung sau:\n\n{CONTENT}",
    "english": "..."
  }
}
```

Legacy format:
- `config.prompt` (cũ) được normalize sang `config.prompts.master`.

## 3) Background handler

File: `src/background/handlers/settings.js`

- `SETTINGS_GET` → `SETTINGS_DATA`
  - Nếu chưa có record: trả `{ config: {} }`.
  - Normalize legacy `config.prompt` → `config.prompts.master` trong response.

- `SETTINGS_UPDATE` → `SETTINGS_UPDATED`
  - Upsert theo `user_id`.
  - Chấp nhận legacy `config.prompt` và normalize trước khi save.

- `SETTINGS_DELETE` → `SETTINGS_DELETED`

## 4) UI integration

- Signals state: `src/ui-preact/state/settingsState.js` (các signal values cho prompts/flags/interval).
- API module: `src/ui-preact/api/settingsApi.js`
  - `loadSettings()` đọc `SETTINGS_GET` và populate signals.
  - `saveSettings()` gửi `SETTINGS_UPDATE`.
  - `sendPromptNow()` dùng `SEND_PROMPT` để gửi master prompt sang ChatGPT.
  - `deleteSettings()` gọi `SETTINGS_DELETE`.

## 5) Prompt templates trong repo

- Wrapper template:
  - `src/extension/prompt-template.md` (placeholder: `{{userPrompt}}`)

- Evaluation prompt:
  - `src/prompts/evaluation.md`

- Retrospective prompt:
  - `src/prompts/retrospective.md`

Các file này được copy sang `dist/` và publish dưới dạng web_accessible_resources (`prompts/*.md`).
