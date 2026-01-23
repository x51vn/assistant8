# GPT-007-002 Add password strength validation

## Project Context (MUST READ)
SUPABASE_AUTH_LOGIN handler checks password is non-empty but doesn't validate strength. Supabase enforces rules on signup, but login has no client-side validation.

## Parent Ticket
GPT-007 (Background Supabase auth handlers)

## Priority
P2 (Nice-to-have for better UX)

## Timebox
15 minutes

## Goal
Add minimum password length validation to provide clear error messages early.

## Inputs
- src/background/handlers/supabaseAuth.js (SUPABASE_AUTH_LOGIN handler)
- src/shared/errorCodes.js

## Requirements
1. Add minimum password length check (6 characters)
2. Return INVALID_INPUT with Vietnamese message
3. Test short and valid passwords

## Current Code
```javascript
// Only checks non-empty
if (!password || typeof password !== 'string' || !password.trim()) {
  return createErrorResponse(
    message,
    ERROR_CODES.INVALID_INPUT,
    'Mật khẩu là bắt buộc',
    { field: 'password' }
  );
}
```

## Recommended Implementation
```javascript
const MIN_PASSWORD_LENGTH = 6;

if (!password || typeof password !== 'string' || !password.trim()) {
  return createErrorResponse(
    message,
    ERROR_CODES.INVALID_INPUT,
    'Mật khẩu là bắt buộc',
    { field: 'password' }
  );
}

if (password.length < MIN_PASSWORD_LENGTH) {
  return createErrorResponse(
    message,
    ERROR_CODES.INVALID_INPUT,
    `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`,
    { field: 'password', minLength: MIN_PASSWORD_LENGTH }
  );
}
```

## Test Cases
- Valid: `password123` (8 chars) → proceeds to Supabase
- Invalid: `12345` (5 chars) → returns "Mật khẩu phải có ít nhất 6 ký tự"
- Invalid: `` (empty) → returns "Mật khẩu là bắt buộc"

## Acceptance Criteria
- Password length validated (min 6 characters)
- Clear Vietnamese error message
- Tests cover short and valid passwords
- Build successful

## DoD
- Update supabaseAuth.js
- Add test cases
- npm run build → success

## Dependencies
None

## Risks
None - additive change

## Notes
- Supabase default minimum is 6 characters
- More complex rules (uppercase, numbers) can be added later if needed
