# Login Migration - One-Pager for Team

**Date**: January 31, 2026 | **Status**: 📋 Ready for Review | **Ticket**: X51LABS-155

---

## TL;DR (30 seconds)

**What**: Rebuild login page from vanilla JS → Preact + React Router  
**Why**: Same pattern as portfolio (Preact), cleaner routing, better state management  
**Effort**: 2-3 days  
**Risk**: LOW (can rollback easily, no DB changes)  
**Decision**: Should we proceed?

---

## 📊 Quick Comparison

| Aspect | Current | After |
|--------|---------|-------|
| **Framework** | Vanilla JS (DOM strings) | Preact (components) |
| **Routing** | Manual toggle | URL-based (`/login`, `/app`) |
| **State** | Scattered global | Centralized Context |
| **Files** | 2 large files (auth.js, index.js) | 8 small components |
| **Lines** | 490 lines (mixed concerns) | 300-400 lines (focused) |
| **Testability** | Hard (DOM manipulation) | Easy (components) |

---

## 🎯 What We're Building

```
/login          → LoginPage (public)
                   └─ LoginForm component
                      ├─ Email input
                      ├─ Password input  
                      ├─ Error display
                      └─ Submit button

/app            → AppPage (protected)
   ├─ /portfolio
   ├─ /settings
   ├─ /errors
   └─ /english

PrivateRoute guard:
  ├─ Check auth status
  ├─ If authenticated → show page
  └─ If not → redirect to /login
```

---

## 🧠 How It Works (Auth Flow)

### 1. App Starts
```
✅ App.jsx loads
✅ Check auth status (background message)
✅ If authenticated → show /app
✅ If not → show /login
```

### 2. User Logs In
```
✅ Enter email + password
✅ Validate form
✅ Send to background (Supabase)
✅ Token saved → auth context updated
✅ Navigate to /app
```

### 3. User Logs Out
```
✅ Click logout
✅ Token cleared
✅ Navigate to /login
```

---

## 📈 Effort Estimate

```
Phase 1: Setup (1 day)
  • Verify dependencies (Router, Preact)
  • Create component structure
  • Setup context + hooks

Phase 2: Components (1 day)
  • LoginForm (form + validation)
  • LoginPage (page wrapper)
  • PrivateRoute (auth guard)
  • AuthContext (state)

Phase 3: Integration (0.5 day)
  • Connect to App.jsx
  • Update entry point
  • Remove old code

Phase 4: Testing (0.5 day)
  • Unit tests
  • E2E tests
  • Bug fixes

Total: 2-3 days (optimistic: 3 days, realistic: 4 days)
```

---

## ⚠️ Risks

| Risk | Probability | Impact | Fix |
|------|-------------|--------|-----|
| Router conflicts | Medium | High | Check current setup first |
| Session doesn't persist | Low | High | Test token refresh |
| Bundle size +10% | Low | Low | React Router is ~40KB |
| Bugs in routing | Low | Medium | E2E tests catch these |

**Overall Risk**: 🟢 **LOW** (can rollback easily)

---

## ✅ What Success Looks Like

- ✅ Login works (valid + invalid credentials)
- ✅ Logout works
- ✅ Session persists on refresh
- ✅ Token expiry auto-redirects to /login
- ✅ All E2E tests pass
- ✅ No console errors
- ✅ Same visual design as before

---

## 🔄 Comparison: Before vs After

### Before (❌ Current)
```javascript
// In src/ui/index.js - mixed auth + UI logic
async function init() {
  const { authenticated } = await checkAuthStatus();
  if (!authenticated) {
    showLoginScreen(); // Manual DOM manipulation
  }
}

// In src/ui/auth.js - 272 lines
export function renderLoginScreen(container) {
  container.innerHTML = `<div>...</div>`; // HTML strings!
  // Manual event listeners
  form.addEventListener('submit', ...);
}
```

### After (✅ Target)
```jsx
// In App.jsx - clear auth logic
function App() {
  const [auth, setAuth] = useState({...});
  
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app/*" element={
        <PrivateRoute><AppPage /></PrivateRoute>
      } />
    </Routes>
  );
}

// In LoginForm.jsx - focused component
function LoginForm() {
  return (
    <form onSubmit={handleLogin}>
      <input type="email" />
      <button>Đăng nhập</button>
    </form>
  );
}
```

---

## 📁 Files Impact

