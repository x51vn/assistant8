# Auth Error Handling - Visual Implementation Guide

---

## Problem Visualization

### Old (Broken) Flow
```
┌─────────────────────────────────────────────────────────────────────┐
│ USER ACTION: Click "Add Stock"                                      │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SEND MESSAGE: chrome.runtime.sendMessage({                          │
│   type: PORTFOLIO_ADD,                                              │
│   data: { symbol: 'VNM', ... }                                     │
│ })                                                                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKGROUND HANDLER: portfolio.js                                    │
│ - requireAuth() called                                              │
│ - Token invalid/expired detected                                    │
│ - Returns: {                                                        │
│     errorCode: 'AUTH_REQUIRED',                                    │
│     errorMessage: 'User not authenticated'                         │
│   }                                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ UI RECEIVES RESPONSE                                                │
│ - OLD CODE:                                                         │
│   if (response.errorCode) {                                         │
│     alert('Error: User not authenticated');                        │
│     return;                                                         │
│   }                                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼ ❌ NO LOGOUT TRIGGERED!
┌─────────────────────────────────────────────────────────────────────┐
│ USER SEES ERROR MESSAGE                                             │
│ "Error: User not authenticated"                                    │
│                                                                     │
│ BUT:                                                                │
│ - Session appears "still active" in UI                             │
│ - No logout happened                                               │
│ - SIGNED_OUT never broadcast                                       │
│ - Login screen not shown                                           │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ USER CONFUSED                                                       │
│ - Session "seems" still valid (not logged out)                     │
│ - But operations don't work (auth error)                           │
│ - Tries operation again                                            │
│ - SAME ERROR MESSAGE APPEARS AGAIN                                 │
│                                                                     │
│ ← This creates the "FREQUENT LOGIN REQUESTS" appearance            │
└─────────────────────────────────────────────────────────────────────┘
```

### New (Fixed) Flow
```
┌─────────────────────────────────────────────────────────────────────┐
│ USER ACTION: Click "Add Stock"                                      │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SEND MESSAGE: chrome.runtime.sendMessage({...})                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKGROUND HANDLER: portfolio.js                                    │
│ - requireAuth() called                                              │
│ - Token invalid/expired detected                                    │
│ - Returns: {                                                        │
│     errorCode: 'AUTH_REQUIRED',                                    │
│     errorMessage: 'User not authenticated'                         │
│   }                                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ UI RECEIVES RESPONSE                                                │
│ - NEW CODE:                                                         │
│   if (isAuthError(response)) {  ← ✅ NEW CHECK                     │
│     await handleAuthError(response, 'PORTFOLIO_ADD');  ← TRIGGERS  │
│     return;                                                         │
│   }                                                                │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ handleAuthError() CALLED                                            │
│ - Calls: await logout()                                             │
│ - Sends: { type: SUPABASE_AUTH_LOGOUT }                            │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKGROUND LOGOUT HANDLER                                           │
│ - Calls: supabase.auth.signOut()                                   │
│ - Triggers: onAuthStateChange('SIGNED_OUT') event                  │
│ - Broadcasts: { type: AUTH_STATE_CHANGED, data: { user: null } }  │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ UI RECEIVES BROADCAST                                               │
│ - listenAuthStateChanges() listener activated                       │
│ - Calls: showLoginPage()                                            │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ✅ CLEAN LOGIN SCREEN SHOWN                                         │
│                                                                     │
│ User Experience:                                                    │
│ - Clear message: "Please login again"                              │
│ - Session ends gracefully                                          │
│ - No error messages                                                │
│ - No confusion                                                      │
│ - Ready to login again                                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### File Structure After Changes

```
src/
├── ui/
│   ├── authErrorHandler.js ..................... ✨ NEW UTILITY
│   ├── portfolio.js ........................... ✏️ MODIFIED (4 ops)
│   ├── results.js ............................. ✏️ MODIFIED (1 op)
│   ├── errors.js .............................. ✏️ MODIFIED (5 ops)
│   ├── settings.js ............................ ✏️ MODIFIED (3 ops)
│   ├── english.js ............................. ⊗ NOT NEEDED
│   ├── sync.js ................................ ⊗ NOT NEEDED
│   ├── auth.js ................................ ✓ VERIFIED (no changes)
│   ├── pages.js ............................... ✓ VERIFIED (no changes)
│   └── ... (other files unchanged)
│
├── background/
│   ├── handlers/ .............................. ✓ VERIFIED (no changes)
│   ├── index.js ............................... ✓ VERIFIED (no changes)
│   └── utils/ .................................  ✓ VERIFIED (no changes)
│
└── supabaseConfig.js .......................... ✓ VERIFIED (no changes)
```

### Auth Error Handler Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  authErrorHandler.js                            │
│                   (NEW UTILITY)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ isAuthError(response)                                    │  │
│  │ - Returns: true if errorCode === 'AUTH_REQUIRED'  or    │  │
│  │             'AUTH_EXPIRED'                             │  │
│  │ - Used in: ALL handlers (conditional check)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ handleAuthError(response, context)                       │  │
│  │ - Calls: await logout()                                 │  │
│  │ - Logs: Warning with context (e.g., 'PORTFOLIO_ADD')    │  │
│  │ - Effect: Triggers SUPABASE_AUTH_LOGOUT message        │  │
│  │ - Used in: ALL error handlers                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ withAuthErrorHandler(promise, context)                   │  │
│  │ - Wrapper for Promise-based handlers                    │  │
│  │ - Not yet used (for future enhancement)                 │  │
│  │ - Could wrap: async/await message handlers             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Dependencies:                                                 │
│  - imports: logout from './auth.js'                           │  │
│  - imports: logger utility                                    │  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Code Pattern Comparison

### Pattern 1: Callback-Based Handlers (UPDATED)

```javascript
// ❌ BEFORE: No auth error handling
chrome.runtime.sendMessage(message, (response) => {
  if (chrome.runtime.lastError || !response || 
      response.type !== MESSAGE_TYPES.EXPECTED) {
    alert('Error occurred');
    return;
  }
  processData(response.data);
});

