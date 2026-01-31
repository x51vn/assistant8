# Login Migration - JIRA Ticket Decomposition

**Project**: X51LABS  
**Epic**: [NEW - Create via this process]  
**Big Task**: Migrate login page to Preact + React Router v6  
**Total Effort**: 8-10 days (8 tasks × 2-3h avg, includes testing/review)  
**Timeline**: Ready for sprint assignment

---

## 📊 BASELINE DoD (Applies to ALL Tasks)

### Code Quality
- [ ] Code reviewed by peer (1+ approval)
- [ ] All tests added/updated and passing (vitest for units, playwright for E2E)
- [ ] No console errors or warnings in extension
- [ ] No TypeScript/lint errors (if using)
- [ ] Zero breaking changes; backward compatible

### Safety & Security
- [ ] No secrets/PII exposed in code or logs
- [ ] Safe error handling (user-friendly messages, not technical details)
- [ ] Chrome extension manifest permissions unchanged

### Verification
- [ ] Feature tested locally (Chrome extension loaded)
- [ ] All acceptance criteria met (pass/fail checklist)
- [ ] Verification steps executed and documented
- [ ] Minimal change principle (no unnecessary refactors)

### Documentation
- [ ] Code comments for complex logic
- [ ] JSDoc for component props/hooks (if using TS, inline types)
- [ ] Migration docs updated if needed

---

## 🎟️ TASK 1: Setup & Dependency Verification

**Title**: [X51LABS-1] Setup React Router & Verify Dependencies  
**Issue Type**: Task  
**Objective**: Verify React Router v6 is installed, check for Router conflicts, create project structure.

**GOAL**:
- Confirm React Router v6 available in package.json
- Audit current Preact app setup (check for existing Router)
- Create folder structure for new components (pages/, components/auth/, context/, hooks/)
- Create GitHub issue for migration milestone

**SCOPE (In-scope)**:
- Run `npm list react-router-dom` and verify version
- Inspect `src/ui-preact/index.jsx` for existing BrowserRouter
- Check `src/shared/errorCodes.js` existence (for error handling standardization)
- Create directories: `src/ui-preact/pages/`, `src/ui-preact/components/auth/`, `src/ui-preact/context/`, `src/ui-preact/hooks/`
- Create GitHub issue with migration checklist

**NON-GOALS (Out-of-scope)**:
- Installing new packages (react-router-dom must already exist)
- Refactoring existing portfolio/settings code
- Writing components (defer to task 2+)

**CONSTRAINTS**:
- React Router v6 MUST be installed (blocker if missing)
- No changes to manifest.json permissions
- No changes to background handlers
- ASSUMPTION: Preact v10+ already installed (used in portfolio)

**CONTEXT (Repo evidence)**:
- Files:
  - `package.json` — verify dependencies
  - `src/ui-preact/index.jsx` — check current Router setup
  - `src/ui/index.js` — entry point logic
  - `src/shared/messageSchema.js` — message type definitions
- Versions:
  - Preact: v10.x (existing in project)
  - React Router: [TBD - need to verify]
  - Vite: 5.0 (build tool)

**PLAN (plan-first)**:
1. Run `npm list react-router-dom` and capture output
2. If missing: STOP and report; request `npm install react-router-dom@6`
3. Open `src/ui-preact/index.jsx` and check for existing `<BrowserRouter>` or `<Router>`
4. If Router already exists: note location and plan integration point
5. Check `src/shared/errorCodes.js` existence (or plan inline error handling)
6. Create directory structure: `mkdir -p src/ui-preact/{pages,components/auth,context,hooks}`
7. Create placeholder files (empty .jsx) to reserve structure
8. Create GitHub issue titled "Login Migration (X51LABS)" with:
   - Epic: [New epic to be created]
   - Tasks checklist: Link to all 8 tasks once created
   - Definition of Done
   - Timeline (3-4 days realistic)
9. Document findings in task description for team visibility

**EXPECTED CHANGES (what will change)**:
- Code:
  - New directories created: `src/ui-preact/{pages,components/auth,context,hooks}/`
  - Placeholder files: `index.js` in each (can be empty)
  - No existing code modified
- Config:
  - None (assume React Router already in package.json)
- Data:
  - None
- Tests:
  - None (structure-only task)
