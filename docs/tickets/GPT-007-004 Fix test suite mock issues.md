DONE

# GPT-007-004 Fix test suite mock issues

## Project Context (MUST READ)
tests/unit/supabaseAuth.test.js has Vitest mock hoisting issues similar to GPT-005 auth.test.js. Tests fail with "mockAuth is not defined" errors and have duplicate test suites.

## Parent Ticket
GPT-007 (Background Supabase auth handlers)

## Priority
P1 (if automated testing required) OR defer to GPT-030+ (manual/E2E sufficient for MVP)

## Timebox
1 hour

## Goal
Fix Vitest mock setup so all 13 auth handler tests pass without errors.

## Inputs
- tests/unit/supabaseAuth.test.js (512 lines, 13 test cases)
- tests/unit/supabaseRetry.test.js (reference for working mocks)
- tests/unit/auth-simple.test.js (reference for simple validation)

## Requirements
1. Fix mock hoisting errors (mockAuth not defined)
2. Remove duplicate test suites
3. All 13 test cases should pass
4. Keep test coverage for LOGIN, LOGOUT, CHECK handlers

## Current Issues
```javascript
// ❌ Reference error
const mockSignInWithPassword = vi.fn();
// ...later in test...
mockAuth.signInWithPassword.mockResolvedValue(...) // mockAuth is not defined
```

## Recommended Approach
**Option 1: Inline Mocks (Simplest)**
```javascript
// Mock modules at top level
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetUser = vi.fn();

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getUser: mockGetUser,
      onAuthStateChange: vi.fn()
    }
  }
}));

// Tests access mocks directly
mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser }, error: null });
```

**Option 2: Factory Functions**
```javascript
vi.mock('../../src/supabaseConfig.js', () => {
  const mockAuth = {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn()
  };
  
  return {
    supabase: { auth: mockAuth },
    __mockAuth: mockAuth // Export for tests
  };
});

// Tests import and use
import { __mockAuth } from '../../src/supabaseConfig.js';
__mockAuth.signInWithPassword.mockResolvedValue(...);
```

## Test Cases to Cover
**LOGIN**:
- ✅ Valid credentials → SUCCESS
- ✅ Missing email → INVALID_INPUT
- ✅ Missing password → INVALID_INPUT
- ✅ Invalid credentials → AUTH_INVALID_CREDENTIALS
- ✅ Email not confirmed → AUTH_EMAIL_NOT_CONFIRMED

**LOGOUT**:
- ✅ Success → LOGGED_OUT
- ✅ Error → AUTH_ERROR

**CHECK**:
- ✅ Authenticated → STATUS with user
- ✅ Not authenticated → STATUS with null
- ✅ Error → STATUS with null (fail-safe)

## Acceptance Criteria
- All 13 tests pass
- No mock hoisting errors
- No duplicate test suites
- Coverage remains comprehensive

## DoD
- npm run test:unit -- supabaseAuth.test.js --run → 13/13 passing
- Build successful

## Dependencies
None (standalone refactor)

## Risks
Medium - complex mock setup, may take iteration

## Alternative
**Defer to GPT-030+**:
- MVP can rely on manual testing + integration tests
- Full unit test coverage nice-to-have but not blocking
- Focus on E2E tests instead (Playwright with real Supabase)

## Decision
Recommend: **Defer to cleanup phase** (GPT-030+) unless automated CI/CD requires unit tests now.
