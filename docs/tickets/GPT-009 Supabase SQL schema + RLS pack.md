# GPT-009 Supabase SQL schema + RLS pack

## Project Context (MUST READ)
Dự án dùng Supabase PostgreSQL làm source of truth. Tất cả bảng business data phải có `user_id` và bật RLS với policy `auth.uid() = user_id`. Đây là nền tảng bảo mật multi-user.

## Timebox
2–4 giờ.

## Goal
Chuẩn bị gói SQL để tạo schema + indexes + bật RLS policies đúng theo kiến trúc.

## Inputs
- docs/ARCHITECTURE.md (Database schema + RLS section)
- Supabase SQL editor access

## Requirements
1. SQL tạo tables (nếu chưa có):
   - prompts, categories, chat_history, portfolio, errors, settings, runs
2. Add indexes như kiến trúc (user_id + timestamp, favorites, prompt_id, …).
3. Enable RLS trên tất cả tables.
4. Create policies SELECT/INSERT/UPDATE/DELETE cho từng table, scope `auth.uid() = user_id`.
5. Idempotency cơ bản: dùng `IF NOT EXISTS` khi hợp lý, hoặc hướng dẫn “run once”.

## SOLID Notes
- SRP: ticket chỉ làm DB setup, không trộn code.

## Acceptance Criteria
- Chạy SQL trong Supabase thành công.
- Test bằng 2 user: user A không đọc được data user B (RLS chặn).

## DoD
- Script SQL hoàn chỉnh và có hướng dẫn apply.

## Test Plan
- Manual:
  - Apply SQL
  - Insert 1 row bằng user A, verify user B không thấy

## Dependencies
- GPT-001

## Risks
- Nếu schema đã tồn tại khác chút, cần migration SQL (alter) cẩn thận.
