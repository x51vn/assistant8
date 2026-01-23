# GPT-030 Remove Firebase UI flows (backup/sync) + wiring

## Project Context (MUST READ)
Kiến trúc cloud-first Supabase không cần backup/sync qua Firebase. UI phải bỏ các nút/flows liên quan Firebase và thay bằng Supabase source-of-truth.

## Timebox
2–4 giờ.

## Goal
Gỡ Firebase UI flows và đảm bảo UX không còn nhắc Firebase.

## Inputs
- src/ui/backup.js, src/ui/sync.js, settings UI

## Requirements
1. Remove UI actions gọi FIREBASE_* messages.
2. Update navigation/pages để không show Firebase tabs.
3. Replace messaging/labels phù hợp Supabase.

## SOLID Notes
- SRP: UI cleanup.

## Acceptance Criteria
- UI không còn Firebase.

## DoD
- No dead code paths.

## Test Plan
- Playwright smoke open settings.

## Dependencies
- GPT-008

## Risks
- Existing tests might assert on backup UI.
