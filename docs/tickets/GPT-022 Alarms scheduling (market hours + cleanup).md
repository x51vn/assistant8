DONE

# GPT-022 Alarms scheduling (market hours + cleanup)

## Project Context (MUST READ)
MV3 background phải đăng ký listeners top-level sync. Kiến trúc yêu cầu alarms: update stock prices mỗi 5 phút trong giờ thị trường VN, và daily cleanup.

## Timebox
2–4 giờ.

## Goal
Implement/adjust alarms handler theo kiến trúc.

## Inputs
- src/background/handlers/alarms.js
- Handler PORTFOLIO_UPDATE_PRICES

## Requirements
1. OnInstalled:
   - create alarm `updateStockPrices` periodInMinutes=5
   - create alarm `dailyCleanup` at next midnight (period 1440)
2. OnAlarm:
   - if updateStockPrices: check market hours (9:00–15:00 VN) trước khi trigger handler
   - if dailyCleanup: cleanup policy (phổ biến): keep last 100 chat_history, remove resolved errors older than 30 days (nếu implement)
3. Không giữ in-memory state.

## SOLID Notes
- SRP: scheduling tách khỏi update handler.

## Acceptance Criteria
- Alarms created và handler runs only in market hours.

## DoD
- Manual verification logs.

## Test Plan
- Manual: inspect SW, simulate alarm by temporarily setting short period.

## Dependencies
- GPT-021

## Risks
- Timezone: use Intl or offset; document assumption VN timezone.
