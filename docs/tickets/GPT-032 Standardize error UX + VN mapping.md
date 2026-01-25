DONE

# GPT-032 Standardize error UX + VN mapping

## Project Context (MUST READ)
App yêu cầu user-friendly error messages (VN) và retry transient errors. UI không được show raw stack trace; technical details chỉ để debug.

## Timebox
2–4 giờ.

## Goal
Chuẩn hoá error mapping và UI presentation.

## Inputs
- docs/ARCHITECTURE.md error handling
- src/ui/* (alert usage)

## Requirements
1. Define mapping:
   - network → "Không có kết nối internet..."
   - auth 401 → "Phiên đăng nhập hết hạn..."
   - 429 → "Quá nhiều yêu cầu..."
2. Add UI helper: showError(message, details?)
3. Replace direct `alert(error.message)` patterns ở các pages trọng yếu (portfolio/prompts/history/errors).

## SOLID Notes
- SRP: error UI helper module.

## Acceptance Criteria
- Offline/auth expired produce friendly VN.

## DoD
- No raw stack in user visible UI.

## Test Plan
- Manual: disable network; expire session.

## Dependencies
- GPT-004, GPT-005

## Risks
- Over-handling can hide real errors; keep technical logs in console.