- Docs:
  - GitHub issue created with link to migration docs

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Run `npm list react-router-dom` → Then: Output shows v6.x installed
- [ ] Given: Inspect `src/ui-preact/index.jsx` → Then: Document found (or not found) and plan noted
- [ ] Given: Check error codes standard → Then: `src/shared/errorCodes.js` confirmed (or inline strategy documented)
- [ ] Given: Create directories → Then: All 4 directories exist with proper structure
- [ ] Given: GitHub issue created → Then: Issue links to this task + all 7 other tasks

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] React Router v6 confirmed installed (or blocker raised)
- [ ] Current Router setup documented (exists or doesn't)
- [ ] Directory structure created and visible
- [ ] GitHub issue created with all links
- [ ] Findings documented in task comments

**VERIFICATION STEPS**:
```bash
# 1. Verify React Router
npm list react-router-dom
# Expected: react-router-dom@6.x

# 2. Check directory structure created
ls -la src/ui-preact/pages/
ls -la src/ui-preact/components/auth/
ls -la src/ui-preact/context/
ls -la src/ui-preact/hooks/
# Expected: directories exist

# 3. Verify no errors
npm run build
# Expected: exit code 0

# 4. Confirm GitHub issue created (manual check)
# Expected: Issue X51LABS-# created with checklist
```

**RISKS & MITIGATIONS**:
- **Risk**: React Router v6 not installed → **Mitigation**: Task will STOP with clear error; request `npm install` before proceeding
- **Risk**: Existing Router conflicts → **Mitigation**: Document current setup; plan integration in task 2
- **Risk**: Missing error code standards → **Mitigation**: Default to inline error messages in components

**ESTIMATE (hours)**: 2

**DEPENDENCIES**:
- blocked-by: None (can start immediately)
- blocks: All other tasks (tasks 2-8 depend on directory structure)
- parallelizable: None (gate task)

---

## 🎟️ TASK 2: Implement AuthContext & useAuth Hook

**Title**: [X51LABS-2] Build AuthContext & useAuth Custom Hook  
**Issue Type**: Task  
**Objective**: Create centralized auth state management using Preact hooks and Context API.

**GOAL**:
- Create `src/ui-preact/context/AuthContext.jsx` with Preact Context for auth state
- Create `src/ui-preact/hooks/useAuth.js` hook to access context
- Implement state structure: `{authenticated, user, loading, error}`
- Integrate with background message API (no UI yet)

**SCOPE (In-scope)**:
- Create AuthContext.jsx with provider + initial state
- Create useAuth.js hook with context consumer
- Plan auth state shape: `{authenticated: bool, user: object, loading: bool, error: string}`
- Document hook usage patterns

**NON-GOALS (Out-of-scope)**:
- Components using the hook (defer to tasks 3-4)
- UI rendering (defer to task 5+)
- Background handler changes (handlers already correct)

**CONSTRAINTS**:
- Must work with existing background message API (MESSAGE_TYPES.SUPABASE_AUTH_CHECK, etc.)
- No breaking changes to existing app
- Use Preact hooks API (useState, useContext, useEffect from preact/hooks)
- ASSUMPTION: Preact v10 supports hooks

**CONTEXT (Repo evidence)**:
- Files:
  - `src/ui-preact/api/authApi.js` (63 lines) — existing API layer to reuse
  - `src/shared/messageSchema.js` — MESSAGE_TYPES definitions
  - `src/ui/auth.js` (272 lines) — current state patterns to extract
- Versions:
  - Preact: v10.x with preact/hooks

**PLAN (plan-first)**:
1. Create `src/ui-preact/context/AuthContext.jsx`:
   - Define initial state shape: `{authenticated: false, user: null, loading: false, error: null}`
   - Export: `<AuthProvider>` component (provider wrapper)
   - Export: `AuthContext` object (for custom hook)
2. Create `src/ui-preact/hooks/useAuth.js`:
   - Hook returns: `{authenticated, user, loading, error, login, logout, checkAuthStatus}`
   - login(email, pwd): Call authApi.login() → update context → return result
   - logout(): Call authApi.logout() → clear context
   - checkAuthStatus(): Call authApi.checkAuthStatus() → update context
3. Create unit tests in `tests/unit/hooks/useAuth.test.js`:
   - Test hook returns correct initial state
   - Test login updates context
   - Test logout clears context
4. Document hook usage in JSDoc comments
5. Add error code integration (use errorCodes.js if exists)

**EXPECTED CHANGES (what will change)**:
- Code:
  - NEW: `src/ui-preact/context/AuthContext.jsx` (~40-50 lines)
  - NEW: `src/ui-preact/hooks/useAuth.js` (~20-30 lines)
  - NEW: `tests/unit/hooks/useAuth.test.js` (~60-80 lines unit tests)
  - MODIFY: `src/ui-preact/api/authApi.js` — add `listenAuthStateChanges()` function
- Config: None
- Data: None
- Tests: Unit tests for AuthContext and useAuth hook
- Docs: JSDoc comments in hook + context

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Import useAuth hook → Then: Hook returns auth object with expected properties
- [ ] Given: Call login() with credentials → Then: Context updates with user + authenticated=true
- [ ] Given: Call logout() → Then: Context clears (authenticated=false, user=null)
- [ ] Given: Run unit tests → Then: All tests pass (npm run test:unit -- useAuth)
- [ ] Given: Inspect JSDoc → Then: Hook usage documented for components to follow

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] AuthContext.jsx created with provider pattern
- [ ] useAuth.js hook created and exported
- [ ] Unit tests added and passing
- [ ] JSDoc comments complete
- [ ] `listenAuthStateChanges()` added to authApi.js
- [ ] No build errors (npm run build)

