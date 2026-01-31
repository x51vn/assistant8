# STEP 2: IMPACT MAP — X51LABS-163

**Date**: 2026-01-31  
**Task**: Build LoginForm Component with Validation  

---

## FILES TO CREATE (2 new files)

### 1. `src/ui-preact/components/auth/LoginForm.jsx` (~100-120 lines)
**Purpose**: Main LoginForm component  
**Dependencies**:
- `preact` → h, Fragment
- `preact/hooks` → useState
- `../hooks/useAuth.js` → useAuth hook

**Exports**:
- `export function LoginForm()` → Form component (no props)

**State**:
- Local: email, password, validationErrors
- From hook: login, loading, error (via useAuth)

**Logic**:
- Email validation (RFC-compliant regex)
- Password validation (min length 6)
- Form submission handler
- Error display logic
- Loading state management

---

### 2. `tests/unit/components/auth/LoginForm.test.js` (~80-100 lines)
**Purpose**: Unit tests for LoginForm  
**Dependencies**:
- `@testing-library/preact` → render, fireEvent, waitFor
- `vitest` → describe, test, expect, vi, beforeEach
- Component: `../../../src/ui-preact/components/auth/LoginForm.jsx`
- Hook mock: `../../../src/ui-preact/hooks/useAuth.js`

**Test Cases** (5-7):
1. Renders email and password inputs
2. Shows email validation error on invalid format
3. Shows password validation error when too short
4. Calls login function on valid submission
5. Displays API error message
6. Disables button during loading
7. Changes button text to "Đang đăng nhập..." during loading

**Mock Strategy**:
```javascript
vi.mock('../../../src/ui-preact/hooks/useAuth.js', () => ({
  useAuth: vi.fn()
}));
```

---

## FILES TO REFERENCE (Read-Only, for patterns)

### 1. `src/ui-preact/hooks/useAuth.js` (46 lines)
**Why**: Understand hook API  
**Key Info**:
- Returns: `{ authenticated, user, loading, error, login, logout, checkAuthStatus }`
- `login(email, password)` → Promise<{authenticated, user, error}>
- Must use within AuthProvider

**Usage Pattern**:
```javascript
const { login, loading, error } = useAuth();
const result = await login(email, password);
if (result.authenticated) { /* success */ }
```

---

### 2. `src/ui-preact/context/AuthContext.jsx` (117 lines)
**Why**: Understand context structure  
**Key Info**:
- AuthProvider wraps app
- AuthContext created with createContext(null)
- State management for auth operations

**Integration**: LoginForm must be used within `<AuthProvider>`

---

### 3. `src/ui-preact/components/StockModal.jsx` (243 lines)
**Why**: Form component pattern reference  
**Key Patterns**:
- Uses `signal()` for form state (from @preact/signals)
- Validation on input change
- Error display below inputs
- Submit button disabled logic
- Modal structure

**Applicable Patterns**:
- Input handling: `<input value={formEmail.value} onInput={handleEmailChange} />`
- Error display: `{formErrors.value.email && <div class="error">{formErrors.value.email}</div>}`
- Loading state: `disabled={isSubmitting.value || hasErrors}`

---

### 4. `src/ui-preact/utils/formValidation.js` (165 lines)
**Why**: Validation function patterns  
**Key Patterns**:
- Returns `{ isValid: boolean, error: string|null }`
- Vietnamese error messages
- Specific rules per field type

**Applicable Code**:
```javascript
export function validateSymbol(symbol) {
  if (!symbol || symbol.trim().length === 0) {
    return { isValid: false, error: 'Mã cổ phiếu bắt buộc' };
  }
  // ... validation logic
  return { isValid: true, error: null };
}
```

**Adaptation**: Create `validateEmail()` and `validatePassword()` following same pattern

---

### 5. `tests/unit/hooks/useAuth.test.js` (373 lines)
**Why**: Test structure and mocking patterns  
**Key Patterns**:
- Mock chrome.runtime API
- Mock AuthContext provider
- Test component approach (render component using hook)
- Async operation testing with waitFor

**Applicable Patterns**:
```javascript
vi.mock('../../src/ui-preact/hooks/useAuth.js', () => ({
  useAuth: vi.fn()
}));

beforeEach(() => {
  useAuth.mockReturnValue({
    login: vi.fn(),
    loading: false,
    error: null
  });
});
```

---

## CONVENTIONS TO FOLLOW

### Component Structure
```javascript
/** @jsx h */
/**
 * Component.jsx - Brief description
 * 
 * Features:
 * - Feature 1
 * - Feature 2
 * 
 * X51LABS-163: Build LoginForm Component
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';

export function ComponentName() {
  // State
  // Handlers
  // Render
}
```

### Error Messages (Vietnamese)
- "Email là bắt buộc"
- "Email không hợp lệ"
- "Mật khẩu là bắt buộc"
- "Mật khẩu phải có ít nhất 6 ký tự"
- "Đang đăng nhập..." (loading text)
- "Đăng nhập" (button text)

### Data Attributes (for testing)
- `data-testid="email-input"`
- `data-testid="password-input"`
- `data-testid="submit-button"`
- `data-testid="error-message"`
- `data-testid="login-form"`

