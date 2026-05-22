# Background Service Worker (MV3)

## 1) Vai trò

Background SW là “middleware” trung tâm:
- Nhận message từ UI và content script
- Chạy Supabase calls (Auth + DB)
- Điều phối ChatGPT automation qua `ChatGPTSession` và content script
- Chạy job định kỳ qua `chrome.alarms`
- Tạo context menu và xử lý click

Entry chính: `src/background/index.js` (build ra `dist/background.js`).

## 2) Lifecycle: session restore

`src/background/index.js` có các cơ chế restore session để tránh mất login khi:
- Browser restart
- Service worker restart

Các hàm:
- `restoreSessionOnStartup()`
- `restoreSessionOnServiceWorkerStart()`

Cả hai gọi `supabase.auth.getSession()` để đọc session từ `chrome.storage.local` (qua Supabase storage adapter), sau đó broadcast `AUTH_STATE_CHANGED` nếu UI đang mở.

**Important**: broadcast `chrome.runtime.sendMessage(...)` có thể fail nếu UI không mở (Receiving end does not exist) → code catch và ignore.

## 3) Alarm setup

- `setupAlarms()` tạo alarm định kỳ
  - Clear/cleanup legacy alarms
  - Tạo alarm CHECK mỗi 5 phút
  - Alarm AUTORUN được tạo bởi settings handler (khi user bật auto-run) để tránh đọc legacy storage.

Handler alarm logic: `src/background/handlers/alarms.js`
- Price update chỉ chạy trong market hours (VN: 9h–15h).
- Alarm `PORTFOLIO_UPDATE_PRICES` gửi message tới portfolio handler để cập nhật giá.

## 4) Context menus

- `createContextMenus()` tạo menu:
  - id: `chatgpt-assistant-analyze`
  - title: `ChatGPT Assistant - Phân tích`
  - contexts: selection/page

- Click handler: `src/background/handlers/contextMenu.js`
  - Lấy prompt template từ Supabase settings (`config.prompts.contextMenu`) hoặc default.
  - Nếu có selection → dùng selection text.
  - Nếu không → executeScript extract page content (có logic đặc thù Facebook để lọc UI text).
  - Replace `{CONTENT}` và gửi prompt sang ChatGPT bằng `ChatGPTSession`.

## 5) Message routing & handlers

- Router: `src/background/messageRouter.js`
  - registry `registerHandler(type, fn)`
  - default PING handler
  - error wrapping + slow handler logs

Handlers (theo folder `src/background/handlers/`):
- `supabaseAuth.js`: login/logout/check + auth state broadcasts
- `settings.js`: get/update/delete settings (Supabase)
- `portfolio.js`: CRUD + update prices
- `assets.js`: asset CRUD
- `netWorth.js`: compute net worth + breakdown + snapshot history
- `chatHistory.js`: history CRUD + open chat
- `errorTracking.js`: errors CRUD
- `english.js`: english records CRUD
- `prompt.js` + `chatgpt.js`: prompt/ChatGPT operations (legacy + new)
- `alarms.js`: handle alarms
- `contextMenu.js`: context menu click
- `content.js` + `contentScriptReady.js`: content script readiness / extraction

## 6) Error handling & retry

- `requireAuth(message)` dùng để bắt buộc user login trước DB ops.
- `supabaseWithRetry(operation, opts)` retry transient errors với exponential backoff.
- `createErrorResponse` trả standardized error object.

## 7) Storage keys

- `chrome.storage.local`: chỉ dùng bởi Supabase Auth storage adapter để persist session token.
- Không lưu business data vào local storage (portfolio/assets/history/errors/settings lưu ở Supabase).