**VERIFICATION STEPS**:
```bash
# 1. Verify files created
ls -la src/ui-preact/context/AuthContext.jsx
ls -la src/ui-preact/hooks/useAuth.js

# 2. Run unit tests
npm run test:unit -- useAuth
# Expected: All tests pass

# 3. Verify build works
npm run build
# Expected: exit code 0, no errors

# 4. Check JSDoc is present
grep -A 5 "/**" src/ui-preact/hooks/useAuth.js
# Expected: Documentation visible
```

**RISKS & MITIGATIONS**:
- **Risk**: State sync issues between multiple browser tabs → **Mitigation**: Use `listenAuthStateChanges()` from background (broadcasts to all tabs)
- **Risk**: Context re-renders too often → **Mitigation**: Split context if needed (Auth vs UI state)

**ESTIMATE (hours)**: 3

**DEPENDENCIES**:
- blocked-by: Task 1 (directory structure)
- blocks: Tasks 3, 4, 5 (components use this hook)
- parallelizable: None (foundational)

---

## 🎟️ TASK 3: Build LoginForm Component

**Title**: [X51LABS-3] Create LoginForm Component with Validation  
**Issue Type**: Task  
**Objective**: Implement form component with email/password inputs, validation, error display, and submit handler.

**GOAL**:
- Create `src/ui-preact/components/auth/LoginForm.jsx` (~80-120 lines)
- Validate email format and required fields
- Display error messages
- Call useAuth.login() and handle response
- Show loading state during submission

**SCOPE (In-scope)**:
- Email input with format validation
- Password input (masked)
- Submit button with loading state
- Error message display
- Form reset on successful submit
- Reusable component (no page-specific logic)

**NON-GOALS (Out-of-scope)**:
- Signup form (future phase)
- Password reset logic (future phase)
- OAuth integration (future phase)
- Multi-factor authentication (future phase)

**CONSTRAINTS**:
- Form validation must be client-side (before API call)
- Error messages must be user-friendly (not technical details)
- Loading state must block further submissions
- ASSUMPTION: useAuth hook exists (task 2 prerequisite)

**CONTEXT (Repo evidence)**:
- Files:
  - `src/ui-preact/hooks/useAuth.js` — hook to integrate
  - `src/ui/auth.js` (lines 162-196) — current form event handling (for reference)
  - `src/shared/errorCodes.js` (if exists) — error message standards
- Versions:
  - Preact: v10.x with preact/hooks

**PLAN (plan-first)**:
1. Create LoginForm.jsx with:
   - useState for email, password, loading, error
   - useAuth hook call to get login function
   - Email regex validation: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Password required check: length >= 6
   - handleSubmit(e): validate → call login() → on error show message → on success clear form
2. Render:
   - Label + email input
   - Label + password input (type="password")
   - Error message (if error)
   - Submit button (disabled during loading, text changes to "Logging in...")
3. Add unit tests:
   - Test renders without errors
   - Test validates email format
   - Test validates password required
   - Test submit calls login()
   - Test error display
   - Test loading state blocks submit
4. Add E2E test scaffold (defer actual test to task 7):
   - Mark selectors: `#loginForm`, `[data-testid="email-input"]`, etc.

**EXPECTED CHANGES (what will change)**:
- Code:
  - NEW: `src/ui-preact/components/auth/LoginForm.jsx` (~80-120 lines)
  - NEW: `tests/unit/components/LoginForm.test.js` (~80-100 lines)
