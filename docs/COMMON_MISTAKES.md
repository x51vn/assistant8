# Common Mistakes & Anti-Patterns - ChatGPT Assistant

**Date Created**: January 20, 2026  
**Purpose**: Document common bugs to prevent recurring issues

---

## 🚫 Chrome Extension Message Passing

### ❌ NEVER: Async Callbacks in sendMessage

**Problem**: Chrome extension messaging APIs do NOT support async callbacks.

```javascript
// ❌ WRONG - Will cause "message channel closed" error
chrome.runtime.sendMessage(message, async (response) => {
  await chrome.storage.local.set({ data: response.data });
  console.log('Saved');
});

// ❌ WRONG - Same issue with tabs.sendMessage
chrome.tabs.sendMessage(tabId, message, async (response) => {
  await doSomethingAsync(response);
});
```

**Why it fails**:
- Async functions automatically return a Promise
- Chrome expects either:
  1. Synchronous callback (no return value)
  2. Callback that explicitly calls `sendResponse()` and returns `true`
- Returning a Promise confuses the message channel

**Error message**: 
```
A listener indicated an asynchronous response by returning true, 
but the message channel closed before a response was received
```

### ✅ CORRECT Solutions

**Option 1: Wrap async code in IIFE**
```javascript
chrome.runtime.sendMessage(message, (response) => {
  // Handle response synchronously first
  if (chrome.runtime.lastError) {
    console.error('Error:', chrome.runtime.lastError);
    return;
  }
  
  // Wrap async operations in IIFE
  (async () => {
    await chrome.storage.local.set({ data: response.data });
    console.log('Saved');
  })().catch(err => console.error('Save failed:', err));
});
```

**Option 2: Use Promise wrapper**
```javascript
// Create a Promise wrapper for sendMessage
function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// Use it with async/await
async function handleMessage() {
  try {
    const response = await sendMessageAsync(message);
    await chrome.storage.local.set({ data: response.data });
    console.log('Saved');
  } catch (error) {
    console.error('Error:', error);
  }
}
```

**Option 3: Don't wait for async operations**
```javascript
chrome.runtime.sendMessage(message, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Error:', chrome.runtime.lastError);
    return;
  }
  
  // Start async operation but don't wait
  chrome.storage.local.set({ data: response.data })
    .then(() => console.log('Saved'))
    .catch(err => console.error('Save failed:', err));
});
```

### 📋 Files Fixed
- ✅ `src/ui/results.js` - Poll callback (line 88)
- ✅ `src/ui/results.js` - Refresh callback (line 155)

---

## 🚫 Logger Anti-Patterns

### ❌ NEVER: Pass Objects Directly to console Methods

**Problem**: Chrome console displays `[object Object]` instead of useful info.

```javascript
// ❌ WRONG - Displays "Error Object"
console.error(`[Module]`, message, { correlationId, error });

// ❌ WRONG - Lost information
logger.error('Failed', { correlationId, error });
```

### ✅ CORRECT: Format Objects as Readable Strings

```javascript
// ✅ CORRECT - Displays "Error correlationId=abc, error=message"
const dataStr = Object.entries(data)
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  .join(', ');
console.error(`[Module]`, message + ' ' + dataStr);
```

### 📋 Implementation
All logger methods now format data properly:
- ✅ `debug(message, data)` - Formats data as key=value
- ✅ `info(message, data)` - Formats data as key=value
- ✅ `warn(message, data)` - Formats data as key=value
- ✅ `error(message, data)` - Formats data as key=value
- ✅ `endOperation(correlationId, status, result)` - Extracts error messages properly

---

## 🚫 Tab Management Anti-Patterns

### ❌ NEVER: Assume Existing Tab Has Ready Content Script

**Problem**: Tab may exist but content script crashed/not loaded.

```javascript
// ❌ WRONG - Doesn't handle content script not ready
async function ensureTab() {
  const tabs = await chrome.tabs.query({ url: '*://example.com/*' });
  if (tabs[0]) {
    return { tabId: tabs[0].id }; // Assumes content script is ready!
  }
  // Create new tab...
}
```

**Why it fails**:
- Tab may be loading
- Content script may have crashed
- Tab may have been navigated away and back
- Extension was reloaded but tabs weren't

