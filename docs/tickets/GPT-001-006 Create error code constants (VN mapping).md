# GPT-001-006 Create error code constants (VN mapping)

## Project Context (MUST READ)
Audit và GPT-032 yêu cầu map technical errors → user-friendly VN messages. Cần centralize error codes và messages để consistent.

## Parent Ticket
GPT-001 (Baseline audit & Architecture-Code mapping)

## Timebox
1 giờ.

## Goal
Create src/shared/errorCodes.js với error constants và VN message mapping.

## Inputs
- docs/ARCHITECTURE.md error handling section
- docs/GPT-001-AUDIT-REPORT.md section 3.3

## Requirements
1. Create src/shared/errorCodes.js:
   ```javascript
   export const ERROR_CODES = {
     // Network
     NETWORK_ERROR: 'NETWORK_ERROR',
     TIMEOUT: 'TIMEOUT',
     
     // Auth
     AUTH_REQUIRED: 'AUTH_REQUIRED',
     AUTH_EXPIRED: 'AUTH_EXPIRED',
     AUTH_INVALID: 'AUTH_INVALID',
     
     // Validation
     INVALID_INPUT: 'INVALID_INPUT',
     DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
     
     // Supabase
     SUPABASE_ERROR: 'SUPABASE_ERROR',
     RLS_VIOLATION: 'RLS_VIOLATION',
     
     // Rate Limiting
     RATE_LIMITED: 'RATE_LIMITED',
   };
   
   export const ERROR_MESSAGES_VN = {
     [ERROR_CODES.NETWORK_ERROR]: 'Không có kết nối internet. Vui lòng kiểm tra mạng.',
     [ERROR_CODES.TIMEOUT]: 'Yêu cầu quá thời gian. Vui lòng thử lại.',
     [ERROR_CODES.AUTH_REQUIRED]: 'Vui lòng đăng nhập để tiếp tục.',
     [ERROR_CODES.AUTH_EXPIRED]: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
     [ERROR_CODES.AUTH_INVALID]: 'Thông tin đăng nhập không hợp lệ.',
     [ERROR_CODES.INVALID_INPUT]: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
     [ERROR_CODES.DUPLICATE_ENTRY]: 'Mục này đã tồn tại.',
     [ERROR_CODES.SUPABASE_ERROR]: 'Lỗi hệ thống. Vui lòng thử lại sau.',
     [ERROR_CODES.RLS_VIOLATION]: 'Bạn không có quyền truy cập.',
     [ERROR_CODES.RATE_LIMITED]: 'Quá nhiều yêu cầu. Vui lòng đợi và thử lại.',
   };
   
   export function getUserFriendlyMessage(errorCode, fallback = 'Đã có lỗi xảy ra.') {
     return ERROR_MESSAGES_VN[errorCode] || fallback;
   }
   ```
2. Update src/types.js nếu có ERROR_CODES cũ.

## SOLID Notes
- SRP: Error codes/messages centralized.

## Acceptance Criteria
- errorCodes.js exists với full mapping.
- Importable trong handlers và UI.

## DoD
- Used in at least 1 handler as example.

## Test Plan
- Import và test getUserFriendlyMessage().

## Dependencies
- Prerequisite cho GPT-004, GPT-032.

## Risks
- None.