- Config: None
- Data: None
- Tests: Unit tests for validation + submit
- Docs: JSDoc comments in component props

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Render LoginForm → Then: Email + password inputs visible
- [ ] Given: Enter invalid email → Then: Validation error shown on blur
- [ ] Given: Enter valid email + empty password → Then: Validation error shown
- [ ] Given: Enter valid credentials + click submit → Then: login() called
- [ ] Given: login() returns error → Then: Error message displayed
- [ ] Given: Submit in progress → Then: Button disabled + shows "Logging in..."
- [ ] Given: All unit tests run → Then: All pass (npm run test:unit -- LoginForm)

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] LoginForm.jsx created with validation logic
- [ ] Form renders correctly (all inputs, labels, error display)
- [ ] Unit tests written and passing
- [ ] JSDoc for component props complete
- [ ] E2E test IDs added (data-testid attributes)
- [ ] No console errors or warnings

**VERIFICATION STEPS**:
```bash
# 1. Run unit tests
npm run test:unit -- LoginForm
# Expected: All tests pass

# 2. Build and check for errors
npm run build
# Expected: exit code 0

# 3. Visual verification (manual, after integration)
# Expected: Form renders with inputs, validation works
```

**RISKS & MITIGATIONS**:
- **Risk**: Form validation too strict/lenient → **Mitigation**: Email RFC validation + common patterns tested
- **Risk**: Password visibility issues → **Mitigation**: Test password input type=password masking

**ESTIMATE (hours)**: 3

**DEPENDENCIES**:
- blocked-by: Task 2 (useAuth hook)
- blocks: Task 5 (LoginPage uses LoginForm)
- parallelizable: Task 4 (PrivateRoute independent)

---

## 🎟️ TASK 4: Build PrivateRoute Guard Component

**Title**: [X51LABS-4] Create PrivateRoute Component for Route Protection  
**Issue Type**: Task  
**Objective**: Implement route guard that redirects unauthenticated users to /login.

**GOAL**:
- Create `src/ui-preact/components/auth/PrivateRoute.jsx` (~20-30 lines)
- Check useAuth.authenticated status
- If authenticated: render children
- If not authenticated: redirect to /login
- If loading: show loading state (don't redirect yet)

**SCOPE (In-scope)**:
- Route guard wrapper component
- Redirect logic to /login
- Loading state handling
- Works with React Router v6

**NON-GOALS (Out-of-scope)**:
- Custom loading UI (use simple spinner or show nothing)
- Role-based access control (future phase)
- Permission checking (future phase)

**CONSTRAINTS**:
- Must use React Router v6 `<Navigate>` component
- Must check useAuth hook
- Must handle loading state (don't redirect while checking auth)
- ASSUMPTION: React Router v6 installed (task 1)

**CONTEXT (Repo evidence)**:
- Files:
  - `src/ui-preact/hooks/useAuth.js` — hook to integrate
  - React Router v6 docs: `<Navigate to="/login" />`
- Versions:
  - React Router: v6.x

**PLAN (plan-first)**:
1. Create PrivateRoute.jsx with:
   - Destructure `{children}` from props
   - Call useAuth hook: `const { authenticated, loading } = useAuth()`
   - If loading: return `<div>Loading...</div>` (simple)
   - If !authenticated: return `<Navigate to="/login" replace />`
   - Else: return `{children}`
2. Add unit tests:
   - Test renders children when authenticated
   - Test redirects to /login when not authenticated
   - Test shows loading when loading=true
3. Add JSDoc prop types

**EXPECTED CHANGES (what will change)**:
- Code:
  - NEW: `src/ui-preact/components/auth/PrivateRoute.jsx` (~20-30 lines)
  - NEW: `tests/unit/components/PrivateRoute.test.js` (~60-80 lines)
- Config: None
- Data: None
- Tests: Unit tests for auth check + redirect
- Docs: JSDoc comments

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Render PrivateRoute with authenticated=true → Then: Children rendered
- [ ] Given: Render PrivateRoute with authenticated=false → Then: Navigate to /login triggered
- [ ] Given: Render PrivateRoute with loading=true → Then: Loading message shown
- [ ] Given: Run unit tests → Then: All pass

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] PrivateRoute.jsx created with guard logic
- [ ] Unit tests written and passing
- [ ] JSDoc complete
- [ ] No build errors

**VERIFICATION STEPS**:
```bash
npm run test:unit -- PrivateRoute
# Expected: All tests pass
```

**RISKS & MITIGATIONS**:
- **Risk**: Infinite redirect loops if auth check fails → **Mitigation**: Add loading state check

**ESTIMATE (hours)**: 2

**DEPENDENCIES**:
- blocked-by: Task 2 (useAuth hook)
- blocks: Task 5 (App uses PrivateRoute)
- parallelizable: Task 3 (LoginForm independent)

---

## 🎟️ TASK 5: Create LoginPage & AppPage Components

**Title**: [X51LABS-5] Build LoginPage and AppPage Container Components  
**Issue Type**: Task  
**Objective**: Create page components that LoginForm renders into, and main app container.

**GOAL**:
- Create `src/ui-preact/pages/LoginPage.jsx` (~30-40 lines)
- Create `src/ui-preact/pages/AppPage.jsx` (~40-60 lines)
- LoginPage: renders LoginForm, handles redirect after login
- AppPage: main container for portfolio/settings/other modules

**SCOPE (In-scope)**:
- LoginPage layout (card, centered, responsive)
- LoginPage success → navigate to /app
- AppPage layout with navigation structure
- Route nesting structure

**NON-GOALS (Out-of-scope)**:
- Portfolio/settings UI (already exists)
- Navigation menu styling (use existing patterns)

**CONSTRAINTS**:
- LoginPage should match current visual design
- No breaking changes to existing app structure
- ASSUMPTION: React Router v6 installed

**CONTEXT (Repo evidence)**:
- Files:
  - `src/ui/auth.js` (lines 119-161) — current HTML layout (for reference)
  - Existing app structure in `src/ui-preact/`

**PLAN (plan-first)**:
1. Create LoginPage.jsx:
   - Render container div with centered layout
   - Render LoginForm component
   - Add success handler (redirect to /app via useNavigate)
   - Match existing visual style
2. Create AppPage.jsx:
   - Render main app container (currently in index.js)
   - Will contain portfolio, settings, errors, english modules
   - Add logout button in header
   - Layout with sidebar/navigation
3. Add tests:
   - LoginPage renders LoginForm
   - AppPage renders without errors

**EXPECTED CHANGES (what will change)**:
- Code:
  - NEW: `src/ui-preact/pages/LoginPage.jsx` (~30-40 lines)
  - NEW: `src/ui-preact/pages/AppPage.jsx` (~40-60 lines)
  - NEW: `tests/unit/pages/LoginPage.test.js` (~50-60 lines)
  - NEW: `tests/unit/pages/AppPage.test.js` (~50-60 lines)
- Config: None
- Data: None
- Tests: Basic render tests
- Docs: JSDoc comments

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Render LoginPage → Then: LoginForm visible
- [ ] Given: Render AppPage → Then: App container renders without errors
- [ ] Given: Run tests → Then: All pass

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] LoginPage & AppPage created
- [ ] Unit tests written and passing
- [ ] Visual layout matches current design

