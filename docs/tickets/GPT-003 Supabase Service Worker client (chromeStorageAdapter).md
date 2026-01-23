# GPT-003 Supabase Service Worker client (chromeStorageAdapter)

## Project Context (MUST READ)
MV3 service worker không có `localStorage`. Kiến trúc yêu cầu Supabase auth token persist qua `chrome.storage.local` bằng adapter. Business data không được lưu local.

## Timebox
2–4 giờ.

## Goal
Tạo module Supabase config cho background service worker dùng chromeStorageAdapter.

## Inputs
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- docs/ARCHITECTURE.md (section Supabase config)

## Requirements
1. Tạo module (ví dụ: `src/supabaseConfig.js`) export `supabase` client.
2. Implement `chromeStorageAdapter` với `getItem/setItem/removeItem`.
3. Set auth options:
   - `persistSession: true`
   - `autoRefreshToken: true`
   - `detectSessionInUrl: false`
4. Không init realtime subscription trong service worker.
5. Static imports only (no dynamic import).

## SOLID Notes
- SRP: module config riêng, không trộn business logic.
- DIP: handlers import `supabase` từ 1 điểm.

## Acceptance Criteria
- Background có thể gọi `await supabase.auth.getUser()` mà không crash do thiếu storage.

## DoD
- Module được import tĩnh trong background.
- Không dùng `localStorage` ở SW.

## Test Plan
- Unit test: mock `chrome.storage.local` và smoke gọi init + `supabase.auth.getUser()` (mock network).

## Dependencies
- GPT-002

## Risks
- Supabase SDK có thể truy cập global crypto; MV3 OK nhưng cần test build.
