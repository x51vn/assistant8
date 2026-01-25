DONE

# GPT-004 supabaseWithRetry utility

## Project Context (MUST READ)
Background middleware gọi Supabase cho mọi CRUD. Kiến trúc yêu cầu retry transient errors (network/5xx) với exponential backoff, không retry 4xx.

## Timebox
2–4 giờ.

## Goal
Tạo utility `supabaseWithRetry(operation, maxRetries=3)` và dùng cho các handler Supabase.

## Inputs
- docs/ARCHITECTURE.md (retry pattern)

## Requirements
1. Implement exponential backoff: delay = 1000ms * 2^i (hoặc tương tự).
2. Không retry lỗi 4xx (400–499).
3. Propagate lỗi cuối cùng sau maxRetries.
4. Không log PII; log minimal context + correlationId.

## SOLID Notes
- SRP: retry là utility riêng.
- OCP: dễ thay đổi policy retry mà không sửa handler.

## Acceptance Criteria
- Unit tests cover:
  - Retry khi operation throw network error.
  - Retry khi error.status >= 500.
  - Không retry khi status 401/403/404.

## DoD
- Utility được dùng trong ít nhất 1 handler mẫu (hoặc wired for upcoming tickets).

## Test Plan
- `npm run test:unit`.

## Dependencies
- GPT-002, GPT-003

## Risks
- Backoff quá lớn gây chậm UI; keep maxRetries nhỏ.