**VERIFICATION STEPS**:
```bash
npm run test:unit -- LoginPage AppPage
# Expected: All tests pass
```

**ESTIMATE (hours)**: 2

**DEPENDENCIES**:
- blocked-by: Task 3 (LoginForm)
- blocks: Task 6 (App.jsx routing)
- parallelizable: None

---

## 🎟️ TASK 6: Build App.jsx Root Component with React Router

**Title**: [X51LABS-6] Create App.jsx with React Router Setup & Auth Check  
**Issue Type**: Task  
**Objective**: Build root component with BrowserRouter, route definitions, auth initialization, and auth state subscription.

**GOAL**:
- Create `src/ui-preact/App.jsx` (~50-80 lines)
- Setup React Router v6 with BrowserRouter (wrap entire app)
- Define routes: /login (public), /app/* (protected), catch-all 404
- Initialize auth check on mount (useEffect)
- Subscribe to background auth changes (listenAuthStateChanges)
- Wrap protected routes with PrivateRoute guard

**SCOPE (In-scope)**:
- Router setup with all route definitions
- useEffect for auth check on mount
- Auth state listener setup
- PrivateRoute wrapper for /app/*
- Loading state during initial auth check

**NON-GOALS (Out-of-scope)**:
- Nested route definitions (defer to index.jsx if needed)
- Analytics/telemetry (defer to later phase)

**CONSTRAINTS**:
- Must check auth on app start (before rendering anything)
- Must subscribe to background broadcasts (for token expiry)
- Must handle loading state properly
- ASSUMPTION: All dependency components exist (tasks 2-5)

**CONTEXT (Repo evidence)**:
- Files:
  - `src/ui-preact/index.jsx` — current entry point (will wrap with BrowserRouter)
  - `src/ui-preact/hooks/useAuth.js` — auth context
  - React Router v6 docs

**PLAN (plan-first)**:
1. Create App.jsx:
   - useEffect to call checkAuthStatus() on mount
   - useEffect to setup listenAuthStateChanges listener
   - Return JSX with:
     - Loading screen if loading (during initial check)
     - BrowserRouter wrapper
     - Routes:
       - `<Route path="/login" element={<LoginPage />} />`
       - `<Route path="/app" element={<PrivateRoute><AppPage /></PrivateRoute>} />`
       - `<Route path="/app/*" element={<PrivateRoute><AppPage /></PrivateRoute>} />`
       - `<Route path="*" element={<NotFoundPage />} />`
2. Integrate with AuthContext:
   - Wrap App in AuthProvider (in index.jsx)
3. Add unit tests:
   - Auth check called on mount
   - Routes render correctly
   - PrivateRoute guards /app

**EXPECTED CHANGES (what will change)**:
- Code:
  - NEW: `src/ui-preact/App.jsx` (~50-80 lines)
  - MODIFY: `src/ui-preact/index.jsx` — wrap `<App>` with `<AuthProvider>`
  - NEW: `tests/unit/App.test.js` (~80-100 lines)
  - NEW: `src/ui-preact/pages/NotFoundPage.jsx` (~15-20 lines)
- Config: None
- Data: None
- Tests: Routes test, auth check test
- Docs: JSDoc comments

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Render App → Then: checkAuthStatus() called
- [ ] Given: Authenticated user → Then: Route to /app works
- [ ] Given: Unauthenticated user → Then: Route to /login works
- [ ] Given: Navigate to unknown route → Then: 404 page shown
- [ ] Given: Run tests → Then: All pass

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] App.jsx created with router setup
- [ ] AuthProvider wraps app in index.jsx
- [ ] All routes defined and working
- [ ] Auth check on mount working
- [ ] Unit tests passing
- [ ] Build passes

**VERIFICATION STEPS**:
```bash
# 1. Run unit tests
npm run test:unit -- App
# Expected: All tests pass

# 2. Build
npm run build
# Expected: exit code 0

# 3. Manual test (after extension load)
# Load extension → Should show login or app depending on auth
```

**RISKS & MITIGATIONS**:
- **Risk**: Router conflicts with existing setup → **Mitigation**: Check current setup in task 1, plan integration
- **Risk**: Auth check delays app render → **Mitigation**: Show loading state, not blank page

**ESTIMATE (hours)**: 3

**DEPENDENCIES**:
- blocked-by: Tasks 2, 3, 4, 5 (all components needed)
- blocks: Task 7 (E2E tests), Task 8 (cleanup)
- parallelizable: None (requires all others)

---

## 🎟️ TASK 7: Write E2E Tests & Integration Tests

**Title**: [X51LABS-7] Add Playwright E2E Tests for Login Flow  
**Issue Type**: Task  
**Objective**: Comprehensive E2E tests covering login, logout, session persistence, token expiry, error scenarios.

**GOAL**:
- Create `tests/e2e/login.spec.js` Playwright test suite
- Test scenarios: login valid/invalid, logout, refresh persistence, token expiry, error handling
- Test multi-tab sync (optional but documented)
- Verify integration with background auth handlers

**SCOPE (In-scope)**:
- Login with valid credentials → redirect to /app
- Login with invalid credentials → error message
- Logout button → redirect to /login
- Page refresh → session persists
- Token expiry → auto-redirect to /login (simulated)
- Error scenarios: network error, timeout, invalid response

**NON-GOALS (Out-of-scope)**:
- Performance testing
- Visual regression testing
- Accessibility testing (audit separately)
- Multi-browser testing (Chrome only for now)

**CONSTRAINTS**:
- Must use Playwright (existing test infrastructure)
- Must test with real Supabase auth (or mock)
- Must verify background message passing works
- ASSUMPTION: Extension loads in test environment

**CONTEXT (Repo evidence)**:
- Files:
  - `tests/e2e/portfolio.spec.js` — existing E2E pattern to follow
  - `playwright.config.js` — test setup
- Versions:
  - Playwright: existing in project

**PLAN (plan-first)**:
1. Create login.spec.js with test blocks:
   - Setup: Load extension, navigate to /login
   - Test: Load /login → form visible
   - Test: Invalid email → validation error
   - Test: Valid credentials → success → /app
   - Test: Invalid credentials → error message
   - Test: Logout → redirect to /login
   - Test: Refresh /app → stay on /app (session persists)
   - Test: Token expiry (mocked) → redirect to /login
   - Test: Unauthorized /app access → redirect to /login
2. Integration tests:
   - Verify background messages sent/received
   - Verify auth context updates
   - Verify token stored in chrome.storage.local
3. Error scenarios:
   - Network error during login
   - Timeout during auth check
   - Invalid response from Supabase

**EXPECTED CHANGES (what will change)**:
- Code:
  - NEW: `tests/e2e/login.spec.js` (~150-200 lines)
  - NEW: `tests/e2e/helpers/authHelper.js` (~50-80 lines) — reusable auth test helpers
- Config: None
- Data: None
- Tests: Comprehensive E2E tests
- Docs: Test scenario documentation in spec file

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: Run E2E tests → Then: All scenarios pass
- [ ] Given: Test login with valid credentials → Then: Redirect to /app observed
- [ ] Given: Test login with invalid credentials → Then: Error displayed
- [ ] Given: Test logout → Then: Redirect to /login observed
- [ ] Given: Test refresh session → Then: User stays logged in
- [ ] Given: Run all tests → Then: `npm run test:e2e` passes

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] All E2E tests written and passing
- [ ] Test coverage >80% of auth flows
- [ ] Error scenarios tested
- [ ] Helper functions reusable for future tests
- [ ] Test documentation complete

**VERIFICATION STEPS**:
```bash
# 1. Run E2E tests
npm run test:e2e -- tests/e2e/login.spec.js
# Expected: All tests pass

# 2. Check coverage
npm run test:e2e -- --reporter=list tests/e2e/login.spec.js
# Expected: All scenarios covered
```

**RISKS & MITIGATIONS**:
- **Risk**: Tests flaky due to timing → **Mitigation**: Use proper Playwright waits (`waitForSelector`, etc.)
- **Risk**: Supabase auth not available in test → **Mitigation**: Mock auth responses

**ESTIMATE (hours)**: 4

**DEPENDENCIES**:
- blocked-by: Task 6 (all components needed)
- blocks: Task 8 (cleanup)
- parallelizable: None

---

## 🎟️ TASK 8: Integration, Cleanup & Migration Complete

**Title**: [X51LABS-8] Remove Old Auth Code & Complete Migration  
**Issue Type**: Task  
**Objective**: Remove vanilla JS auth code, update documentation, verify no regressions, mark migration complete.

**GOAL**:
- Delete `src/ui/auth.js` (vanilla JS, no longer needed)
- Remove auth-related code from `src/ui/index.js` (keep non-auth modules)
- Verify all tests still pass
- Update CHANGELOG
- Verify no breaking changes

**SCOPE (In-scope)**:
- Delete src/ui/auth.js
- Remove auth initialization from src/ui/index.js (keep portfolio/settings initialization)
- Verify no references to old auth code remain
- Run full test suite (unit + E2E)
- Build production bundle and verify size
- Update docs

**NON-GOALS (Out-of-scope)**:
- Refactoring other modules (portfolio, settings, etc.)
- UI redesign

**CONSTRAINTS**:
- Must NOT break existing functionality
- Must NOT change background handlers
- Must maintain backward compatibility
- ASSUMPTION: All prior tasks complete

**CONTEXT (Repo evidence)**:
- Files:
  - `src/ui/auth.js` (272 lines) — to delete
  - `src/ui/index.js` (218 lines) — to edit
  - `CHANGELOG.md` (if exists) — to update

**PLAN (plan-first)**:
1. Delete src/ui/auth.js:
   - Create git branch (should already be done from task 1)
   - `git rm src/ui/auth.js`
   - Verify no other files import from it: `grep -r "from.*auth.js" src/`
2. Edit src/ui/index.js:
   - Remove auth-related imports
   - Remove showLoginScreen() and auth initialization code
   - Keep portfolio, settings, errors, history initialization
   - Keep listenAuthStateChanges if needed (or move to App.jsx)
3. Update imports in src/ui-preact/index.jsx:
   - Ensure it imports from App.jsx (not old auth.js)
4. Verify:
   - npm run build (no errors)
   - npm run test:unit (all unit tests pass)
   - npm run test:e2e (all E2E tests pass)
   - No console errors when extension loads
5. Update CHANGELOG:
   - Add entry: "Migration complete: login page refactored to Preact + React Router"
   - Link to epic X51LABS-#
6. Git commit:
   - Message: "feat: complete login page migration to Preact + React Router"

**EXPECTED CHANGES (what will change)**:
- Code:
  - DELETE: `src/ui/auth.js` (272 lines gone)
  - MODIFY: `src/ui/index.js` — remove auth code (~50-60 lines removed)
  - MODIFY: `src/ui-preact/index.jsx` — import from App.jsx
- Config: None
- Data: None
- Tests: No new tests (all prior tasks have tests)
- Docs: CHANGELOG updated

**ACCEPTANCE CRITERIA (Pass/Fail)**:
- [ ] Given: src/ui/auth.js deleted → Then: No import errors remain
- [ ] Given: src/ui/index.js edited → Then: Non-auth modules still work
- [ ] Given: Run all tests → Then: Unit + E2E pass
- [ ] Given: Build → Then: exit code 0, bundle size acceptable
- [ ] Given: Load extension → Then: No console errors
- [ ] Given: Login flow → Then: Works as before (visual/functional)

**DoD (Definition of Done) — Checklist**:
- [ ] Baseline DoD satisfied
- [ ] Old auth code deleted
- [ ] Build passes
- [ ] All tests pass (unit + E2E)
- [ ] No console errors
- [ ] CHANGELOG updated
- [ ] Git commit with clear message

**VERIFICATION STEPS**:
```bash
# 1. Verify auth.js deleted
ls src/ui/auth.js
# Expected: file not found (error is good)

# 2. Check no imports remain
grep -r "from.*auth.js" src/
# Expected: no results

# 3. Build
npm run build
# Expected: exit code 0

# 4. Run all tests
npm run test:unit
npm run test:e2e
# Expected: all pass

# 5. Verify no console errors
# Load extension and check DevTools console
# Expected: no errors

# 6. Verify login still works
# Login with valid credentials
# Expected: redirect to /app, fully functional
```

**RISKS & MITIGATIONS**:
- **Risk**: Breaking existing app → **Mitigation**: Comprehensive testing before delete
- **Risk**: Some code still references old auth → **Mitigation**: grep search catches it

**ESTIMATE (hours)**: 2

**DEPENDENCIES**:
- blocked-by: Task 7 (E2E tests passing)
- blocks: None (final task)
- parallelizable: None (final cleanup)

---

## ✅ COVERAGE MATRIX

| Big-Task Deliverable | Task 1 | Task 2 | Task 3 | Task 4 | Task 5 | Task 6 | Task 7 | Task 8 | Coverage |
|---|---|---|---|---|---|---|---|---|---|
| 8 Preact components created | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | 100% |
| URL routing (/login, /app) | ✓ | - | - | - | ✓ | ✓ | ✓ | - | 100% |
| Centralized auth state | - | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - | 100% |
| Old code removed | - | - | - | - | - | - | - | ✓ | 100% |
| Session persistence | - | ✓ | - | - | - | ✓ | ✓ | - | 100% |
| E2E tests covering flows | - | - | - | - | - | - | ✓ | ✓ | 100% |
| Zero breaking changes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| Build passes, no errors | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |

---

## 📊 DEPENDENCY & PARALLELIZATION PLAN

**Gate Task** (Serial):
- Task 1 (Setup) → blocks all others

**Parallelizable** (After Task 1 complete):
- Tasks 2, 3, 4 can run **in parallel** (independent components)
  - Task 2: AuthContext + hook
  - Task 3: LoginForm
  - Task 4: PrivateRoute

**Serial Dependencies**:
- Task 5 (LoginPage/AppPage) → needs Tasks 3, 4 complete
- Task 6 (App.jsx) → needs Tasks 2, 3, 4, 5 complete
- Task 7 (E2E tests) → needs Task 6 complete
- Task 8 (Cleanup) → needs Task 7 complete

**Recommended Execution**:
```
Week 1:
  Monday:   Task 1 (Setup + dependencies) — 2h
  Tuesday:  Tasks 2, 3, 4 (parallel) — 3h each developer
  Wednesday: Task 5 (LoginPage + AppPage) — 2h
  Thursday: Task 6 (App.jsx) — 3h
            Task 7 (E2E tests) — 4h
  Friday:   Task 8 (Cleanup + verify) — 2h
            
Total: ~21 person-hours (8-10 days if 1 developer, 3-4 days if 2-3 developers working in parallel)
```

---

## 🎯 RISKS SUMMARY (Top 5)

1. **React Router v6 Not Installed** (HIGH)
   - **Impact**: Blocks all development
   - **Mitigation**: Task 1 will catch this; request `npm install` if missing

2. **Existing Router Conflicts** (MEDIUM)
   - **Impact**: Integration issues
   - **Mitigation**: Audit current setup in Task 1; plan integration points

3. **Session Persistence Broken** (MEDIUM)
   - **Impact**: Users logged out after refresh (critical UX issue)
   - **Mitigation**: Test extensively in Task 7 E2E tests

4. **E2E Tests Flaky** (LOW)
   - **Impact**: Slow down development
   - **Mitigation**: Use proper Playwright waits; implement retry logic

5. **Breaking Changes** (LOW)
   - **Impact**: Existing app breaks
   - **Mitigation**: Comprehensive testing throughout; backward compatibility checks

---

## 📋 READY FOR JIRA CREATION

All 8 tasks are ready to be created as Jira tickets. Proceeding to use Atlassian MCP...

