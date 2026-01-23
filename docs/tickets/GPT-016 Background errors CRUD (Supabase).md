# GPT-016 Background errors CRUD (Supabase)

## Project Context (MUST READ)
Errors (retrospective tracking) lưu ở Supabase theo user. UI chỉ gọi background middleware.

## Timebox
2–4 giờ.

## Goal
Implement error CRUD handlers theo schema Supabase.

## Inputs
- MESSAGE_TYPES error
- Schema errors

## Requirements
1. Handlers:
   - ERROR_GET_ALL: list newest first
   - ERROR_ADD: validate title
   - ERROR_UPDATE: update resolved/severity/type/description
   - ERROR_DELETE
2. Security: only own rows.
3. VN error messages; include technical details in `details`.

## SOLID Notes
- SRP: errors handler module.

## Acceptance Criteria
- CRUD works; isolation ok.

## DoD
- Unit tests.

## Test Plan
- Unit + manual UI.

## Dependencies
- GPT-003, GPT-004, GPT-005, GPT-006, GPT-009

## Risks
- Schema mismatch với UI existing fields.
