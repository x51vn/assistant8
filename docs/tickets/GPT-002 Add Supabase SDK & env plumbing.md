# GPT-002 Add Supabase SDK & env plumbing

## Project Context (MUST READ)
ChatGPT Assistant là MV3 extension theo mô hình UI → Background middleware → Supabase. Không gọi Supabase trực tiếp từ UI cho business operations. Auth token persist qua chrome.storage.local adapter trong service worker.

## Timebox
2–4 giờ.

## Goal
Thêm Supabase SDK và chuẩn hoá env config cho build Vite.

## Inputs
- Supabase Project URL (VITE_SUPABASE_URL)
- Supabase anon key (VITE_SUPABASE_ANON_KEY)
- package.json, vite.config.js

## Requirements
1. Add dependency `@supabase/supabase-js`.
2. Chuẩn hoá env keys theo Vite: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Không thay đổi luồng business data trong ticket này (chỉ plumbing).
4. Không đưa secrets vào repo.

## SOLID Notes
- SRP: ticket chỉ xử lý dependencies/config.
- DIP: các module sau sẽ depend vào abstraction (supabaseConfig module), không rải createClient khắp nơi.

## Acceptance Criteria
- `npm run build` thành công.
- Không lỗi import do ESM (`type: module`).

## DoD
- Dependency có trong package-lock/yarn lock (tuỳ hệ).
- Env keys được document ngắn trong README (hoặc hướng dẫn nội bộ) để dev setup.

## Test Plan
- Run `npm run build`.

## Dependencies
- GPT-001 (audit xác nhận repo đang thiếu supabase).

## Risks
- Nếu repo đang dùng Firebase-only, việc thêm supabase không break build nhưng cần tránh unused warnings.
