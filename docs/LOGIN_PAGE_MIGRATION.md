# Login Page Migration to Preact + React Router

> **Status**: Design Document (Review Phase - No Implementation Yet)  
> **Date**: January 31, 2026  
> **Ticket**: X51LABS-155 (Estimated)  
> **Complexity**: MEDIUM  
> **Estimated Effort**: 2-3 days  
> **Priority**: HIGH (Required before portfolio migration can be completed)  
> **Scope**: Full page rebuild using Preact + React Router v6  

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Current Implementation Analysis](#current-implementation-analysis)
3. [Target Architecture](#target-architecture)
4. [Component Structure](#component-structure)
5. [State Management](#state-management)
6. [Integration Points](#integration-points)
7. [Migration Strategy](#migration-strategy)
8. [Files to Create](#files-to-create)
9. [Files to Modify](#files-to-modify)
10. [Implementation Checklist](#implementation-checklist)
11. [Acceptance Criteria](#acceptance-criteria)
12. [Rollback Plan](#rollback-plan)

---

## 📱 Overview

### Current State
- Login is implemented in **vanilla JS** in `src/ui/auth.js`
- Uses **static HTML rendering** with DOM event listeners
- **Mixed with** vanilla JS DOM manipulation in `src/ui/index.js`
- **No component abstraction** - HTML string interpolation only
- **No form validation framework** - manual validation
- **No routing** - static page toggle

### Target State
- Login page as **dedicated Preact component** using React Router
- **Route-based navigation**: `/login` vs `/app`
- **Centralized state** with Preact hooks (useState, useContext)
- **Form validation** with error messages
- **Redirect after login** to `/app` with auth state
- **Session persistence** - check auth on app load
- **Logout redirects** back to `/login`

### Why Migrate?
1. **Component reusability** - LoginForm can be used in multiple contexts
2. **Router integration** - React Router handles navigation, auth guards
3. **State management** - Preact context for auth state (vs global chrome messages)
4. **Code organization** - Login UI decoupled from portfolio, settings, etc.
5. **Consistency** - Portfolio already Preact, auth should follow same pattern
6. **Testability** - Component-based makes E2E tests easier
7. **TypeScript readiness** - Preact components easier to type

### Key Differences from Current Implementation
| Aspect | Current (Vanilla) | Target (Preact) |
|--------|------------------|-----------------|
| **Framework** | DOM API only | Preact + React Router |
| **Routing** | Manual toggle `display: none` | URL-based routing |
| **State** | Local variables + chrome messages | Preact hooks + context |
| **Form Validation** | Manual checks | Form library (optional) |
| **Component Reuse** | N/A | LoginForm, AuthProvider |
| **Entry Point** | `src/ui/index.js` init() | `src/ui-preact/App.jsx` |
| **Navigation** | `showLoginScreen()` / `hideLoginScreen()` | `<Navigate to="/login" />` |
| **Auth Guard** | Manual checks | PrivateRoute wrapper |

---

## 🔧 Current Implementation Analysis

### File: `src/ui/auth.js` (272 lines)

#### **Functions** (Current)

| Function | Lines | Purpose | Issues |
|----------|-------|---------|--------|
| `checkAuthStatus()` | 16-45 | GET auth from background | Works, reuse as-is |
| `login(email, pwd)` | 47-79 | POST login to background | Works, reuse as-is |
| `logout()` | 81-112 | POST logout to background | Works, reuse as-is |
| `renderLoginScreen(container, onLoginSuccess)` | 114-200 | DOM string + event listeners | ❌ Replace with Preact component |
| `hideLoginScreen(container)` | 202-210 | Clear container | ❌ Replace with routing |
| `listenAuthStateChanges(callback)` | 212-224 | chrome.runtime.onMessage listener | Reuse/adapt for auth context |

#### **HTML Structure** (Lines 119-161)
```html
<div class="auth-container">
  <div class="auth-card">
    <div class="auth-header">
      <h1>ChatGPT Assistant</h1>
      <p>Vui lòng đăng nhập để tiếp tục</p>
    </div>
    <form id="loginForm" class="auth-form">
      <!-- Email input -->
      <!-- Password input -->
      <!-- Error div -->
      <!-- Submit button -->
    </form>
    <div class="auth-footer">...</div>
  </div>
</div>
```

#### **Event Handling** (Lines 162-196)
```javascript
const form = container.querySelector('#loginForm');
form.addEventListener('submit', async (e) => {
  // Validate inputs
  // Show loading state
  // Call login(email, password)
  // Handle response (success → onLoginSuccess callback)
  // Handle errors (show in errorDiv)
  // Reset button state
});
```

### File: `src/ui/index.js` (218 lines)

#### **Functions** (Current)

| Function | Purpose | Integration Point |
|----------|---------|-------------------|
| `init()` | Main entry point | Orchestrates auth check + login/app UI toggle |
| `showLoginScreen()` | Render login form | Calls `renderLoginScreen()` from auth.js |
| `hideLoginAndInitializeApp()` | Load portfolio + all UI modules | Called after successful login |
| `listenAuthStateChanges()` | chrome.runtime.onMessage for auth changes | Auth state sync |

#### **Flow** (Lines 22-90)
```javascript
async function init() {
  // 1. Create auth container
  const authContainer = document.createElement("div");
  
  // 2. Check auth status
  const { authenticated, user } = await checkAuthStatus();
  
  // 3. If not authenticated → showLoginScreen()
  // 4. If authenticated → hideLoginAndInitializeApp()
  
  // 5. Listen for auth state changes (background broadcast)
  listenAuthStateChanges(({ authenticated, user }) => {
    if (authenticated) {
      hideLoginAndInitializeApp();
    } else {
      showLoginScreen();
    }
  });
}
```

#### **Issues** (Current)
1. ❌ **Mixed responsibilities** - auth UI logic in index.js
2. ❌ **No routing** - manual display toggle `display: none`
3. ❌ **Auth container duplicate** - separate from main container
4. ❌ **Hard to test** - DOM manipulation makes E2E tests fragile
5. ❌ **Inconsistent** - portfolio already Preact, auth still vanilla JS

---

## 🎯 Target Architecture

### File Structure (Target)
```
src/ui-preact/
├── App.jsx                           # NEW: Root component with routing
├── pages/
│   ├── LoginPage.jsx                 # NEW: Login page component
│   ├── AppPage.jsx                   # NEW: Main app (portfolio, settings, etc)
│   └── NotFoundPage.jsx              # NEW: 404 page
├── components/
│   ├── auth/
│   │   ├── LoginForm.jsx             # NEW: Login form component
│   │   └── PrivateRoute.jsx          # NEW: Route guard component
│   └── ... (existing)
├── context/
│   ├── AuthContext.jsx               # NEW: Auth state context
│   └── ... (existing)
├── hooks/
│   └── useAuth.js                    # NEW: Auth hook (or update existing)
└── api/
    └── authApi.js                    # REUSE: Background communication
```

### Router Structure (Target)
```
/login              → <LoginPage />     (public route)
/app                → <AppPage />       (private route - auth required)
/app/portfolio      → <PortfolioPage /> (private route)
/app/settings       → <SettingsPage />  (private route)
/app/errors         → <ErrorsPage />    (private route)
/* (undefined)      → <NotFoundPage />  (catch-all)
```

### Auth Flow (Target)
```
1. App.jsx init
   ├─ Check auth status (background message)
   ├─ If authenticated
   │  ├─ Set authContext.user
   │  └─ Render PrivateRoute → AppPage (or redirect from /login)
   └─ If not authenticated
      ├─ Clear authContext.user
      └─ Render LoginPage (or redirect from /app)

2. Login submission
   ├─ LoginForm.jsx onSubmit
   ├─ Call login(email, password)
   ├─ If success
   │  ├─ Update authContext.user
   │  ├─ Broadcast to background (optional - already done by background)
   │  └─ Navigate to /app
   └─ If error
      └─ Display error in form

3. Logout action
   ├─ Call logout() (background message)
   ├─ Clear authContext.user
   └─ Navigate to /login

4. Session refresh
   ├─ Background broadcast AUTH_STATE_CHANGED message
   ├─ AuthContext updates from chrome.runtime.onMessage
   └─ Router redirects based on new auth state
```

### Component Hierarchy (Target)
```jsx
<BrowserRouter>
  <App>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route 
        path="/app/*" 
        element={
          <PrivateRoute>
            <AppPage />
          </PrivateRoute>
        } 
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </App>
</BrowserRouter>
```

---

## 🏗️ Component Structure

### 1. `App.jsx` (Root Component)

**Responsibilities**:
- Initialize Preact app with Preact Router
- Check auth status on mount
- Provide AuthContext to all children
- Listen for background auth state changes
- Handle session expiry (token refresh)

**State**:
```jsx
const [authState, setAuthState] = useState({
  authenticated: false,
  user: null,
  loading: true,
  error: null
});
```

**Implementation Outline**:
```jsx
export function App() {
  const [authState, setAuthState] = useState({
    authenticated: false,
    user: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    // 1. Check auth on mount
    checkAuthStatus()
      .then(status => {
        setAuthState({
          ...status,
          loading: false
        });
      })
      .catch(error => {
        setAuthState(prev => ({
          ...prev,
          error: error.message,
          loading: false
        }));
      });

    // 2. Listen for auth state changes from background
    const unsubscribe = listenAuthStateChanges(({ authenticated, user }) => {
      setAuthState({
        authenticated,
        user,
        loading: false,
        error: null
      });
    });

    return () => unsubscribe?.();
  }, []);

  if (authState.loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <AuthProvider value={authState}>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/app/*" 
            element={<PrivateRoute><AppPage /></PrivateRoute>} 
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
```

**Lifecycle**:
- Mount: Check auth status
- Update: Listen for background auth changes
- Render: Route based on auth state

---

### 2. `LoginPage.jsx` (Page Component)

**Responsibilities**:
- Render login page layout
- Display login form
- Handle redirect if already authenticated
- Show loading state during submission

**Integration**:
- Uses `<LoginForm />` component
- Uses `useAuth()` hook to check if already authenticated
- Redirects to `/app` if already logged in

**Implementation Outline**:
```jsx
export function LoginPage() {
  const { authenticated } = useAuth();
  
  // Redirect if already logged in
  if (authenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <LoginForm />
      </div>
    </div>
  );
}
```

**Styling**:
- Centered card layout
- 400-500px width
- Responsive (mobile friendly)
- Same CSS as current implementation

---

### 3. `LoginForm.jsx` (Form Component)

**Responsibilities**:
- Render login form fields (email, password)
- Handle form submission
- Validate inputs (client-side)
- Display errors (inline)
- Show loading state during submission
- Redirect to `/app` on success

**State**:
```jsx
const [formState, setFormState] = useState({
  email: '',
  password: '',
  error: '',
  loading: false
});
```

**Props**: None (internal component)

**Implementation Outline**:
```jsx
export function LoginForm() {
  const [formState, setFormState] = useState({
    email: '',
    password: '',
    error: '',
    loading: false
  });
  
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate
    if (!formState.email || !formState.password) {
      setFormState(prev => ({
        ...prev,
        error: 'Vui lòng nhập đầy đủ email và mật khẩu'
      }));
      return;
    }

    // Show loading
    setFormState(prev => ({ ...prev, loading: true, error: '' }));

    // Call login
    const result = await login(formState.email, formState.password);

    if (result.success) {
      // Clear form
      setFormState({
        email: '',
        password: '',
        error: '',
        loading: false
      });
      // Navigate to app
      navigate('/app', { replace: true });
    } else {
      // Show error
      setFormState(prev => ({
        ...prev,
        loading: false,
        error: result.error
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="form-header">
        <h1>ChatGPT Assistant</h1>
        <p>Vui lòng đăng nhập để tiếp tục</p>
      </div>

      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={formState.email}
          onChange={(e) => setFormState(prev => ({
            ...prev,
            email: e.target.value
          }))}
          placeholder="your@email.com"
          disabled={formState.loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          type="password"
          value={formState.password}
          onChange={(e) => setFormState(prev => ({
            ...prev,
            password: e.target.value
          }))}
          placeholder="••••••••"
          disabled={formState.loading}
        />
      </div>

      {formState.error && (
        <div className="error-message">{formState.error}</div>
      )}

      <button 
        type="submit" 
        className="primary-btn"
        disabled={formState.loading}
      >
        {formState.loading ? (
          <>
            <span style={{ display: 'none' }}>Đăng nhập</span>
            <i className="fas fa-spinner fa-spin"></i>
          </>
        ) : (
          'Đăng nhập'
        )}
      </button>

      <div className="form-footer">
        <p className="note">
          <i className="fas fa-info-circle"></i>
          Sử dụng tài khoản Supabase để đăng nhập
        </p>
      </div>
    </form>
  );
}
```

---

### 4. `PrivateRoute.jsx` (Route Guard Component)

**Responsibilities**:
- Protect routes that require authentication
- Redirect unauthenticated users to `/login`
- Show loading state while checking auth

**Props**:
```jsx
{
  children: ReactNode  // Component to render if authenticated
}
```

**Implementation Outline**:
```jsx
export function PrivateRoute({ children }) {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
```

---

### 5. `AuthContext.jsx` (Context Provider)

**Responsibilities**:
- Provide auth state to all components
- Update when background broadcasts auth changes

**State Shape**:
```jsx
{
  authenticated: boolean,
  user: {
    id: string,           // User UUID
    email: string,
    aud?: string,
    role?: string,
    iat?: number,
    exp?: number,
    email_confirmed_at?: string,
    sub?: string,
    phone?: string,
    identities?: any[]
  } | null,
  loading: boolean,
  error: string | null,
  logout: () => Promise<void>  // Helper function
}
```

**Implementation Outline**:
```jsx
export const AuthContext = createContext(null);

export function AuthProvider({ children, value }) {
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

---

### 6. `useAuth.js` (Custom Hook)

**Responsibilities**:
- Provide convenient access to auth context
- Helper functions (login, logout, checkAuthStatus)

**Implementation Outline**:
```jsx
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  const logout = async () => {
    const result = await logoutApi();
    if (result.success) {
      context.setAuthState({
        authenticated: false,
        user: null,
        error: null
      });
    }
    return result;
  };

  return {
    ...context,
    logout
  };
}
```

---

### 7. `AppPage.jsx` (Main App Container)

**Responsibilities**:
- Render main app layout (navigation, sidebar, etc)
- Route to sub-pages (portfolio, settings, errors, english)
- Render user section (logout button)

**Child Routes**:
```jsx
/app/portfolio   → <PortfolioPage />
/app/settings    → <SettingsPage />
/app/errors      → <ErrorsPage />
/app/english     → <EnglishPage />
```

**Implementation Outline**:
```jsx
export function AppPage() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <nav className="top-nav">
        <div className="nav-brand">ChatGPT Assistant</div>
        <UserSection user={user} onLogout={logout} />
      </nav>
      
      <div className="app-container">
        <Routes>
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="errors" element={<ErrorsPage />} />
          <Route path="english" element={<EnglishPage />} />
          <Route path="*" element={<Navigate to="portfolio" replace />} />
        </Routes>
      </div>
    </div>
  );
}
```

---

## 🧠 State Management

### Auth State (Context)
```jsx
{
  authenticated: boolean,      // Is user logged in?
  user: UserObject | null,     // User profile from Supabase
  loading: boolean,            // Still checking auth?
  error: string | null         // Any auth errors?
}
```

### Form State (Component Local)
```jsx
{
  email: string,
  password: string,
  error: string,
  loading: boolean
}
```

### Auth State Flow

**Initialization**:
```
App mount
  ↓ useEffect
  ├─ Call checkAuthStatus() (background message)
  ├─ Update authContext with result
  └─ Subscribe to chrome.runtime.onMessage (AUTH_STATE_CHANGED)

Render
  ├─ If loading → show loading UI
  ├─ If authenticated → render PrivateRoute → AppPage
  └─ If not authenticated → render LoginPage
```

**Login Flow**:
```
LoginForm.onSubmit
  ├─ Validate inputs
  ├─ Call login(email, password) (background message)
  ├─ Background returns JWT token
  ├─ Background saves token to chrome.storage.local (via Supabase adapter)
  ├─ Background broadcasts AUTH_STATE_CHANGED message
  ├─ AuthContext updates (listening to chrome.runtime.onMessage)
  └─ Navigate to /app
```

**Logout Flow**:
```
UserSection.onLogout
  ├─ Call logout() (background message)
  ├─ Background clears token from chrome.storage.local
  ├─ Background broadcasts AUTH_STATE_CHANGED message
  ├─ AuthContext updates
  └─ Navigate to /login
```

**Session Expiry**:
```
Background detects token expired
  ├─ Broadcast AUTH_STATE_CHANGED { user: null }
  ├─ AuthContext updates
  └─ Router redirects to /login (via PrivateRoute guard)
```

---

## 🔌 Integration Points

### 1. Background Message API (Reuse from `src/ui/auth.js`)

**Functions to keep**:
- `checkAuthStatus()` - GET auth from background
- `login(email, password)` - POST login to background  
- `logout()` - POST logout to background
- `listenAuthStateChanges(callback)` - Subscribe to background auth changes

**File**: `src/ui-preact/api/authApi.js` (already exists, reuse or enhance)

**Implementation**:
```javascript
// Export from authApi.js for use in App.jsx
export async function checkAuthStatus() {
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });

  if (response.errorCode) {
    console.error('[AuthAPI] Auth check failed:', response.errorMessage);
    return { authenticated: false, user: null };
  }

  return {
    authenticated: response.authenticated || false,
    user: response.user || null
  };
}

export function listenAuthStateChanges(callback) {
  const listener = (message) => {
    if (message.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
      callback({
        authenticated: !!message.data?.user,
        user: message.data?.user || null
      });
    }
  };

  chrome.runtime.onMessage.addListener(listener);

  // Return unsubscribe function
  return () => chrome.runtime.onMessage.removeListener(listener);
}
```

### 2. Browser Router Integration

**Add to entry point** (`src/ui-preact/index.jsx`):
```jsx
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';

render(
  <BrowserRouter basename="/sidepanel.html">
    <App />
  </BrowserRouter>,
  document.getElementById('app')
);
```

**Note**: Check if Router already setup in current Preact app

### 3. Old Vanilla JS Removal

**Remove from `src/ui/index.js`**:
- `showLoginScreen()` - replaced by routing
- `hideLoginAndInitializeApp()` - replaced by PrivateRoute
- `hideLoginScreen()` - replaced by routing

**Keep in `src/ui/index.js`** (if still needed):
- Other UI initialization (results, results styling)
- Non-auth related modules

---

## 📋 Migration Strategy

### Phase 1: Preparation (Day 1)

**Tasks**:
1. ✅ Review current code (DONE - this document)
2. ⏳ Create component structure (create new .jsx files)
3. ⏳ Setup React Router context
4. ⏳ Create AuthContext + useAuth hook
5. ⏳ Verify npm dependencies (preact-router-v3 or react-router-dom installed)

**Verification**:
```bash
npm list react-router-dom
npm list preact-router
```

**Output** (expected):
```
├── react-router-dom@6.x.x  (or preact-router)
└── preact@10.x.x
```

### Phase 2: Component Implementation (Day 2)

**Tasks**:
1. ⏳ Implement `LoginForm.jsx` component
2. ⏳ Implement `LoginPage.jsx` page component
3. ⏳ Implement `PrivateRoute.jsx` guard
4. ⏳ Create `AuthContext.jsx` context
5. ⏳ Create `useAuth.js` hook
6. ⏳ Enhance `authApi.js` with router utilities

**Verification** (Unit Tests):
```javascript
// LoginForm renders correctly
// Form validates inputs
// Form submits to background API
// Error messages display
// Loading state shows during submission
```

### Phase 3: Integration (Day 2-3)

**Tasks**:
1. ⏳ Update `App.jsx` root component with router setup
2. ⏳ Update entry point (`src/ui-preact/index.jsx`) to wrap with BrowserRouter
3. ⏳ Remove vanilla JS auth logic from `src/ui/index.js`
4. ⏳ Update sidebar navigation to use React Router links
5. ⏳ Test redirect flows

**Verification** (E2E Tests):
```
✓ User not authenticated → show /login
✓ User submits valid login → redirect to /app
✓ User clicks logout → redirect to /login
✓ User tries /app without auth → redirect to /login
✓ Auth state changes from background → router updates
```

### Phase 4: Testing & Refinement (Day 3)

**Tasks**:
1. ⏳ Playwright E2E tests for full login flow
2. ⏳ Test session persistence (refresh page)
3. ⏳ Test error handling (invalid credentials)
4. ⏳ Test timeout (token expiry)
5. ⏳ CSS/styling refinement
6. ⏳ Accessibility audit (WCAG 2.1)

**Test Scenarios**:
| Scenario | Expected | Status |
|----------|----------|--------|
| Load /login → unauthenticated | Show login form | ⏳ |
| Load /app → unauthenticated | Redirect to /login | ⏳ |
| Valid email/password → login | Redirect to /app | ⏳ |
| Invalid email/password → login | Show error message | ⏳ |
| Refresh page after login | Still on /app (session persists) | ⏳ |
| Logout → confirm | Redirect to /login | ⏳ |
| Token expires → background detects | Auto-redirect to /login | ⏳ |

---

## 📁 Files to Create

### New Components

| File | Lines | Purpose | Dependencies |
|------|-------|---------|--------------|
| `src/ui-preact/App.jsx` | 50-80 | Root component with routing | preact, preact-router |
| `src/ui-preact/pages/LoginPage.jsx` | 20-30 | Login page wrapper | preact, react-router-dom, useAuth |
| `src/ui-preact/pages/AppPage.jsx` | 30-50 | Main app container | preact, react-router-dom |
| `src/ui-preact/pages/NotFoundPage.jsx` | 10-15 | 404 page | preact, react-router-dom |
| `src/ui-preact/components/auth/LoginForm.jsx` | 80-120 | Login form component | preact, useNavigate |
| `src/ui-preact/components/auth/PrivateRoute.jsx` | 15-25 | Route guard | preact, react-router-dom, useAuth |
| `src/ui-preact/context/AuthContext.jsx` | 30-50 | Auth context + provider | preact |
| `src/ui-preact/hooks/useAuth.js` | 15-25 | Auth hook | preact, AuthContext |

**Total New Lines**: ~300-400 lines (manageable)

### Modified Files

| File | Changes | Lines | Status |
|------|---------|-------|--------|
| `src/ui-preact/api/authApi.js` | Add `listenAuthStateChanges()` | +20 | ⏳ Review |
| `src/ui-preact/index.jsx` | Wrap App with BrowserRouter | +5 | ⏳ Review |
| `src/ui/auth.js` | Deprecate (keep for reference) | N/A | ⏳ Delete/Archive |
| `src/ui/index.js` | Remove auth UI code | -100 | ⏳ Cleanup |

---

## 🔄 Files to Modify

### 1. `src/ui-preact/api/authApi.js`

**Current State**: Has `checkAuthStatus()` and `logout()`

**Required Changes**:
```javascript
// ADD: listenAuthStateChanges function
export function listenAuthStateChanges(callback) {
  const listener = (message) => {
    if (message.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
      callback({
        authenticated: !!message.data?.user,
        user: message.data?.user || null
      });
    }
  };

  chrome.runtime.onMessage.addListener(listener);

  // Return unsubscribe function
  return () => chrome.runtime.onMessage.removeListener(listener);
}

// ADD: login function (NEW)
export async function loginApi(email, password) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { email, password }
    });

    if (response.errorCode) {
      return {
        success: false,
        error: response.errorMessage || 'Đăng nhập thất bại'
      };
    }

    return {
      success: true,
      user: response.data?.user || response.user
    };
  } catch (error) {
    return {
      success: false,
      error: 'Không thể kết nối. Vui lòng thử lại.'
    };
  }
}
```

### 2. `src/ui-preact/index.jsx`

**Current State**: Likely has Preact render code

**Required Changes**:
```jsx
// ADD: BrowserRouter wrapper
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';

const container = document.getElementById('app');

render(
  <BrowserRouter basename="/sidepanel.html">
    <App />
  </BrowserRouter>,
  container
);
```

### 3. `src/ui/index.js`

**Current State**: ~218 lines mixing auth + UI init

**Required Changes**:
```javascript
// REMOVE: All auth-related code
// - showLoginScreen()
// - hideLoginScreen()  
// - hideLoginAndInitializeApp()
// - checkAuthStatus()
// - listenAuthStateChanges()

// KEEP: Only non-auth setup
// - If any portfolio/settings init still needed
// - If any global CSS setup
```

**Deprecated Content**:
```javascript
// OLD (REMOVE):
export async function init() {
  // Auth container setup
  // checkAuthStatus()
  // showLoginScreen() / hideLoginAndInitializeApp()
  // listenAuthStateChanges()
}

// NEW (Keep in App.jsx):
// All auth logic moved to Preact components
```

---

## ✅ Implementation Checklist

### Pre-Implementation Review
- [ ] Verify current auth API works in `src/ui-preact/api/authApi.js`
- [ ] Check React Router v6 is installed
- [ ] Check Preact is v10+
- [ ] Review ARCHITECTURE.md for message schema
- [ ] Review current error handling patterns in SETTINGS_MIGRATION.md

### Component Implementation
- [ ] Create `LoginForm.jsx` with form validation
- [ ] Create `LoginPage.jsx` with auth redirect
- [ ] Create `PrivateRoute.jsx` with loading state
- [ ] Create `AuthContext.jsx` context + provider
- [ ] Create `useAuth.js` hook with helpers
- [ ] Create `AppPage.jsx` main container
- [ ] Create `NotFoundPage.jsx` 404 page

### Integration
- [ ] Update `App.jsx` with useEffect + auth check
- [ ] Update entry point with BrowserRouter
- [ ] Update `authApi.js` with missing functions
- [ ] Remove auth code from `src/ui/index.js`
- [ ] Verify all imports are correct
- [ ] Fix any TypeScript errors (if using TS)

### Testing
- [ ] Unit test: LoginForm renders
- [ ] Unit test: Form validation works
- [ ] Unit test: PrivateRoute guards routes
- [ ] E2E test: Login flow (invalid → valid → app)
- [ ] E2E test: Logout redirects to /login
- [ ] E2E test: Session persistence
- [ ] E2E test: Session expiry handling
- [ ] E2E test: Multiple tabs sync auth state

### Cleanup & Documentation
- [ ] Delete/archive old `src/ui/auth.js` references
- [ ] Update README with new routing structure
- [ ] Add migration notes to CHANGELOG
- [ ] Remove TODO comments
- [ ] Update architecture docs

### Performance & Security
- [ ] Verify token not logged to console
- [ ] Verify secure password field (no autofill bypass)
- [ ] Test on slow networks (3G throttle)
- [ ] Check bundle size impact of React Router

---

## 🎯 Acceptance Criteria

### Functional Requirements
✅ **Auth Check on Load**
- [ ] App checks auth status on mount
- [ ] If authenticated → show /app
- [ ] If not authenticated → show /login
- [ ] Loading state visible during check

✅ **Login Form**
- [ ] Email field validates format
- [ ] Password field masks input
- [ ] Form validates before submit
- [ ] Error messages display clearly
- [ ] Loading state during submission
- [ ] Success redirects to /app

✅ **Logout**
- [ ] Logout button visible in UserSection
- [ ] Click logout → navigate to /login
- [ ] Session cleared in background

✅ **Route Protection**
- [ ] Direct access to /app requires auth
- [ ] Unauthenticated users redirect to /login
- [ ] PrivateRoute shows loading while checking
- [ ] Public routes (login) accessible without auth

✅ **Session Persistence**
- [ ] Refresh /app → stay on /app (session persists)
- [ ] Refresh /login → stay on /login
- [ ] Token expiry → auto-redirect to /login

✅ **Auth State Sync**
- [ ] Background broadcast AUTH_STATE_CHANGED → UI updates
- [ ] Multiple tabs sync auth state
- [ ] Logout in one tab → logout in all tabs

### Code Quality
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] JSDoc comments on all components
- [ ] Unit tests for all components (>80% coverage)
- [ ] E2E tests for all user flows

### Performance
- [ ] Initial load < 2s
- [ ] Login submit < 5s
- [ ] Form validation instant
- [ ] No unnecessary re-renders

### Accessibility
- [ ] Keyboard navigation works
- [ ] Form labels properly associated
- [ ] Error messages announced (aria-live)
- [ ] Loading state has aria-label

---

## 🔙 Rollback Plan

### If Issues During Implementation

**Rollback Option 1: Keep Vanilla JS Login** (Fast)
- Keep old `src/ui/auth.js` + `src/ui/index.js` code
- Don't merge Preact components
- Cost: 30 mins
- Risk: Low

**Rollback Option 2: Revert Git Commits** (Medium)
- `git revert` new commits
- Restore old files from git
- Cost: 1 hour
- Risk: Very Low

**Rollback Option 3: Feature Flag** (Best Practice)
```javascript
// In App.jsx
const USE_PREACT_LOGIN = process.env.USE_PREACT_LOGIN === 'true';

if (USE_PREACT_LOGIN) {
  return <Routes>{/* Preact login */}</Routes>;
} else {
  return <OldVanillaLoginContainer />; // Fallback
}
```

**Trigger Rollback If**:
- Login form doesn't submit after 2 attempts
- Session persistence broken
- Auth state sync broken
- Bundle size increased > 30%
- Unit test coverage < 70%

---

## 📚 Reference Documents

### Architecture
- `/docs/ARCHITECTURE.md` - System design
- `/docs/ARCHITECTURE_REVIEW.md` - Architecture validation
- `/docs/STORAGE_EXPLAINED.md` - Auth token storage strategy

### Migration Examples
- `/docs/PORTFOLIO_PAGE_MIGRATION.md` - Component migration pattern
- `/docs/SETTINGS_MIGRATION.md` - Preact integration example
- `/docs/APPLY_MIGRATION_002.md` - Database migration pattern

### Current Implementation
- `src/ui/auth.js` - Vanilla JS auth (to replace)
- `src/ui/index.js` - Main entry point (to refactor)
- `src/ui-preact/api/authApi.js` - Background API (to enhance)

### Message Schema
- `src/shared/messageSchema.js` - Message types
  - `SUPABASE_AUTH_CHECK`
  - `SUPABASE_AUTH_LOGIN`
  - `SUPABASE_AUTH_LOGOUT`
  - `AUTH_STATE_CHANGED`

---

## 📞 Questions & Notes

### Open Questions
1. ❓ Should we keep old `src/ui/auth.js` for reference or delete immediately?
   - **Answer**: Keep archived as `src/ui/auth.js.old` for 1 sprint
   
2. ❓ Do we need OAuth/social login, or just email/password?
   - **Answer**: Email/password only for MVP (OAuth in Phase 2)
   
3. ❓ Should LoginForm be in separate npm package for reusability?
   - **Answer**: No, keep in main package (future consideration)
   
4. ❓ Preact Router v3 or React Router v6?
   - **Answer**: React Router v6 (already used in portfolio?)

### Implementation Notes
- Token refresh is automatic (Supabase SDK handles via `autoRefreshToken: true`)
- Error messages should match Vietnamese style guide from `src/shared/errorCodes.js`
- Use `generateCorrelationId()` for all background requests (logging/debugging)

---

## ✨ Success Metrics

After migration completes, we should have:

✅ **Code Metrics**
- 100% reduction in vanilla JS auth code
- 0 references to old `renderLoginScreen()` function
- 100% Preact component coverage for auth UI
- < 5% bundle size increase

✅ **User Experience**
- Same visual design as before
- Faster navigation (routing optimized)
- Better error messages (context-aware)
- Smoother transitions

✅ **Developer Experience**
- No more DOM string manipulation for auth
- Clear component hierarchy
- Easier to add new features (signup, password reset, etc.)
- Better testability (E2E + unit tests)

✅ **Technical Debt**
- Auth logic centralized in AuthContext
- Message flow clearly documented
- No duplicate auth checks
- Single source of truth for auth state

---

**Document Status**: ✅ Complete (Ready for Implementation Review)  
**Last Updated**: January 31, 2026  
**Next Step**: Review by team → Begin Phase 1 implementation