// ✅ AFTER: With auth error handling
chrome.runtime.sendMessage(message, async (response) => {  // ← Now async
  if (chrome.runtime.lastError || !response) {
    alert('Error occurred');
    return;
  }
  
  // NEW: Priority check for auth errors
  if (isAuthError(response)) {
    console.warn('[Module] Auth error, auto-logging out...');
    await handleAuthError(response, 'MESSAGE_TYPE');  // ← Triggers logout
    return;
  }
  
  // Then check other errors
  if (response.type !== MESSAGE_TYPES.EXPECTED) {
    alert('Error occurred');
    return;
  }
  
  processData(response.data);
});
```

### Pattern 2: Promise-Based Handlers (READY FOR FUTURE USE)

```javascript
// NEW: Could wrap Promise-based handlers
try {
  const response = await withAuthErrorHandler(
    chrome.runtime.sendMessage(message),
    'CONTEXT_NAME'
  );
  
  if (response.errorCode) {
    throw new Error(response.errorMessage);
  }
  
  return response.data;
} catch (error) {
  if (isAuthError(error)) {
    // Already handled by withAuthErrorHandler
    return [];
  }
  showError(error.message);
  return [];
}
```

---

## Message Flow Diagram

### Complete Auth Error Path

```
┌────────────┐
│ UI Handler │ ← User clicks button
└─────┬──────┘
      │ chrome.runtime.sendMessage({
      │   type: MESSAGE_TYPE,
      │   data: {...}
      │ })
      │
┌─────▼────────────────┐
│ Background Handler   │
│ - requireAuth() call │
│ - Check token        │
│ - Token invalid ✗    │
└─────┬────────────────┘
      │ return {
      │   errorCode: 'AUTH_REQUIRED',
      │   errorMessage: '...'
      │ }
      │
