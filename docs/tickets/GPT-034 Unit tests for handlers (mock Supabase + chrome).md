DONE

# GPT-034 Unit tests for handlers (mock Supabase + chrome)

## Project Context (MUST READ)
Background handlers là core business logic orchestration. SDLC yêu cầu test các handler chính để đảm bảo không regression khi SW lifecycle.

## Timebox
2–4 giờ.

## Goal
Add unit tests cho handlers: categories/prompts/history/errors/portfolio.

## Inputs
- src/background/handlers/*
- tests/unit framework

## Requirements
1. Mock supabase client methods: from().select/insert/update/delete.
2. Mock chrome runtime sendMessage/tab APIs nếu needed.
3. Tests:
   - happy path CRUD
   - auth required
   - validation error

## SOLID Notes
- SRP: tests per handler module.

## Acceptance Criteria
- `npm run test:unit` pass.

## DoD
- Key branches covered.

## Test Plan
- Run unit tests.

## Dependencies
- GPT-010, GPT-012, GPT-014, GPT-016, GPT-018

## Risks
- Handler registration side effects; import strategy cần isolate.
