# GPT-035 E2E Auth Prompts Categories CRUD

## Project Context (MUST READ)
Repo dùng Playwright E2E. Kiến trúc yêu cầu login gate và CRUD prompts/categories. SDLC yêu cầu automated E2E cho critical user journeys.

## Timebox
2–4 giờ.

## Goal
Thêm/điều chỉnh Playwright specs cho auth + prompts/categories.

## Inputs
- tests/e2e/*
- sidepanel UI

## Requirements
1. Test login screen appears when unauthenticated.
2. After login, can create category + prompt + search prompt.
3. Prefer deterministic mocks (mock background responses) thay vì login Supabase thật.

## SOLID Notes
N/A.

## Acceptance Criteria
- `npm run test:e2e` pass.

## DoD
- Tests stable, no flakiness.

## Test Plan
- Run `npm run test:e2e`.

## Dependencies
- GPT-008, GPT-011, GPT-013

## Risks
- Real auth credentials in CI not allowed; must mock.
