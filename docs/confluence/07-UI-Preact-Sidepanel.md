# UI (Preact Side Panel)

## 1) Mounting

- HTML: `src/extension/sidepanel-preact.html`
  - Mount point: `<div id="app"></div>`
  - Loads CSS: `styles-shared.css`, `styles-preact.css`
  - Loads bundle: `./settings-preact.js`

- Entry: `src/ui-preact/settings/index.jsx`
  - Apply system theme classes (`body.dark` / `body.light`) theo `prefers-color-scheme`.
  - Render `<AuthProvider><App/></AuthProvider>`.

## 2) Auth gate & global loading

- `src/ui-preact/App.jsx`
  - Nếu chưa authenticated → show login form.
  - Nếu authenticated → show MainApp.
  - Có global loading overlay (giảm flicker khi auth check/setting load).

- `src/ui-preact/context/AuthContext.jsx` (+ hook `useAuth.js`)
  - Gọi background auth handlers (`SUPABASE_AUTH_CHECK/LOGIN/LOGOUT`).
  - Subscribe auth broadcasts (`AUTH_STATE_CHANGED`, `AUTH_TOKEN_REFRESHED`).
  - Sau khi login có thể load settings.

## 3) Navigation / pages

- `src/ui-preact/components/MainApp.jsx`
  - Điều hướng giữa các module.

Các pages chính:
- `PortfolioPage.jsx`
  - CRUD holdings
  - Trigger update prices
  - Trigger evaluation prompt & collect response

- `AssetsPage.jsx`
  - CRUD assets
  - Hiển thị tổng hợp NetWorthSummary
  - Hiển thị asset cards, modal add/edit

- `HistoryPage.jsx`
  - CRUD chat_history
  - Mở chat_url

- `ErrorsPage.jsx`
  - CRUD errors
  - Mark resolved, notes

- `WritingPage.jsx`
  - Email/social/summarize/rewrite/translate/outline workflows
  - English learning prompt workflow through writing templates

- `JournalPage.jsx`
  - Trade journal CRUD, checklist, metrics, watchlist prefill

- `SettingsPage.jsx`
  - Get/Update/Delete settings (Supabase JSONB)
  - Normalize legacy `config.prompt` → `config.prompts.master`

## 4) UI ↔ Background integration

- Migrated UI API/settings/assets modules call background through `sendRuntimeMessage()`.
- A small explicit allowlist still uses direct `chrome.runtime.sendMessage()` for legacy callback-style flows.
- Response payload được spread trực tiếp (không có `response.data`).

## 5) Styling

- CSS shared: `src/extension/styles-shared.css`
- CSS preact: `src/extension/styles-preact.css`

Theme:
- `index.jsx` sync theo system theme.
- CSS dùng class `body.dark` / `body.light` để đổi palette.
