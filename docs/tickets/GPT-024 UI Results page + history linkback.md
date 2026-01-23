# GPT-024 UI Results page + history linkback

## Project Context (MUST READ)
Sau khi gửi prompt, UI cần hiển thị kết quả, link mở chat URL, và liên kết tới item trong history. UI không tự lưu result locally.

## Timebox
2–4 giờ.

## Goal
Nâng cấp UI results + integration với history.

## Inputs
- src/ui/results.js
- src/ui/history.js

## Requirements
1. Khi nhận PROMPT_SENT/CHATGPT_OUTPUT_READY:
   - render response
   - show chat_url button
   - show link “View in History” (open history item)
2. Escape HTML.

## SOLID Notes
- SRP: results UI module.

## Acceptance Criteria
- Result renders; link opens.

## DoD
- No XSS.

## Test Plan
- Playwright: render mocked response.

## Dependencies
- GPT-023, GPT-015

## Risks
- UI routing between pages.
