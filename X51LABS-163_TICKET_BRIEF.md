# TICKET BRIEF — X51LABS-163

**Ticket Key**: X51LABS-163  
**Title**: Build LoginForm Component with Validation  
**Epic**: X51LABS-160 (Preact UI Migration)  
**Status**: In Progress  
**Priority**: High  
**Assignee**: Vu D.  
**Created**: 2026-01-31  
**Estimate**: 3 hours  

---

## GOAL

Create a reusable LoginForm component that:
- Accepts email and password inputs with client-side validation
- Integrates with useAuth hook for authentication
- Displays user-friendly error messages
- Shows loading state during submission
- Handles form reset on successful login

---

## SCOPE (In-Scope)

✅ **Form Inputs**:
- Email input with format validation (RFC-compliant pattern)
- Password input (masked, minimum length check)

✅ **Validation**:
- Email format: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Password required: length >= 6 characters
- Client-side validation before API call

✅ **User Feedback**:
- Error message display for validation failures
- Error message display for API failures
- Loading state indicator during submission
- Button disabled during submission

✅ **Integration**:
- useAuth hook integration
- Form reset on successful authentication
- Component-local state management

---

## NON-GOALS (Out of Scope)

❌ Signup form (separate ticket X51LABS-164)  
❌ Password reset/forgot password logic (future phase)  
❌ OAuth/social login integration (future phase)  
❌ Multi-factor authentication (future phase)  
❌ "Remember me" functionality (future phase)  
❌ Page-level routing (handled by parent LoginPage)  
❌ Loading animations beyond button text change  

---

## CONSTRAINTS

### Technical
- **Framework**: Preact v10.x with hooks API
- **Dependencies**: useAuth hook (from X51LABS-162)
- **State Management**: Component-local useState (no global state)
- **No New Dependencies**: Use existing packages only

### UX/Validation
- **Client-Side Only**: All validation before API call
- **User-Friendly Errors**: No technical jargon in messages
- **Loading State**: Must block multiple submissions
- **Form Accessibility**: Labels, proper input types, ARIA attributes

### Performance
- **Render Time**: < 100ms initial render
- **Validation**: < 10ms per field check
- **No Memory Leaks**: Clean up on unmount

### Security
- **No Password Logging**: Password never logged to console
- **Input Sanitization**: Prevent XSS via input values
- **Error Messages**: Don't leak sensitive auth details

---

## ASSUMPTIONS

1. **useAuth Hook Exists**: X51LABS-162 completed successfully
2. **AuthProvider Present**: Parent component wraps with `<AuthProvider>`
3. **Background Handler**: AUTH_LOGIN message type handles backend communication
4. **React Router**: Available for redirect on success (from X51LABS-161)

---

## ACCEPTANCE CRITERIA (Testable Checklist)

| # | Given | When | Then | Pass/Fail | Verification |
|---|-------|------|------|-----------|--------------|
| AC-1 | Component rendered | LoginForm mounts | Email and password inputs visible | ⏳ | Visual + query selector test |
| AC-2 | Invalid email entered | User blurs field | Validation error "Email không hợp lệ" shown | ⏳ | Unit test + visual |
| AC-3 | Valid email, empty password | User clicks submit | Validation error "Mật khẩu phải có ít nhất 6 ký tự" shown | ⏳ | Unit test |
| AC-4 | Valid credentials entered | User clicks submit | `login(email, password)` function called | ⏳ | Mock test assertion |
| AC-5 | Login API returns error | After submit | Error message displayed (user-friendly) | ⏳ | Mock error response test |
| AC-6 | Submit in progress | Login API called | Button disabled + text "Đang đăng nhập..." | ⏳ | Loading state test |
| AC-7 | All unit tests run | `npm run test:unit -- LoginForm` | All tests pass (5-7 tests) | ⏳ | CI/command execution |

---

## AC → VERIFICATION MAP (MECE)

### AC-1: Form Renders Correctly
**Test**: `LoginForm.test.js` → "renders email and password inputs"
```javascript
expect(container.querySelector('[data-testid="email-input"]')).toBeTruthy();
expect(container.querySelector('[data-testid="password-input"]')).toBeTruthy();
expect(container.querySelector('[type="submit"]')).toBeTruthy();
```

