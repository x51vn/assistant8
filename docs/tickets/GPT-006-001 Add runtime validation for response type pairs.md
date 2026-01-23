# GPT-006-001 Add runtime validation for response type pairs

## Project Context (MUST READ)
MESSAGE_TYPES defines 51 request-response pairs, but no runtime validation ensures handlers return correct response types. Mistakes caught only in testing/code review.

## Parent Ticket
GPT-006 (Message types alignment)

## Priority
P3 (Nice-to-have - TypeScript would be better long-term solution)

## Timebox
1 hour

## Goal
Add runtime validation in createResponse() to warn when response type doesn't match expected pair.

## Inputs
- src/shared/messageSchema.js (MESSAGE_TYPES, createResponse)
- docs/ARCHITECTURE.md (handler table with type pairs)

## Requirements
1. Define VALID_RESPONSE_PAIRS map
2. Validate in createResponse()
3. Log warning (not error) for mismatches
4. Add tests for validation

## Example Issue (Current)
```javascript
// ❌ Compiles fine but is wrong
registerHandler(MESSAGE_TYPES.PROMPT_ADD, async (message) => {
  return createResponse(message, MESSAGE_TYPES.PORTFOLIO_ADDED, data); 
  // Wrong type! Should be PROMPT_ADDED
});
```

## Recommended Implementation
```javascript
// src/shared/messageSchema.js
const VALID_RESPONSE_PAIRS = {
  'PROMPT_ADD': 'PROMPT_ADDED',
  'PORTFOLIO_GET': 'PORTFOLIO_DATA',
  'SUPABASE_AUTH_LOGIN': 'SUPABASE_AUTH_SUCCESS',
  // ... all pairs
};

export function createResponse(originalMessage, responseType, payload) {
  const expected = VALID_RESPONSE_PAIRS[originalMessage.type];
  
  if (expected && responseType !== MESSAGE_TYPES[expected]) {
    console.warn(
      `[MessageSchema] Unexpected response type "${responseType}" for "${originalMessage.type}". Expected "${expected}"`
    );
  }
  
  return {
    v: MESSAGE_VERSION,
    type: responseType,
    correlationId: originalMessage.correlationId,
    timestamp: Date.now(),
    inResponseTo: originalMessage.type,
    ...payload
  };
}
```

## Acceptance Criteria
- VALID_RESPONSE_PAIRS map covers all request types
- createResponse() logs warning for mismatches
- Tests validate warning is triggered
- No breaking changes to existing handlers

## DoD
- Unit tests pass
- Build successful
- Manual test: trigger warning with wrong type

## Dependencies
None

## Risks
Low - additive change, doesn't break existing code

## Notes
- Consider this a stopgap before TypeScript migration (GPT-040+)
- Warnings help during development, not user-facing
