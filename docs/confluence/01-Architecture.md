# Architecture & Design (MV3)

## 1) Extension topology

- **Background Service Worker (MV3)**: middleware trung tâm
  - Nhận message từ UI/content-script
  - Gọi Supabase (Auth + Postgres)
  - Gọi external market data endpoints (SSI/VPS) khi cần
  - Orchestrate automation của ChatGPT tab thông qua `chrome.tabs.*`, `chrome.scripting.*` và content script

- **Side Panel UI (Preact)**
  - UI Auth-gated: hiển thị Login nếu chưa đăng nhập
  - Các page: Dashboard / Portfolio / Market / Watchlist / Assets / Journal / History / Errors / Writing / Jobs / Alerts / Settings
  - Không trực tiếp gọi Supabase; tất cả qua background handlers

- **Content Script (`https://chatgpt.com/*`)**
  - Chỉ xử lý DOM automation, selectors fallback, gửi prompt, lấy response
  - Không chứa business logic; báo lỗi/telemetry về background

## 2) MV3 constraints (bắt buộc)

- Service worker có thể bị suspend bất kỳ lúc nào.
  - Không dựa vào state in-memory.
  - Mọi handler đều phải “stateless + idempotent” khi có thể.

- Listeners phải đăng ký đồng bộ tại top-level:
  - `src/background/index.js` đóng vai trò bootstrapping.

- Tránh `import()` trong background:
  - Vite có thể inject preload helper không tương thích SW.

## 3) Build system & output

Vite build (`vite.config.js`) output:
- `dist/background.js` (từ `src/background/index.js`)
- `dist/content.js` (từ `src/content.js`)
- `dist/settings-preact.js` (từ `src/ui-preact/settings/index.jsx`)

Static assets copy sang `dist/`:
- `src/extension/manifest.json` → `dist/manifest.json`
- `src/extension/sidepanel-preact.html` → `dist/sidepanel-preact.html`
- CSS: `styles-shared.css`, `styles-preact.css`
- `src/extension/prompt-template.md` + `src/prompts/*.md`
- `src/extension/images/*`

## 4) Message-driven architecture

Các context (UI, background, content-script) giao tiếp bằng messages có schema:
- `v`: schema version
- `type`: từ `MESSAGE_TYPES` (`src/shared/messageSchema.js`)
- `correlationId`: trace id
- `timestamp`
- `data`: payload object

Background dùng message router (`src/background/messageRouter.js`) + `registerHandler(type, fn)`.

## 5) Data architecture (Supabase)

- Auth: Supabase Auth
  - Session token persistence qua adapter dùng `chrome.storage.local` (KHÔNG dùng `localStorage` trong SW)

- Postgres tables với `user_id` và RLS:
  - portfolio, watchlist, trade_journal, checklist_templates, chat_history, errors, settings, prompts, categories, runs
  - assets, asset_history, asset_summaries
  - english (legacy records; English learning workflow hiện nằm trong Writing Assistant)

## 6) Observability

- `logger` (module `src/logger.js`) + correlationId cho tracing.
- `supabaseWithRetry` cho retry/backoff.
- Content script có selector telemetry (gửi `TELEMETRY_REPORT`) nhưng hiện không có handler xử lý.

## 7) Deprecated / legacy notes

- File `src/background.js` tồn tại (legacy/không phải entrypoint build hiện tại).
  - Entry chính là `src/background/index.js` (build ra `dist/background.js` theo Vite config).
  - Không nên dùng các pattern lưu business data vào `chrome.storage.local` kiểu legacy.
