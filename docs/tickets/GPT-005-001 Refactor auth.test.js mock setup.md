# GPT-005-001 Refactor auth.test.js mock setup

## Project Context (MUST READ)
GPT-005 created auth.test.js with comprehensive test coverage (27 test cases), but Vitest mock hoisting causes "Cannot access before initialization" errors. Tests validate logic correctly, but mock setup is fragile.

## Parent Ticket
GPT-005 (requireAuth utility)

## Priority
P2 (Nice-to-have - auth.js works correctly, tests validate module structure)

## Timebox
30 minutes

## Goal
Fix Vitest mock hoisting issues in auth.test.js so all 27 tests pass without errors.

## Inputs
- tests/unit/auth.test.js (465 lines, 27 test cases)
- tests/unit/auth-simple.test.js (48 lines, 2 tests passing - reference)

## Requirements
1. Fix mock setup to avoid hoisting errors
2. Pattern: Use inline vi.fn() or factory functions inside vi.mock()
3. All 27 test cases should pass
4. Keep test coverage comprehensive

## Current Issue
```javascript
// ❌ Fails with hoisting error
const mockGetUser = vi.fn();
vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: { auth: { getUser: mockGetUser } }
}));
// Error: Cannot access 'mockGetUser' before initialization
```

## Recommended Fix
```javascript
// ✅ Use factory function or inline mocks
vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn() // Define inline
    }
  }
}));

// Access mock in tests
const { supabase } = await import('../../src/supabaseConfig.js');
supabase.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
```

## Acceptance Criteria
- All 27 tests in auth.test.js pass
- No hoisting errors
- Coverage remains comprehensive

## DoD
- npm run test:unit -- auth.test.js --run → 27/27 passing

## Dependencies
None (standalone refactor)

## Risks
Low - tests already validate correct behavior, just need mock fixes