### Create (8 new files)
```
src/ui-preact/
├── App.jsx                          # Root with routing
├── pages/
│   ├── LoginPage.jsx                # /login page
│   ├── AppPage.jsx                  # /app container
│   └── NotFoundPage.jsx             # 404
└── components/auth/
    ├── LoginForm.jsx                # Form component
    ├── PrivateRoute.jsx             # Route guard
    └── context/
        ├── AuthContext.jsx          # State
        └── hooks/useAuth.js         # Hook
```

### Modify (3 files)
- `src/ui-preact/api/authApi.js` - Add `listenAuthStateChanges()`
- `src/ui-preact/index.jsx` - Wrap with BrowserRouter
- `src/ui/index.js` - Remove auth code (keep rest)

### Delete (Optional)
- `src/ui/auth.js` - Old vanilla JS (archive first)

---

## 🧪 Testing Checklist

### Automated (E2E Tests)
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (show error)
- [ ] Logout button works
- [ ] Unauthorized redirect to /login
- [ ] Session persists on refresh
- [ ] Token expiry auto-redirects
- [ ] Multiple tabs stay in sync

### Manual
- [ ] Visual design matches current
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Error messages clear
- [ ] Loading state visible

---

## 🎓 Why This Matters

### Current (❌ Problems)
- ❌ Auth mixed with UI logic (scattered)
- ❌ Manual DOM manipulation (fragile selectors)
- ❌ Hard to test (E2E tests break easily)
- ❌ No routing (confusing for users)
- ❌ Inconsistent (portfolio already Preact)

### After (✅ Benefits)
- ✅ Clear separation of concerns (auth context)
- ✅ Component-based (reusable, testable)
- ✅ URL-based routing (user-friendly)
- ✅ Preact ecosystem (consistent with project)
- ✅ Future-proof (easier to add signup, password reset)

---

## ❓ Key Questions for Team

1. **Can we do this in 2-3 days?**  
   → With 1 developer, yes (or 1.5 days with 2)

2. **What if it breaks?**  
   → Easy rollback (keep old code in git), low risk

3. **Can users still log in?**  
   → Yes, same background API (no changes needed)

4. **Do we need signup too?**  
   → Not now (Phase 2 enhancement)

5. **When should we start?**  
   → After portfolio migration stabilizes (or before, auth is foundation)

---

## 🚀 Next Steps

### Today (Review)
1. ✅ Read [LOGIN_PAGE_MIGRATION_SUMMARY.md](./LOGIN_PAGE_MIGRATION_SUMMARY.md) (10 mins)
2. ✅ Read this one-pager
3. ✅ Discuss: Pros/cons, timeline, scope
4. ✅ Decide: Proceed or defer?

### Tomorrow (If Approved)
1. Verify dependencies installed (React Router v6, Preact v10)
2. Check current Router setup
3. Create GitHub issue with checklist
4. Assign to developer

### Day 3+ (Implementation)
1. Phase 1: Component setup
2. Phase 2: Build components
3. Phase 3: Integration
4. Phase 4: Testing + refinement

---

## 📚 For More Details

- **Quick Summary**: [LOGIN_PAGE_MIGRATION_SUMMARY.md](./LOGIN_PAGE_MIGRATION_SUMMARY.md) (2-3 pages)
- **Full Design**: [LOGIN_PAGE_MIGRATION.md](./LOGIN_PAGE_MIGRATION.md) (15-20 pages)
- **Review Checklist**: [LOGIN_PAGE_MIGRATION_REVIEW.md](./LOGIN_PAGE_MIGRATION_REVIEW.md) (5-10 pages)
- **Documentation Index**: [LOGIN_PAGE_MIGRATION_INDEX.md](./LOGIN_PAGE_MIGRATION_INDEX.md)

---

## 💬 Summary for Stakeholders

| Stakeholder | Key Message |
|---|---|
| **Product** | Same feature, better UX, 2-3 days, low risk |
| **Engineering** | Modernizes auth, improves testability, Preact pattern |
| **QA** | E2E tests easier (components vs DOM), more coverage |
| **Users** | No change in behavior, login still works |

---

**Decision Needed**: 👍 Approve migration or 👎 Defer for later?

**Date**: January 31, 2026  
**Full Documentation**: See [LOGIN_PAGE_MIGRATION_INDEX.md](./LOGIN_PAGE_MIGRATION_INDEX.md)
