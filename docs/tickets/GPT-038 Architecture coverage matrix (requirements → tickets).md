DONE

# GPT-038 Architecture coverage matrix (requirements → tickets)

## Project Context (MUST READ)
User yêu cầu kế hoạch/tickets phải cover 100% kiến trúc (KHÔNG ĐƯỢC BỎ SÓT). Cần 1 crosswalk rõ ràng giữa docs/ARCHITECTURE.md và danh sách tickets GPT-001..N.

## Timebox
2–4 giờ.

## Goal
Tạo matrix/checklist mapping từng requirement/section trong kiến trúc → ticket IDs chịu trách nhiệm.

## Inputs
- docs/ARCHITECTURE.md
- docs/STORAGE_EXPLAINED.md
- docs/tickets/GPT-*.md

## Requirements
1. Liệt kê các mảng chính (must not miss):
   - MV3 constraints (SW lifecycle, top-level listeners, no dynamic import)
   - Message schema + router
   - Auth + user-based data + RLS
   - Storage policy (no business local)
   - Features: prompts, categories, history, errors, portfolio
   - SSI integration + batching + alarms
   - Content script automation
   - Context menu
   - Telemetry/logging
   - Migration from legacy local data
   - Testing (unit + e2e)
   - Manifest permissions/host_permissions
2. Mỗi item phải map ≥ 1 ticket.
3. Identify gaps (nếu có) và đề xuất ticket mới.

## SOLID Notes
N/A.

## Acceptance Criteria
- Có 1 file matrix dễ đọc, chứng minh coverage.

## DoD
- Matrix committed cùng bộ tickets.

## Test Plan
- N/A (doc review).

## Dependencies
- Existence of full ticket set.

## Risks
- Kiến trúc thay đổi; matrix cần cập nhật.