### ✅ CORRECT: Always Verify Content Script Readiness

```javascript
async function ensureTab() {
  const tabs = await chrome.tabs.query({ url: '*://example.com/*' });
  
  if (tabs[0]) {
    // Verify content script is ready
    const ready = await waitForContentScript(tabs[0].id);
    
    if (ready) {
      return { tabId: tabs[0].id };
    } else {
      // Content script not ready - reload tab
      await chrome.tabs.reload(tabs[0].id);
      await waitForTabComplete(tabs[0].id);
      
      // Try again after reload
      const readyAfterReload = await waitForContentScript(tabs[0].id);
      if (readyAfterReload) {
        return { tabId: tabs[0].id };
      }
      
      // Still not ready - create new tab as fallback
    }
  }
  
  // Create new tab...
}

async function waitForContentScript(tabId, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return true;
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  return false;
}
```

### 📋 Files Fixed
- ✅ `src/chatgptSession.js` - `ensureChatGPTTab()` now reloads tab if content script not ready

---

## 🚫 Content Script Message Handlers

### ❌ NEVER: Forget to Return `true` for Async Handlers

**Problem**: Chrome closes message channel if async handler doesn't return `true`.

```javascript
// ❌ WRONG - Message channel closes before sendResponse
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getData') {
    (async () => {
      const data = await fetchData();
      sendResponse({ data });
    })();
    // Missing return true!
  }
});
```

### ✅ CORRECT: Always Return `true` for Async Responses

```javascript
// ✅ CORRECT
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getData') {
    (async () => {
      try {
        const data = await fetchData();
        sendResponse({ data });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true; // Keep message channel open!
  }
  
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return true; // Even for sync responses if using sendResponse
  }
});
```

### 📋 Files Fixed
- ✅ `src/content.js` - Ping handler now returns `true` (line 617)

---

## 🔍 How to Find These Issues

### Search Patterns

**Find async callbacks in sendMessage:**
```bash
# Regex pattern
grep -rn "sendMessage.*,\s*async\s*(" src/
```

**Find missing return true:**
```bash
# Look for async handlers without return true
grep -B5 -A10 "onMessage.addListener" src/ | grep -A10 "async ()"
```

**Find object logging:**
```bash
# Find console methods with object parameters
grep -rn "console\.\(log\|error\|warn\)\(.*,.*{" src/
```

---

## ✅ Testing Checklist

Before pushing code, verify:

- [ ] No `async` callbacks in `chrome.runtime.sendMessage()`
- [ ] No `async` callbacks in `chrome.tabs.sendMessage()`
- [ ] All message handlers that do async work return `true`
- [ ] Logger methods format objects properly
- [ ] Tab management verifies content script readiness
- [ ] Build passes: `npm run build`
- [ ] Extension loads without errors in `chrome://extensions`
- [ ] Test actual flows (send prompt, get result, etc.)

---

## 📚 References

