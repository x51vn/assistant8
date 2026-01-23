# GPT-029 Remove Firebase handlers + message types cleanup

## Project Context (MUST READ)
Background middleware không còn hỗ trợ Firebase backup/sync. Message types FIREBASE_* phải được loại bỏ sau khi UI không dùng.

## Timebox
2–4 giờ.

## Goal
Remove Firebase handler module + message types (sau khi thay thế bằng Supabase).

## Inputs
- src/background/handlers/firebase.js
- src/shared/messageSchema.js

## Requirements
1. Remove handler import from src/background/handlers/index.js.
2. Remove/retire FIREBASE_* message types (hoặc keep deprecated alias 1 release nếu cần).
3. Update unit tests accordingly.

## SOLID Notes
- SRP: cleanup không đụng business logic.

## Acceptance Criteria
- Build/tests pass; no dead handler.

## DoD
- No firebase messages reachable.

## Test Plan
- `npm run test:unit`, build.

## Dependencies
- GPT-028, GPT-030

## Risks
- UI still references FIREBASE_*; must remove there first.
