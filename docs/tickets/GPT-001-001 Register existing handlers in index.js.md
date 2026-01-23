# GPT-001-001 Register existing handlers in index.js

## Project Context (MUST READ)
Audit phát hiện alarms.js, contextMenu.js, telemetry.js đã tồn tại trong src/background/handlers/ nhưng CHƯA được import/register trong handlers/index.js. MV3 yêu cầu tất cả handlers phải đăng ký top-level sync.

## Parent Ticket
GPT-001 (Baseline audit & Architecture-Code mapping)

## Timebox
30 phút - 1 giờ.

## Goal
Import và kích hoạt các handler modules đã có nhưng chưa được đăng ký.

## Inputs
- src/background/handlers/index.js
- src/background/handlers/alarms.js
- src/background/handlers/contextMenu.js
- src/background/handlers/telemetry.js

## Requirements
1. Add imports trong handlers/index.js:
   ```javascript
   import './alarms.js';
   import './contextMenu.js';
   import './telemetry.js';
   ```
2. Verify các handlers tự đăng ký message types hoặc Chrome API listeners.
3. Test build không bị break.

## SOLID Notes
- SRP: Handlers registration centralized trong index.js.

## Acceptance Criteria
- alarms.js, contextMenu.js, telemetry.js được import.
- Build pass (`npm run build`).

## DoD
- Handlers registration log shows 3 additional handlers.

## Test Plan
- Build và load extension.
- Check background SW console logs.

## Dependencies
- None (prerequisite cho tất cả tickets khác).

## Risks
- telemetry.js có thể có side effects; optional nếu gây lỗi.