- [Chrome Extension Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Common Extension Errors](https://developer.chrome.com/docs/extensions/mv3/troubleshooting/)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

---

## 🚫 Extension Lifecycle Anti-Patterns

### ❌ NEVER: Clear All Resources When Only Managing Some

**Problem**: Using `clearAll()` or `removeAll()` when you only manage a subset of resources.

#### Example: Alarms

```javascript
// ❌ WRONG - Clears ALL alarms including ones created by other modules
async function setupMyAlarms() {
  await chrome.alarms.clearAll(); // ⚠️ Deletes alarms from other modules!
  chrome.alarms.create('MY_ALARM', { periodInMinutes: 5 });
}
```

**Why it fails**:
- Firebase sync creates `autoSync` alarm (periodically)
- UI sync creates `firebaseSync` alarm (on-demand)
- Background creates `CHECK` and `AUTORUN` alarms
- Calling `clearAll()` **deletes ALL of them**, not just yours!
- Results in:
  - `Unknown alarm autoSync` warnings
  - `Unknown alarm firebaseSync` warnings  
  - `Unknown alarm googleDriveSync` (legacy from old versions)
  - Lost functionality (sync stops working)

### ✅ CORRECT: Selectively Clear Only Your Resources

```javascript
// ✅ CORRECT - Only clear specific alarms you manage
async function setupMyAlarms() {
  // Clear only YOUR alarms
  await chrome.alarms.clear('CHECK');
  await chrome.alarms.clear('AUTORUN');
  
  // Recreate them
  chrome.alarms.create('CHECK', { periodInMinutes: 5 });
  chrome.alarms.create('AUTORUN', { periodInMinutes: 10 });
  
  // DON'T touch alarms created by other modules:
  // - autoSync (created by Firebase auth listener)
  // - firebaseSync (created by UI sync)
}
```

### ✅ CORRECT: Clean Up Legacy Resources on Startup

```javascript
// ✅ CORRECT - Clean up old alarms from previous versions
async function cleanupLegacyAlarms() {
  try {
    // Define ALL known alarms across entire extension
    const knownAlarms = [
      'CHECK',           // Portfolio price check
      'AUTORUN',         // Auto-run evaluation  
      'POLL',            // Poll ChatGPT result
      'autoSync',        // Firebase auto-sync
      'firebaseSync'     // UI-triggered sync
    ];
    
    const allAlarms = await chrome.alarms.getAll();
    
    for (const alarm of allAlarms) {
      if (!knownAlarms.includes(alarm.name)) {
        await chrome.alarms.clear(alarm.name);
        logger.info('Cleared legacy alarm', { name: alarm.name });
      }
    }
  } catch (error) {
    logger.warn('Failed to cleanup legacy alarms', { error });
  }
}

// Call this ONCE on extension startup
async function onExtensionStartup() {
  await cleanupLegacyAlarms();
  await setupMyAlarms();
}
```

### ✅ CORRECT: Unknown Resource Handler Should Not Fail

```javascript
// ❌ WRONG - Treating unknown alarm as error
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'MY_ALARM') {
    handleMyAlarm();
    return;
  }
  
  // Unknown alarm - log as ERROR and call endOperation
  logger.warn('Unknown alarm', { name: alarm.name });
  logger.endOperation(correlationId, 'unknown'); // ❌ Logs "Failed error=Unknown error"
});

// ✅ CORRECT - Unknown resources are normal during updates
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'MY_ALARM') {
    handleMyAlarm();
    return;
  }
  
  // Unknown alarm is NORMAL during extension updates
  // Old alarms persist until next Chrome restart
  logger.info('Unknown alarm (legacy)', { name: alarm.name });
  // Don't call endOperation - no operation was started!
});
```

### 📋 Real-World Bug Example

**Error seen**:
```
[Alarms] Unknown alarm correlationId="1768909707523-0l2g27vs3", name="googleDriveSync"
[Alarms] Failed correlationId="1768909707523-0l2g27vs3", success=false, error="Unknown error"
```

**Root cause**:
1. Old version created `googleDriveSync` alarm
2. New version removed that feature and renamed alarm
3. `setupAlarms()` called `clearAll()` - deleted all alarms including sync alarms
4. Alarm handler treated unknown alarm as error

**Fix**:
1. Changed `clearAll()` → selective `clear()` for specific alarms
2. Added `cleanupLegacyAlarms()` to remove old alarms on startup
3. Changed unknown alarm handler to log as `info`, not `warn`/`error`
4. Removed `endOperation()` call for unknown alarms

### 📋 Files Fixed
- ✅ `src/background/index.js` - `setupAlarms()` now uses selective clearing (lines 207-208)
- ✅ `src/background/index.js` - Added `cleanupLegacyAlarms()` function (lines 236-253)
- ✅ `src/background/handlers/alarms.js` - Unknown alarm handler now logs as info (line 95)

### 📝 Pattern Applies To

This pattern applies to ALL Chrome extension APIs that have `clearAll()` or `removeAll()`:

- ✅ **Alarms**: `chrome.alarms.clearAll()` → Use selective `clear(name)`
- ✅ **Context Menus**: `chrome.contextMenus.removeAll()` → Usually OK (few menus)
- ⚠️ **Storage**: `chrome.storage.local.clear()` → NEVER use unless factory reset!
- ⚠️ **Cookies**: `chrome.cookies.removeAll()` → Rarely needed
- ⚠️ **Cache**: `caches.delete()` → Be specific about cache names

**Rule of thumb**: If multiple modules create resources, NEVER use `*All()` methods!

---

**Last Updated**: January 20, 2026  
**Maintainer**: Development Team
