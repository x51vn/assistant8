# Login Page Migration - Quick Review Summary

**Date**: January 31, 2026  
**Document**: [LOGIN_PAGE_MIGRATION.md](./LOGIN_PAGE_MIGRATION.md) (Full)  
**Status**: ✅ Design & Review Phase (Ready for Discussion)

---

## 🎯 What Are We Doing?

Migrate the **Login/Authentication page** from:
- ❌ **Vanilla JavaScript** (DOM strings, manual event listeners)
- ✅ **Preact + React Router** (component-based, routing, state management)

### Why?
1. **Consistency** - Portfolio already uses Preact, auth should too
2. **Routing** - Clean URL-based navigation (/login vs /app)
3. **Maintainability** - Component structure easier to test/extend
4. **Code organization** - Auth state centralized in context

---

## 📊 Current vs Target

| Aspect | Current (Vanilla) | Target (Preact) |
|--------|------------------|-----------------|
| **Framework** | DOM API only | Preact + React Router v6 |
| **Routing** | Manual toggle `display: none` | URL-based: `/login`, `/app` |
| **State** | Local + chrome messages | Preact Context + Hooks |
| **File Structure** | `src/ui/auth.js` | `src/ui-preact/components/auth/*` |
| **Components** | Single function `renderLoginScreen()` | LoginForm, LoginPage, PrivateRoute |
| **Code Reuse** | N/A | LoginForm can be reused |

---

## 🏗️ Component Structure (Target)

### New Files to Create (Total: ~300-400 lines)

```
src/ui-preact/
├── App.jsx                              # Root with routing
├── pages/
│   ├── LoginPage.jsx                    # /login page
│   ├── AppPage.jsx                      # /app main container
│   └── NotFoundPage.jsx                 # 404
└── components/auth/
    ├── LoginForm.jsx                    # Form component (email + password)
    ├── PrivateRoute.jsx                 # Route guard (auth check)
    ├── AuthContext.jsx                  # State management
    └── useAuth.js                       # Auth hook
```

### Router Structure (Target)

```
/login              → LoginPage (public)
/app                → AppPage (protected)
/app/portfolio      → PortfolioPage
/app/settings       → SettingsPage
/app/errors         → ErrorsPage
/app/english        → EnglishPage
/* (404)            → NotFoundPage
```

---

## 🔄 Auth Flow (How It Works)

### On App Start
```
1. App.jsx mounts
2. Check auth status (background message to Supabase)
3. If authenticated → render /app (PrivateRoute)
4. If not authenticated → render /login
5. Subscribe to background auth changes (for session expiry)
```

### On Login
```
1. User enters email + password
2. LoginForm validates
3. Call background login handler
4. Background authenticates with Supabase
5. Token saved to chrome.storage.local
6. Background broadcasts AUTH_STATE_CHANGED
7. AuthContext updates
8. Navigate to /app
```

### On Logout
```
1. User clicks logout
2. Call background logout handler
3. Token cleared from storage
4. Navigate to /login
5. PrivateRoute guards any direct access to /app
```

---

## 📋 Key Components

### 1. **LoginForm.jsx** (~80-120 lines)
- Email input with validation
- Password input (masked)
- Submit button with loading state
- Error message display
- On success: redirect to /app

### 2. **PrivateRoute.jsx** (~15-25 lines)
- Route guard component
- Checks if user is authenticated
- If no: redirect to /login
- If yes: render children

### 3. **AuthContext.jsx** (~30-50 lines)
- Central auth state
- Holds: `authenticated`, `user`, `loading`, `error`
- Updated from background broadcasts

### 4. **useAuth.js** (~15-25 lines)
- Hook to access AuthContext
- Provides: `login()`, `logout()`, `checkAuthStatus()`

### 5. **App.jsx** (~50-80 lines)
- Root component
- Initialize auth check on mount
- Setup router with /login, /app routes
- Listen for background auth changes

---

## ⏱️ Timeline & Effort

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1: Setup** | 1 day | Create component structure, setup Router |
| **Phase 2: Components** | 1 day | Build LoginForm, PrivateRoute, AuthContext |
| **Phase 3: Integration** | 0.5 day | Connect to existing UI, remove old code |
| **Phase 4: Testing** | 0.5 day | E2E tests, session persistence, error cases |

**Total**: ~2-3 days

---

## 🔌 Integration Points

### Reuse (No Changes)
- `login()` - backend login handler (works as-is)
- `logout()` - backend logout handler (works as-is)
- `checkAuthStatus()` - backend auth check (works as-is)
- Database schema - already has user_id + RLS

