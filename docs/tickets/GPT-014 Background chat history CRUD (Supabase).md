DONE

# GPT-014 Background chat history CRUD (Supabase)

## Project Context (MUST READ)
Chat history lưu ở Supabase, theo user (user_id + RLS). UI không lưu chat history locally. Background middleware chịu trách nhiệm CRUD.

## Timebox
2–4 giờ.

## Goal
Implement history handlers theo kiến trúc.

## Inputs
- MESSAGE_TYPES history (ARCHITECTURE yêu cầu HISTORY_GET_ALL, HISTORY_GET_BY_ID, HISTORY_ADD, HISTORY_CLEAR)
- Schema chat_history

## Requirements
1. Handlers:
   - HISTORY_GET_ALL: order timestamp desc, limit mặc định 100
   - HISTORY_GET_BY_ID: return 1 item by id
   - HISTORY_ADD: insert prompt/response/chat_id/chat_url/prompt_id/run_id/timestamp
   - HISTORY_CLEAR: delete all history of user (hoặc soft delete nếu có)
2. Validate input tối thiểu (prompt non-empty).
3. Security: update/delete chỉ theo user.

## SOLID Notes
- SRP: history handler module.

## Acceptance Criteria
- UI gọi GET_ALL nhận list đúng.
- CLEAR chỉ ảnh hưởng user hiện tại.

## DoD
- Unit tests cover paths.

## Test Plan
- Unit tests + manual: gửi prompt tạo history row.

## Dependencies
- GPT-003, GPT-004, GPT-005, GPT-006, GPT-009

## Risks
- Clear all có thể tốn; cần batch hoặc limit nếu DB lớn.