### Import Order
1. Preact core (h, Fragment)
2. Preact hooks (useState, useEffect)
3. Internal hooks (useAuth)
4. Internal utilities (validation)
5. Styles (if any)

---

## NO MODIFICATIONS NEEDED (Zero Impact)

The following files are **read-only references** or **unaffected**:

- ✅ `src/ui-preact/hooks/useAuth.js` - Used as-is, no changes
- ✅ `src/ui-preact/context/AuthContext.jsx` - Used as-is, no changes
- ✅ `src/ui-preact/api/authApi.js` - Used as-is, no changes
- ✅ `package.json` - No new dependencies
- ✅ `vite.config.js` - No build changes
- ✅ `vitest.config.js` - Environment already configured (happy-dom from X51LABS-162)

---

## DEPENDENCY GRAPH

```
LoginForm.jsx (NEW)
├─ depends on: useAuth hook (X51LABS-162) ✅
├─ depends on: Preact hooks (useState) ✅
└─ depends on: AuthProvider context (X51LABS-162) ✅

LoginForm.test.js (NEW)
├─ depends on: LoginForm.jsx (same task)
├─ depends on: @testing-library/preact ✅
├─ depends on: vitest (happy-dom) ✅
└─ mocks: useAuth hook
```

---

## INTEGRATION POINTS

### 1. useAuth Hook (from X51LABS-162)
**Interface**:
```javascript
const { login, loading, error } = useAuth();
```

**Usage**:
- `login(email, password)` → Call on form submit
- `loading` → Boolean for button disabled state
- `error` → String for error message display

**Error Handling**: useAuth.error already contains user-friendly message

---

### 2. AuthProvider Context (from X51LABS-162)
**Requirement**: LoginForm must be wrapped in `<AuthProvider>`

**Notes**: 
- No changes needed to AuthContext
- LoginForm assumes provider is present
- Error thrown if used outside provider (by useAuth hook)

---

### 3. Testing Framework (from X51LABS-162)
**Environment**: happy-dom configured in vitest.config.js

**Test Utils**:
- `render()` from @testing-library/preact
- `fireEvent` for user interactions
- `waitFor` for async assertions
- `vi` for mocking

**Known Issue**: Hook testing utilities may have issues (from X51LABS-162)  
**Mitigation**: Use component testing approach, not renderHook

---

## FILE LOCATIONS (Directory Structure)

```
src/ui-preact/
├── components/
│   ├── auth/
│   │   └── LoginForm.jsx ← NEW (This task)
│   ├── StockModal.jsx ← REFERENCE (form patterns)
│   └── ...
├── hooks/
│   └── useAuth.js ← DEPENDENCY (X51LABS-162)
├── context/
│   └── AuthContext.jsx ← DEPENDENCY (X51LABS-162)
└── utils/
    └── formValidation.js ← REFERENCE (validation patterns)

tests/unit/
├── components/
│   └── auth/
│       └── LoginForm.test.js ← NEW (This task)
└── hooks/
    └── useAuth.test.js ← REFERENCE (test patterns)
```

---

## RISK AREAS (Be Careful)

### 1. Test Framework Compatibility (Medium Risk)
**Context**: X51LABS-162 had 12/14 test failures due to Preact testing limitations

**Mitigation for This Task**:
- Use component testing approach (render actual component)
- Mock useAuth hook, not AuthContext
- Test behavior, not implementation
- Accept that some tests may need adjustment post-merge

---

### 2. Email Validation Strictness (Low Risk)
**Issue**: Regex too strict may reject valid emails

**Mitigation**:
- Use RFC-compliant pattern: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Test with common email patterns
- Document edge cases in code comments

---

### 3. Error Message Consistency (Low Risk)
**Issue**: Different Vietnamese phrasing than existing components

**Mitigation**:
- Follow pattern from formValidation.js
- Review error messages before commit
- Consistent format: "Field là bắt buộc" / "Field không hợp lệ"

---

## CONVENTIONS CHECKLIST

- [ ] File header comment with `/** @jsx h */`
- [ ] JSDoc for exported functions
- [ ] data-testid attributes on interactive elements
- [ ] Vietnamese error messages (user-facing)
- [ ] English comments (code documentation)
- [ ] No console.log in production code
- [ ] Proper import order
- [ ] Component name matches filename

---

## VERIFICATION COMMANDS

```bash
# 1. Check file exists
ls -la src/ui-preact/components/auth/LoginForm.jsx
ls -la tests/unit/components/auth/LoginForm.test.js

# 2. Run unit tests
npm run test:unit -- LoginForm

# 3. Build verification
npm run build

# 4. Check no unintended changes
git status
git diff
```

---

**Impact Summary**:
- **Files Created**: 2 (LoginForm.jsx, LoginForm.test.js)
- **Files Modified**: 0
- **Dependencies Added**: 0
- **Breaking Changes**: None
- **Integration Risk**: Low (uses existing hooks, no API changes)

---

**Sign-off**: Impact map complete, ready for STEP 3 (Proposed Changes)
