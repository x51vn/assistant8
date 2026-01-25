DONE

# GPT-007-001 Add email format validation

## Project Context (MUST READ)
SUPABASE_AUTH_LOGIN handler checks email is non-empty but doesn't validate format. Supabase rejects invalid emails, but error message is generic.

## Parent Ticket
GPT-007 (Background Supabase auth handlers)

## Priority
P2 (Nice-to-have for better UX)

## Timebox
30 minutes

## Goal
Add client-side email format validation before calling Supabase to provide clear error messages.

## Inputs
- src/background/handlers/supabaseAuth.js (SUPABASE_AUTH_LOGIN handler)
- src/shared/errorCodes.js

## Requirements
1. Add email format validation regex
2. Return INVALID_INPUT with Vietnamese message
3. Test valid and invalid email formats

## Current Code
```javascript
// Only checks non-empty
if (!email || typeof email !== 'string' || !email.trim()) {
  return createErrorResponse(
    message,
    ERROR_CODES.INVALID_INPUT,
    'Email là bắt buộc',
    { field: 'email' }
  );
}
```

## Recommended Implementation
```javascript
// Add email format validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!email || typeof email !== 'string' || !email.trim()) {
  return createErrorResponse(
    message,
    ERROR_CODES.INVALID_INPUT,
    'Email là bắt buộc',
    { field: 'email' }
  );
}

if (!emailRegex.test(email.trim())) {
  return createErrorResponse(
    message,
    ERROR_CODES.INVALID_INPUT,
    'Email không đúng định dạng',
    { field: 'email' }
  );
}
```

## Test Cases
- Valid: `test@example.com` → proceeds to Supabase
- Invalid: `test@` → returns "Email không đúng định dạng"
- Invalid: `@example.com` → returns error
- Invalid: `test example@com` → returns error

## Acceptance Criteria
- Email format validated before Supabase call
- Clear Vietnamese error message
- Tests cover valid and invalid formats
- Build successful

## DoD
- Update supabaseAuth.js
- Add test cases
- npm run build → success

## Dependencies
None

## Risks
None - additive change