### Enhance (Minor Changes)
- `src/ui-preact/api/authApi.js` - Add `listenAuthStateChanges()` function
- `src/ui-preact/index.jsx` - Wrap with BrowserRouter

### Deprecate (Delete)
- `src/ui/auth.js` - Old vanilla JS (archive/delete)
- `src/ui/index.js` - Auth-related code only (keep non-auth parts)

---

## 🧪 Testing Strategy

### Unit Tests
- ✅ LoginForm renders
- ✅ Form validates email/password
- ✅ PrivateRoute redirects if not auth
- ✅ useAuth hook returns auth context

### E2E Tests (Playwright)
- ✅ Load /login → show form
- ✅ Load /app unauthenticated → redirect to /login
- ✅ Login with invalid credentials → show error
- ✅ Login with valid credentials → redirect to /app
- ✅ Logout → redirect to /login
- ✅ Refresh /app → stay on /app (session persists)
- ✅ Token expiry → auto-redirect to /login

---

## ⚠️ Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Router conflicts | Medium | Check if Router already setup in current Preact |
| Session persistence broken | High | Test with token refresh scenarios |
| Auth state out of sync | Medium | Add logging for state changes |
| Bundle size increase | Low | React Router is ~40KB (acceptable) |

---

## 📊 Before/After Comparison

### Before (Current)
```javascript
// In src/ui/index.js - mixed concerns
async function init() {
  const authContainer = document.createElement("div");
  const { authenticated, user } = await checkAuthStatus();
  
  if (!authenticated) {
    showLoginScreen(); // Vanilla JS DOM manipulation
  } else {
    hideLoginAndInitializeApp(); // Manual display toggle
  }
}

// In src/ui/auth.js - 272 lines
export function renderLoginScreen(container, onLoginSuccess) {
  container.innerHTML = `<div class="auth-container">...`; // HTML strings
  // Manual event listeners...
}
```

### After (Target)
```jsx
// In App.jsx - clear separation
function App() {
  const [authState, setAuthState] = useState({...});
  
  useEffect(() => {
    checkAuthStatus().then(setAuthState); // Clean async
    const unsub = listenAuthStateChanges(setAuthState); // Subscribe
    return () => unsub(); // Cleanup
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app/*" element={<PrivateRoute><AppPage /></PrivateRoute>} />
    </Routes>
  );
}

// In LoginForm.jsx - focused component
function LoginForm() {
  return (
    <form onSubmit={handleLogin}>
      <input type="email" value={email} onChange={...} />
      <input type="password" value={password} onChange={...} />
      {error && <div className="error">{error}</div>}
      <button>{loading ? <Spinner /> : 'Đăng nhập'}</button>
    </form>
  );
}
```

---

## ✅ Acceptance Criteria

- ✅ Auth check happens on app load
- ✅ Unauthenticated users see /login
- ✅ Login form validates & submits correctly
- ✅ Session persists on page refresh
- ✅ Token expiry triggers redirect to /login
- ✅ Logout works from any page
- ✅ All E2E tests pass
- ✅ No console errors
- ✅ Bundle size < 5% increase

---

## 🔙 Rollback Plan

If anything breaks:
1. **Fast rollback** (~30 mins): Keep old vanilla code, don't merge
2. **Git revert** (~1 hour): `git revert` commits
3. **Feature flag** (best): Use env var to switch between old/new

---

## 📚 Supporting Docs

- **Full Design**: [LOGIN_PAGE_MIGRATION.md](./LOGIN_PAGE_MIGRATION.md) - 500+ lines with code examples
- **Portfolio Migration**: [PORTFOLIO_PAGE_MIGRATION.md](./PORTFOLIO_PAGE_MIGRATION.md) - Similar migration pattern
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - Message schema, auth flow
- **Storage**: [STORAGE_EXPLAINED.md](./STORAGE_EXPLAINED.md) - Token persistence

---

## ❓ Questions Before Starting?

1. **Router**: Is React Router v6 already installed? (Check `npm list react-router-dom`)
2. **Timeline**: Can we do this in 2-3 days?
3. **Scope**: Should we add signup/password reset in Phase 2?
4. **Testing**: Should we use Playwright for all E2E tests?

---

**Status**: 📋 Ready for Team Review  
**Next Step**: Discuss & approve → Begin Phase 1  
**Full Doc**: [LOGIN_PAGE_MIGRATION.md](./LOGIN_PAGE_MIGRATION.md)
