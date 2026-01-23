# GPT-033 Unit tests for Supabase utilities + message schema

## Project Context (MUST READ)
Repo có Vitest unit tests. Kiến trúc yêu cầu retry/auth utilities và message contract rõ ràng. SDLC bắt buộc có test coverage cơ bản cho critical utilities.

## Timebox
2–4 giờ.

## Goal
Bổ sung/cập nhật unit tests cho: messageSchema, supabaseWithRetry, requireAuth.

## Inputs
- tests/unit/*
- src/shared/messageSchema.js
- utilities added in GPT-004/005

## Requirements
1. Update messageSchema tests khi thêm MESSAGE_TYPES.
2. Test supabaseWithRetry: retry logic và no-retry.
3. Test requireAuth: returns userId or error response.

## SOLID Notes
- SRP: tests tập trung đúng module.

## Acceptance Criteria
- `npm run test:unit` pass.

## DoD
- Tests deterministic, no real network.

## Test Plan
- Run `npm run test:unit`.

## Dependencies
- GPT-004, GPT-005, GPT-006

## Risks
- Mocking chrome.storage/supabase in ESM; keep helpers.