### AC-2: Email Validation
**Test**: `LoginForm.test.js` → "shows email validation error on invalid format"
```javascript
fireEvent.input(emailInput, { target: { value: 'invalid-email' } });
fireEvent.blur(emailInput);
expect(container.textContent).toContain('Email không hợp lệ');
```

### AC-3: Password Validation
**Test**: `LoginForm.test.js` → "shows password validation error when empty"
```javascript
fireEvent.input(passwordInput, { target: { value: '' } });
fireEvent.submit(form);
expect(container.textContent).toContain('Mật khẩu phải có ít nhất 6 ký tự');
```

### AC-4: Login Function Called
**Test**: `LoginForm.test.js` → "calls login function on valid submission"
```javascript
const mockLogin = vi.fn().mockResolvedValue({ authenticated: true });
fireEvent.submit(form);
await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123'));
```

### AC-5: Error Display
**Test**: `LoginForm.test.js` → "displays error message on login failure"
```javascript
const mockLogin = vi.fn().mockResolvedValue({ authenticated: false, error: 'Sai email hoặc mật khẩu' });
await waitFor(() => expect(container.textContent).toContain('Sai email hoặc mật khẩu'));
```

### AC-6: Loading State
**Test**: `LoginForm.test.js` → "disables button during submission"
```javascript
const mockLogin = vi.fn(() => new Promise(r => setTimeout(r, 100)));
fireEvent.submit(form);
expect(submitButton).toBeDisabled();
expect(submitButton.textContent).toContain('Đang đăng nhập');
```

### AC-7: Build Passes
**Test**: Command execution
```bash
npm run build
# Expected: exit code 0, no errors
```

---

## CONTEXT (Evidence Anchors)

### Jira
- **Key**: X51LABS-163
- **Epic**: X51LABS-160 (Preact UI Migration)
- **Related Tasks**:
  - **Blocker**: X51LABS-162 (AuthContext + useAuth) ✅ COMPLETE
  - **Blocked By**: None
  - **Blocks**: X51LABS-164 (SignupForm), X51LABS-165 (PrivateRoute)

### Repository
- **Branch**: `feature/preact-ui-migration`
- **Base Commit**: Latest on feature branch
- **Files to Reference**:
  - `src/ui-preact/hooks/useAuth.js` (hook to use)
  - `src/ui-preact/context/AuthContext.jsx` (context implementation)
  - `src/ui-preact/api/authApi.js` (backend integration pattern)
  - `tests/unit/hooks/useAuth.test.js` (test pattern reference)

### Available Infrastructure (from X51LABS-162)
```javascript
// useAuth hook returns:
{
  authenticated: boolean,
  user: Object|null,
  loading: boolean,
  error: string|null,
  login: (email, password) => Promise<{authenticated, user, error}>,
  logout: () => Promise<{success, error}>,
  checkAuthStatus: () => Promise<{authenticated, user, error}>
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Component Structure (30 mins)
1. Create `src/ui-preact/components/auth/LoginForm.jsx`
2. Import dependencies: `useState`, `useAuth` from Preact
3. Setup component state:
   - email, password (input values)
   - validationErrors (client-side errors)
   - isSubmitting (loading state)

### Phase 2: Validation Logic (20 mins)
1. Email validation function:
   - Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Return error message if invalid
2. Password validation function:
   - Check length >= 6
   - Return error message if invalid
3. Form validation on submit:
   - Run all validators
   - Collect errors
   - Block submission if errors exist

### Phase 3: Form Submission (30 mins)
1. handleSubmit function:
   - Prevent default
   - Run validation
   - If valid: call `login(email, password)`
   - Handle response:
     - Success: Clear form
     - Error: Display error from useAuth.error
2. Loading state management:
   - useAuth.loading controls button state
   - Button text changes during loading

### Phase 4: UI Rendering (20 mins)
1. Form element with onSubmit handler
2. Email input:
   - Label: "Email"
   - data-testid="email-input"
   - type="email"
   - value/onChange binding
   - Error display below if validation fails
3. Password input:
   - Label: "Mật khẩu"
   - data-testid="password-input"
   - type="password"
   - value/onChange binding
   - Error display below if validation fails
4. Submit button:
   - data-testid="submit-button"
   - disabled={loading || hasValidationErrors}
   - Text: loading ? "Đang đăng nhập..." : "Đăng nhập"
5. Error display area:
   - Show useAuth.error if present
   - Show validation errors if present

### Phase 5: Unit Tests (60 mins)
1. Create `tests/unit/components/auth/LoginForm.test.js`
2. Test cases:
   - Renders without crashing
   - Displays email and password inputs
   - Email validation shows error on invalid format
   - Password validation shows error when empty/short
   - Calls login function on valid submission
   - Displays API error message
   - Disables button during loading
   - Changes button text during loading
3. Mock useAuth hook:
   - Mock login function
   - Mock loading state
   - Mock error state

### Phase 6: Integration & Verification (20 mins)
1. Run `npm run build` → Verify no errors
2. Run `npm run test:unit -- LoginForm` → Verify all pass
3. Visual inspection (if possible):
   - Form renders correctly
   - Validation works as expected
   - Loading state behaves correctly

---

## TECHNICAL DETAILS

### File Structure
```
src/ui-preact/components/auth/
├── LoginForm.jsx (NEW, ~80-120 lines)