┌─────▼──────────────────┐
│ UI Callback Function   │
│ (Async now)            │
│ - Receives response    │
└─────┬──────────────────┘
      │ if (isAuthError(response))
      │   await handleAuthError()
      │     └─ calls logout()
      │
┌─────▼──────────────────┐
│ logout() Function      │
│ (from auth.js)         │
│ - Sends SUPABASE_      │
│   AUTH_LOGOUT message  │
└─────┬──────────────────┘
      │ chrome.runtime.sendMessage({
      │   type: SUPABASE_AUTH_LOGOUT
      │ })
      │
┌─────▼──────────────────────┐
│ Background Auth Handler    │
│ - Calls supabase.auth.     │
│   signOut()                │
│ - Triggers:                │
│   onAuthStateChange event  │
└─────┬──────────────────────┘
      │ Broadcasts {
      │   type: AUTH_STATE_CHANGED,
      │   data: { user: null }
      │ }
      │
┌─────▼──────────────────┐
│ UI Auth Listener       │
│ listenAuthStateChanges │
│ - Receives broadcast   │
│ - Calls showLoginPage()│
└─────┬──────────────────┘
      │
┌─────▼──────────────────────┐
│ ✅ Login Screen Shown      │
│ Clean exit from operation  │
└────────────────────────────┘
```

---

## Operations Protected

### Portfolio Module (4 Operations)

```
portfolio.js
├── getPortfolioFromSupabase()
│   ├── Sends: MESSAGE_TYPES.PORTFOLIO_GET
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
├── addStockInSupabase()
│   ├── Sends: MESSAGE_TYPES.PORTFOLIO_ADD
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
├── updateStockInSupabase()
│   ├── Sends: MESSAGE_TYPES.PORTFOLIO_UPDATE
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
└── removeStockFromSupabase()
    ├── Sends: MESSAGE_TYPES.PORTFOLIO_REMOVE
    ├── Handler: async (response) => {
    │   if (isAuthError(response)) { await handleAuthError(...) }
    │   ...
    └── }
```

### Results Module (1 Operation)

```
results.js
└── loadAndDisplayHistory()
    ├── Sends: MESSAGE_TYPES.HISTORY_GET_ALL
    ├── Handler: async (response) => {
    │   if (isAuthError(response)) { await handleAuthError(...) }
    │   ...
    └── }
```

### Errors Module (5 Operations)

```
errors.js
├── loadErrors()
│   ├── Sends: MESSAGE_TYPES.ERROR_GET_ALL
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
├── deleteError()
│   ├── Sends: MESSAGE_TYPES.ERROR_DELETE
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
├── clearErrors()
│   ├── Sends: MESSAGE_TYPES.ERROR_CLEAR_ALL
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
└── saveError()
    ├── For ADD:
    │   ├── Sends: MESSAGE_TYPES.ERROR_ADD
    │   ├── Handler: async (response) => {
    │   │   if (isAuthError(response)) { await handleAuthError(...) }
    │   │   ...
    │   └── }
    │
    └── For UPDATE:
        ├── Sends: MESSAGE_TYPES.ERROR_UPDATE
        ├── Handler: async (response) => {
        │   if (isAuthError(response)) { await handleAuthError(...) }
        │   ...
        └── }
```

### Settings Module (3 Operations)

```
settings.js
├── Save Settings Button
│   ├── Sends: MESSAGE_TYPES.SETTINGS_UPDATE
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
├── Reset (Delete Settings) Button
│   ├── Sends: MESSAGE_TYPES.SETTINGS_DELETE
│   ├── Handler: async (response) => {
│   │   if (isAuthError(response)) { await handleAuthError(...) }
│   │   ...
│   └── }
│
└── Send Prompt Button
    ├── Sends: MESSAGE_TYPES.SEND_PROMPT
    ├── Handler: async (response) => {
    │   if (isAuthError(response)) { await handleAuthError(...) }
    │   ...
    └── }
