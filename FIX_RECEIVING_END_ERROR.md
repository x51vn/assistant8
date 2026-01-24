# Fix: "Could not establish connection. Receiving end does not exist"

> **Error**: `Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist.`  
> **Cause**: Session restoration trying to broadcast to UI before UI is open  
> **Fix**: Proper error handling with `.catch()` instead of try-catch  
> **Status**: ✅ FIXED

---

## 🔍 Problem Analysis

### What Happened

1. Extension reloaded
2. Service Worker started
3. `restoreSessionOnServiceWorkerStart()` called
4. Session found in storage ✅
5. Tried to broadcast: `chrome.runtime.sendMessage()` 
6. **UI not open yet** → Chrome throws error
7. ❌ **Uncaught Promise Rejection**: "Receiving end does not exist"

### Why It Failed

```javascript
// ❌ WRONG: try-catch doesn't catch async Promise rejections
try {
  chrome.runtime.sendMessage({...}); // Returns Promise
} catch (error) {
  // Error not caught here!
}

// ✅ CORRECT: Use .catch() for Promise rejection
chrome.runtime.sendMessage({...})
  .catch(error => {
    // Error caught here!
  });
```

---

## ✅ Solution Applied

### 1. Changed Error Handling

**Before**:
```javascript
try {
  chrome.runtime.sendMessage({...});
} catch (broadcastError) {
  logger.debug('Auth broadcast ignored (UI not open)');
}
```

**After**:
```javascript
chrome.runtime.sendMessage({...})
  .catch(broadcastError => {
    // ✅ Properly handle receiving end not existing
    if (broadcastError?.message?.includes('Receiving end does not exist')) {
      logger.debug('UI not open - session will restore when UI loads');
    } else {
      logger.warn('Auth broadcast failed', { error: broadcastError?.message });
    }
  });
```

### 2. Delayed Restoration to Avoid Blocking

**Before**:
```javascript
// Called immediately at module load
restoreSessionOnServiceWorkerStart().catch(...);
```

**After**:
```javascript
// Called with 100ms delay to avoid blocking message routing
setTimeout(() => {
  restoreSessionOnServiceWorkerStart().catch(...);
}, 100);
```

### 3. Applied to Both Functions

Fixed error handling in:
- ✅ `restoreSessionOnServiceWorkerStart()`
- ✅ `restoreSessionOnStartup()`

---

## 🧪 Why This Works

### Scenario: User reloads extension

```
1. User clicks Reload at chrome://extensions
2. Service Worker restarts
3. Line 50: setTimeout(() => restoreSession..., 100ms)
4. (Other listeners set up immediately)
5. After 100ms:
   a. Session found in chrome.storage.local ✅
   b. Try to broadcast to UI
   c. UI not open yet → Promise rejection
   d. ✅ .catch() handles it gracefully
   e. Log: "UI not open - session will restore when UI loads"
6. User opens extension → UI loads
7. checkAuthStatus() → User still authenticated ✅
```

### Scenario: User opens extension after reload

```
1. Extension already reloaded (session restored in background)
2. User clicks extension icon
3. UI loads → checkAuthStatus()
4. Background: "SUPABASE_AUTH_CHECK" handler
5. Supabase reads token from chrome.storage.local
6. ✅ Returns: authenticated: true, user: {...}
7. UI: No login screen, shows main interface
```

---

## 📦 Build Status

```
✅ Built successfully
dist/background.js  233.16 kB
```

---

## 🎯 Testing

The fix is **transparent** - no UI changes needed:

1. **Reload extension** → No error in console ✅
2. **Check Service Worker logs** → Should see:
   ```
   UI not open - session will restore when UI loads
   ```
3. **Open extension UI** → User still logged in ✅

---

## 📚 Key Changes

| File | Line | Change |
|------|------|--------|
| `src/background/index.js` | 50-57 | Wrapped in setTimeout, proper error handling |
| `src/background/index.js` | 340-360 | Changed try-catch to .catch() for sendMessage |
| `src/background/index.js` | 251-267 | Changed try-catch to .catch() for sendMessage |

---

## ✅ Verification

Run this in Service Worker console to verify:

```javascript
// Check if error is properly handled
chrome.runtime.sendMessage({
  type: 'TEST_BROADCAST'
}).catch(error => {
  if (error.message.includes('Receiving end does not exist')) {
    console.log('✅ Error properly caught');
  }
});
```

---

**Status**: ✅ Error fixed and handled gracefully

