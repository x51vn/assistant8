# ChatGPT Assistant — Full Project Documentation

> Mục tiêu của bộ tài liệu này: mô tả **đầy đủ** tính năng + thiết kế + chi tiết kỹ thuật của dự án ChatGPT Assistant (Chrome Extension MV3) để onboarding dev/QA và làm tài liệu triển khai.

## 1) Big picture

ChatGPT Assistant là Chrome MV3 extension (side panel) tích hợp:

- **Tương tác ChatGPT**: tự động mở tab `https://chatgpt.com`, gửi prompt, lấy response.
- **Quản lý Portfolio chứng khoán**: lưu holdings trên Supabase, cập nhật giá định kỳ (market hours) thông qua `chrome.alarms` và SSI/VPS market data.
- **Chat history & retrospective**: lưu prompt/response/chat_url, chạy retrospective prompts.
- **Error retrospective tracking**: lưu và quản lý lỗi (severity/type/resolution).
- **Tài sản & Net worth**: quản lý danh mục tài sản (cash/savings/real_estate/crypto/gold/vehicle/other/debt), history và tổng hợp net worth.
- **English learning module**: lưu “topic + prompt” gắn với `chat_id` của ChatGPT.
- **Settings management**: cấu hình dạng JSONB lưu trên Supabase.
- **Context menu “Phân tích”**: right-click selection/page → tạo prompt → gửi sang ChatGPT.

## 2) Kiến trúc tổng thể

Luồng chính:

```
Side Panel UI (Preact)  ── chrome.runtime.sendMessage ─▶  Background Service Worker
       ▲                                                          │
       │                                                          ▼
       └──────────── auth state broadcasts ◀────────── Supabase (Auth + Postgres)

Content Script (chatgpt.com)  ◀── chrome.tabs.sendMessage / scripting.executeScript ── Background
```

Các nguyên tắc thiết kế quan trọng (MV3):
- **Background SW event-driven**: có thể terminate bất kỳ lúc nào → không giữ state in-memory.
- **Listeners đăng ký đồng bộ** ở top-level entry (`src/background/index.js`).
- **Không dynamic import** trong background.
- **Business data lưu trên Supabase**; `chrome.storage.local` chỉ dùng cho Supabase auth token thông qua adapter.

## 3) Tech stack & thư viện

- Extension: Chrome MV3, Side Panel, Content Script, Alarms, Context Menus
- UI: Preact (compat React), happy-dom for unit tests
- Build: Vite
- DB/Auth: Supabase JS Client + Supabase Postgres + RLS
- E2E: Playwright

## 4) Entry points quan trọng

- Manifest: `src/extension/manifest.json`
- Side panel HTML: `src/extension/sidepanel-preact.html` (mount `#app`)
- UI bundle entry: `src/ui-preact/settings/index.jsx` → `<AuthProvider><App/></AuthProvider>`
- Background service worker entry: `src/background/index.js` (build ra `dist/background.js`)
- Content script: `src/content.js` (build ra `dist/content.js`, inject trên `https://chatgpt.com/*`)

## 5) Danh sách module/tính năng (để tham chiếu)

- Authentication: Supabase Auth handlers (`src/background/handlers/supabaseAuth.js`)
- Settings (Supabase JSONB): `src/background/handlers/settings.js`
- Portfolio: `src/background/handlers/portfolio.js` + market data utils (`src/background/utils/ssiPriceFetcher.js`, `src/market-data/*`)
- Assets + Net Worth: `src/background/handlers/assets.js`, `src/background/handlers/netWorth.js`
- Chat history: `src/background/handlers/chatHistory.js`
- Error tracking: `src/background/handlers/errorTracking.js`
- English: `src/background/handlers/english.js`
- Prompt sending / ChatGPT tab automation: `src/background/handlers/prompt.js`, `src/background/handlers/chatgpt.js`, `src/chatgptSession.js`, `src/content.js`
- Context menu analysis: `src/background/handlers/contextMenu.js`
- Alarms: `src/background/handlers/alarms.js` + alarms setup in `src/background/index.js`

## 6) Confluence publishing plan

Bộ file trong `docs/confluence/` được viết để có thể copy/paste hoặc publish thành:
- 1 trang cha: **ChatGPT Assistant — Full Documentation**
- Các trang con: Architecture, Messaging Contract, Supabase DB, từng Feature, Build/Test, Troubleshooting, Privacy/Permissions

Khi publish lên Confluence cần:
- `space_key`
- `parent_id` (tuỳ chọn, nếu muốn đặt dưới một trang có sẵn)
