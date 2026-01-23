# GPT-036 E2E Portfolio CRUD price refresh

## Project Context (MUST READ)
Portfolio là 1 feature chính. Kiến trúc yêu cầu CRUD Supabase + SSI price updates (manual/alarm). E2E nên cover add stock + refresh prices.

## Timebox
2–4 giờ.

## Goal
Playwright specs cho portfolio CRUD và refresh prices.

## Inputs
- tests/e2e/portfolio.spec.js
- UI portfolio page

## Requirements
1. Add stock entry.
2. Trigger refresh prices (mock SSI response hoặc mock background handler).
3. Verify UI updates.

## SOLID Notes
N/A.

## Acceptance Criteria
- E2E pass without real SSI network.

## DoD
- No flaky waits; use locator assertions.

## Test Plan
- Run `npm run test:e2e`.

## Dependencies
- GPT-019, GPT-021

## Risks
- Realtime/polling may interfere; disable in tests or mock timers.
