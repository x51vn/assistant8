# GPT-007-003 Optimize auth check retry logic

## Project Context (MUST READ)
SUPABASE_AUTH_CHECK handler retries 2 times even on 401 Unauthorized (token expired), adding ~2 seconds delay for a known client error.

## Parent Ticket
GPT-007 (Background Supabase auth handlers)

## Priority
P3 (Optimization - minimal impact)

## Timebox
20 minutes

## Goal
Optimize auth check to not retry on 401/403 client errors, improving response time for expired tokens.

## Inputs
- src/background/handlers/supabaseAuth.js (SUPABASE_AUTH_CHECK handler)
- src/background/utils/supabaseRetry.js (retry logic)

## Requirements
1. Detect 401/403 errors in auth check
2. Return immediately without retry
3. Maintain retry for transient errors (5xx, network)

## Current Code
```javascript
const result = await supabaseWithRetry(
  async () => {
    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw authResult.error;
    return authResult;
  },
  { maxRetries: 2 } // ← Will retry on 401
);
```

## Option 1: Use maxRetries: 0
```javascript
const result = await supabaseWithRetry(
  async () => {
    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw authResult.error;
    return authResult;
  },
  { maxRetries: 0 } // No retry - auth check is cheap
);
```

## Option 2: Check error code before throwing
```javascript
const result = await supabaseWithRetry(
  async () => {
    const authResult = await supabase.auth.getUser();
    if (authResult.error) {
      // Don't retry on client errors
      if (authResult.error.status === 401 || authResult.error.status === 403) {
        return { data: { user: null }, error: authResult.error };
      }
      throw authResult.error;
    }
    return authResult;
  },
  { maxRetries: 2 }
);
```

## Recommendation
Use Option 1 (`maxRetries: 0`) - simpler and auth check is lightweight enough to not need retry.

## Test Cases
- Valid token → returns user (no retry needed)
- Expired token (401) → returns not authenticated immediately
- Network error → still fails but faster (no retry)

## Acceptance Criteria
- Auth check doesn't retry on 401/403
- Response time improved (~2s faster on expired tokens)
- Still returns correct { authenticated, user } response
- Build successful

## DoD
- Update supabaseAuth.js
- Test with expired token (manual or mock)
- npm run build → success

## Dependencies
None

## Risks
Very low - makes operation faster, doesn't change logic

## Notes
- Auth check is called frequently (on every page load)
- Optimization improves UX for expired sessions
