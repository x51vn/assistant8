# GPT-028 Remove Firebase dependency from build

## Project Context (MUST READ)
Kiến trúc đã chuyển sang Supabase. Firebase không còn là backend. Repo hiện vẫn có dependency firebase và modules firebaseService/config.

## Timebox
2–4 giờ.

## Goal
Gỡ dependency firebase khỏi package.json và đảm bảo build không còn kéo firebase.

## Inputs
- package.json
- src/firebaseConfig.js, src/firebaseService.js

## Requirements
1. Remove firebase dependency.
2. Ensure no imports remain that break build.
3. Nếu cần, tạm stub các modules (short-lived) nhưng ưu tiên remove clean.

## SOLID Notes
- SRP: ticket chỉ gỡ dependency/build.

## Acceptance Criteria
- `npm run build` pass.

## DoD
- No firebase in dependency tree.

## Test Plan
- Build.

## Dependencies
- GPT-001

## Risks
- UI/handlers còn dùng firebase; cần follow-up tickets.
