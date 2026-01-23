# GPT-012 Background prompts CRUD + search (Supabase)

## Project Context (MUST READ)
Prompts là thư viện template theo user. UI gọi background handler. Không lưu prompts locally. Prompt có thể liên kết category.

## Timebox
2–4 giờ.

## Goal
Implement prompts CRUD + search ở background.

## Inputs
- MESSAGE_TYPES prompts
- Schema prompts/categories

## Requirements
1. Handlers:
   - PROMPT_GET_ALL (option: join category)
   - PROMPT_GET_BY_ID
   - PROMPT_ADD (validate title/content)
   - PROMPT_UPDATE
   - PROMPT_DELETE
   - PROMPT_SEARCH (title/content ilike)
2. Support fields: title, content, category_id, is_favorite, usage_count.
3. Enforce security: eq('user_id', userId) cho update/delete.
4. Error mapping VN.

## SOLID Notes
- SRP: prompts handler module.
- OCP: add metadata/usage tracking later.

## Acceptance Criteria
- CRUD + search hoạt động; chỉ thấy data của user.

## DoD
- Handlers registered.

## Test Plan
- Unit tests: each handler path.

## Dependencies
- GPT-003, GPT-004, GPT-005, GPT-006, GPT-009

## Risks
- Search query cần escape; prefer Supabase query builder safe methods.
