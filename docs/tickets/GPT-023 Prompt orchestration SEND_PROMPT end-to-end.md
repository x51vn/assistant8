DONE

# GPT-023 Prompt orchestration SEND_PROMPT end-to-end

## Project Context (MUST READ)
User gửi prompt (từ template hoặc free text) → background đảm bảo ChatGPT tab mở → content script input + send → lấy output ổn định → lưu chat_history vào Supabase (user-based) → UI hiển thị result.

## Timebox
2–4 giờ.

## Goal
Hoàn thiện flow orchestration giữa UI ↔ background ↔ content script ↔ Supabase.

## Inputs
- src/background/handlers/prompt.js, chatgpt.js, content.js handler
- src/content.js DOM automation
- chat_history schema

## Requirements
1. `SEND_PROMPT` handler:
   - ensure ChatGPT tab open (ENSURE_CHATGPT_OPEN)
   - send input to content script
   - poll/get output with timeout
   - save history row with prompt_id optional
2. Timeout safety và error mapping VN.
3. CorrelationId tracing.

## SOLID Notes
- SRP: orchestration handler không chứa DOM selectors.

## Acceptance Criteria
- Manual run: gửi prompt → nhận response → history row inserted.

## DoD
- Unit tests for orchestration (mock chrome.tabs messaging) nếu feasible.

## Test Plan
- Manual with real chatgpt.com.

## Dependencies
- GPT-014, GPT-007

## Risks
- Selectors fragile; content script cần fallback.