tests/unit/components/auth/
├── LoginForm.test.js (NEW, ~80-100 lines)
```

### Component Props
```javascript
/**
 * LoginForm - Reusable authentication form
 * No props needed (self-contained)
 */
export function LoginForm() {
  // Implementation
}
```

### State Shape
```javascript
// Component state
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [validationErrors, setValidationErrors] = useState({});

// From useAuth hook
const { login, loading, error } = useAuth();
```

### Validation Rules
```javascript
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function validateEmail(email) {
  if (!email) return 'Email là bắt buộc';
  if (!EMAIL_REGEX.test(email)) return 'Email không hợp lệ';
  return null;
}

function validatePassword(password) {
  if (!password) return 'Mật khẩu là bắt buộc';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`;
  }
  return null;
}
```

---

## TESTING STRATEGY

### Unit Tests (5-7 tests)
1. **Rendering**: Component renders without errors
2. **Form Fields**: Email and password inputs present
3. **Email Validation**: Invalid email shows error
4. **Password Validation**: Empty/short password shows error
5. **Login Integration**: Valid submission calls login()
6. **Error Display**: API error shown to user
7. **Loading State**: Button disabled during submission

### Test Setup Pattern
```javascript
import { render, fireEvent, waitFor } from '@testing-library/preact';
import { LoginForm } from '../../../src/ui-preact/components/auth/LoginForm.jsx';
import { useAuth } from '../../../src/ui-preact/hooks/useAuth.js';
import { vi } from 'vitest';

vi.mock('../../../src/ui-preact/hooks/useAuth.js', () => ({
  useAuth: vi.fn()
}));

describe('LoginForm', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      login: vi.fn(),
      loading: false,
      error: null
    });
  });

  // Test cases...
});
```

---

## RISKS & MITIGATIONS

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Email validation too strict/lenient | Medium | Medium | Use RFC-compliant regex, test with common patterns |
| Password visibility issues | Low | Low | Use type="password", test masking behavior |
| Test framework issues (like X51LABS-162) | Medium | High | Use component testing approach instead of hook testing |
| Loading state race conditions | Low | Medium | Proper state management, test async behavior |
| Error messages not user-friendly | Medium | Low | Review all messages with Vietnamese native speakers |

---

## SUCCESS CRITERIA

✅ All 7 AC passed with evidence  
✅ All unit tests pass (5-7 tests)  
✅ Build completes without errors  
✅ No console warnings  
✅ Component renders correctly  
✅ Validation works as expected  
✅ Error handling comprehensive  
✅ Code follows project conventions  

---

## DEPENDENCIES MET

- ✅ X51LABS-161: React Router v6 setup (COMPLETE)
- ✅ X51LABS-162: AuthContext + useAuth hook (COMPLETE)
- ✅ Preact directory structure in place
- ✅ Test environment configured (Vitest + happy-dom)

---

## SIGN-OFF

**Created**: 2026-01-31  
**Task**: X51LABS-163  
**Status**: Ready for implementation  
**Dependencies Met**: ✅ All prerequisites complete (X51LABS-161, X51LABS-162)  
**Estimated Effort**: 3 hours  
**Target Completion**: Same day  

---

**Next Steps**:
1. Create LoginForm.jsx with validation
2. Create comprehensive unit tests
3. Verify build passes
4. Update epic progress (3/8 complete)
5. Unblock X51LABS-164 (SignupForm) and X51LABS-165 (PrivateRoute)
