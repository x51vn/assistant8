DONE

# GPT-025 UI Supabase Realtime subscriptions + fallback polling

## Project Context (MUST READ)
Kiến trúc bắt buộc: Realtime subscriptions KHÔNG chạy trong service worker (unstable WebSocket). Nếu cần realtime, phải init trong UI side panel (persistent context) bằng Supabase UI client. Có fallback polling khi realtime fail.

## Timebox
2–4 giờ.

## Goal
Add realtime subscription (ưu tiên portfolio) trong UI.

## Inputs
- Supabase URL/anon key
- UI lifecycle modules

## Requirements
1. Create UI Supabase client (UI context có localStorage).
2. On authenticated user:
   - subscribe `postgres_changes` for portfolio table filter user_id
   - update UI on INSERT/UPDATE/DELETE
3. If subscription fails within 5s: fallback polling every 10s via PORTFOLIO_GET.
4. Cleanup on unload.

## SOLID Notes
- SRP: realtime module riêng.

## Acceptance Criteria
- Update in DB triggers UI update without manual refresh.

## DoD
- No realtime init in background.

## Test Plan
- Manual: open 2 panels or simulate update.

## Dependencies
- GPT-008, GPT-018

## Risks
- Free tier realtime limits; handle gracefully.
