# Build / Test / Release

## 1) Prerequisites

- Node.js (ESM)
- Supabase project + credentials

Environment variables (build-time validation trong `vite.config.js`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Các file mẫu:
- `.env.example`
- `.env.template`

## 2) Build

Scripts (package.json):
- `npm run build`
- `npm run build:watch`

Vite outputs:
- `dist/background.js`
- `dist/content.js`
- `dist/settings-preact.js`
- `dist/manifest.json` + static assets copy

Build-time guard:
- Vite plugin `validate-required-env` sẽ fail build nếu thiếu env hoặc dùng placeholder.

## 3) Load extension (local)

- Chrome → `chrome://extensions`
- Enable Developer Mode
- Load unpacked → chọn folder `dist/`

Service worker debug:
- `chrome://extensions` → extension → “Service worker” → Inspect

## 4) Tests

Unit tests (Vitest + happy-dom):
- `npm run test:unit`

E2E tests (Playwright):
- `npm run test:e2e`
- `npm run test:e2e:ui`
- `npm run test:e2e:headed`
- `npm run test:e2e:debug`

Config:
- `vitest.config.js`
- `playwright.config.js` (tests ở `tests/e2e`)

## 5) Supabase migrations

- SQL migrations nằm ở `supabase/migrations/`.
- Apply theo thứ tự số.

Checklist:
- RLS enabled cho tất cả tables
- `english` table có migration 006
- `errors` schema aligned (migration 007)

## 6) Release notes

- Manifest version hiện tại: 1.0.0 (`src/extension/manifest.json`)
- Nếu publish Web Store cần:
  - đảm bảo permissions tối thiểu
  - privacy disclosure khớp hành vi thực tế
  - tránh remote scripts (hiện có remote CSS Font Awesome — cân nhắc bundle local nếu cần)