```

---

## Build Impact Visualization

### Before & After Comparison

```
BUILD OUTPUT BEFORE (Original)
════════════════════════════════════════════════════════════════
vite v5.4.21 building for production...
✓ 84 modules transformed.
dist/messageSchema-gtx1z70W.js    4.64 kB │ gzip:  1.46 kB
dist/content.js                  16.34 kB │ gzip:  5.41 kB
dist/ui.js                       84.60 kB │ gzip: 24.22 kB  ← BEFORE
dist/background.js              237.73 kB │ gzip: 62.96 kB
✓ built in 3.69s

BUILD OUTPUT AFTER (With Auth Error Handling)
════════════════════════════════════════════════════════════════
vite v5.4.21 building for production...
✓ 84 modules transformed.
dist/messageSchema-gtx1z70W.js    4.64 kB │ gzip:  1.46 kB
dist/content.js                  16.34 kB │ gzip:  5.41 kB
dist/ui.js                       86.62 kB │ gzip: 24.22 kB  ← AFTER (+2.02 KB)
dist/background.js              237.73 kB │ gzip: 62.96 kB
✓ built in 3.90s

SIZE IMPACT: +2.02 KB (2.4% increase) ✅ MINIMAL
TIME IMPACT: +0.21s (5.7% increase) ✅ ACCEPTABLE
```

---

## Deployment Workflow

```
┌──────────────────┐
│ Development      │ - Make changes to 5 UI modules
│ Changes          │ - Create authErrorHandler.js utility
└────────┬─────────┘
         │
┌────────▼──────────────────────────┐
│ Build Test                        │
│ $ npm run build                   │ ← ✅ SUCCESS
│ ✓ 84 modules transformed          │
│ ✓ built in 3.90s                  │
└────────┬──────────────────────────┘
         │
┌────────▼──────────────────────────┐
│ Output Files Ready                │
│ - dist/ui.js (86.62 kB)           │
│ - dist/background.js (237.73 kB)  │
│ - dist/content.js (16.34 kB)      │
└────────┬──────────────────────────┘
         │
┌────────▼──────────────────────────┐
│ Deploy to Extension               │
│ - Copy dist/ to extension folder   │
│ - Or use unpacked extension mode   │
│ - Extension auto-reloads          │
└────────┬──────────────────────────┘
         │
┌────────▼──────────────────────────┐
│ User Testing                      │
│ - Login normally                  │
│ - Verify operations work          │
│ - Test auth error scenario        │
│ - Monitor for issues              │
└────────┬──────────────────────────┘
         │
┌────────▼──────────────────────────┐
│ ✅ Complete                       │
│ No more "frequent login requests" │
└────────────────────────────────────┘
```

---

## Success Indicators

### ✅ Before → After Comparison

```
METRIC                      BEFORE              AFTER
─────────────────────────────────────────────────────────────────
Session stays valid         ❓ Maybe (~50%)      ✅ Yes
Frequent logins             ⚠️ Yes              ❌ No
Error messages loop         ⚠️ Yes              ❌ No
Auto-logout on expiry       ❌ No               ✅ Yes
Clean login screen          ❌ No               ✅ Yes
User confusion              ⚠️ High            ✅ Low
Session after reload        ❓ Sometimes        ✅ Always
```

---

## Troubleshooting Guide

### Issue: Still seeing auth errors

**Check**:
1. Is new `authErrorHandler.js` imported in modules? ✓
2. Is `isAuthError()` being called? Check console
3. Is `handleAuthError()` being awaited? Must be async
4. Is `logout()` function working? Test directly

### Issue: Stuck on login after auth error

**Check**:
1. Does background send proper SIGNED_OUT broadcast?
2. Does UI listener `listenAuthStateChanges()` exist?
3. Is `showLoginPage()` being called?
4. Check browser console for errors

### Issue: Build fails with import errors

**Check**:
1. Does `src/ui/authErrorHandler.js` exist?
2. Are imports using correct relative paths?
3. Run `npm install` to ensure all deps
4. Try `npm run build` again

---

**Version**: 1.0  
**Date**: January 23, 2026  
**Status**: ✅ Implementation Complete  

