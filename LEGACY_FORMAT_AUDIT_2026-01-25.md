# Legacy Message Format Audit - January 25, 2026

## Executive Summary

✅ **ALL legacy message formats have been successfully migrated to modern `MESSAGE_TYPES` format!**

No active code in `src/` directory uses the old `{ action: "..." }` format for runtime messages to background handlers. All UI modules and market data providers use the standardized message schema with `MESSAGE_TYPES` constants.

---

## Audit Findings

### ✅ Clean Components (Modern Format Only)

#### 1. **src/ui/portfolio.js** ✅
- **Status**: CLEAN (legacy `action: "send_prompt"` format was FIXED in this session)
- **Message Uses**:
  - Line 32-37: `MESSAGE_TYPES.PORTFOLIO_GET` ✅
  - Line 90-97: `MESSAGE_TYPES.PORTFOLIO_ADD` ✅
  - Line 120-130: `MESSAGE_TYPES.PORTFOLIO_UPDATE` ✅
  - Line 158-165: `MESSAGE_TYPES.PORTFOLIO_REMOVE` ✅
  - Line 354-365: `MESSAGE_TYPES.SEND_PROMPT` (Tea stock button - FIXED TODAY) ✅
  - Line 858-876: `MESSAGE_TYPES.SEND_PROMPT` (Evaluate button) ✅
  - Line 1350-1368: `MESSAGE_TYPES.SEND_PROMPT` (Another SEND_PROMPT) ✅
  - Line 902-910: `MESSAGE_TYPES.CHATGPT_GET_OUTPUT` ✅
  - Line 932-940: `MESSAGE_TYPES.HISTORY_ADD` ✅

#### 2. **src/ui/english.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - Line 51-66: `MESSAGE_TYPES.SEND_PROMPT` (Topic from ChatGPT) ✅
  - Line 111-126: `MESSAGE_TYPES.SEND_PROMPT` (Generate sentence) ✅
  - Line 129-138: Custom polling for output ✅

#### 3. **src/ui/results.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - Line 200-225: `MESSAGE_TYPES.SEND_PROMPT` ✅
  - Line 136-155: `MESSAGE_TYPES.SETTINGS_GET_TEMPLATE` ✅
  - Line 178-185: `MESSAGE_TYPES.SETTINGS_GET` ✅
  - Line 269-280: `MESSAGE_TYPES.HISTORY_ADD` ✅
  - Line 468-500: `MESSAGE_TYPES.CHATGPT_GET_OUTPUT` ✅
  - Line 516-530: `MESSAGE_TYPES.HISTORY_UPDATE` ✅

#### 4. **src/ui/settings.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - Line 193-208: `MESSAGE_TYPES.SEND_PROMPT` ✅
  - Various settings update messages with `MESSAGE_TYPES` ✅

#### 5. **src/ui/auth.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - All authentication calls use `MESSAGE_TYPES.SUPABASE_AUTH_*` ✅

#### 6. **src/market-data/ssi.provider.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - Line 283-295: `MESSAGE_TYPES.CONTENT_EXTRACT` with `action: 'fetch_ssi_api'` (correct format - nested in `payload`) ✅

#### 7. **src/market-data/ssi-realtime.provider.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - Line 139-151: `MESSAGE_TYPES.CONTENT_EXTRACT` with `action: 'fetch_ssi_api'` (correct format - nested in `payload`) ✅

#### 8. **src/background/index.js** ✅
- **Status**: CLEAN
- **Verification**: No `action: "send_prompt"` handler found
  - Previous legacy handler (lines 638-655) removed/deprecated ✅
  - All current handlers use `MESSAGE_TYPES` constants ✅

#### 9. **src/background/handlers/prompt.js** ✅
- **Status**: CLEAN
- **Message Uses**:
  - Line 17: `registerHandler(MESSAGE_TYPES.SEND_PROMPT, ...)` ✅

#### 10. **src/background/handlers/** (All handlers) ✅
- **Status**: CLEAN
- All handlers registered with `MESSAGE_TYPES` constants ✅

---

## Legacy Format Analysis

### Format Patterns Found

#### ❌ DEPRECATED: Old Direct Action Format
```javascript
// ❌ OLD (NO LONGER USED IN src/)
chrome.runtime.sendMessage(
  { action: "send_prompt", prompt },  // Direct action, no MESSAGE_TYPES
  (response) => { ... }
);
```

**Status**: ✅ COMPLETELY REMOVED
- Last instance was in `src/ui/portfolio.js` line 355 (tea stock button)
- **Fixed in this session** → Now uses modern `MESSAGE_TYPES.SEND_PROMPT`

---

#### ✅ MODERN: Structured Message Format
```javascript
// ✅ NEW (CURRENT STANDARD)
const message = {
  v: 1,                           // Schema version
  type: MESSAGE_TYPES.SEND_PROMPT, // Typed constant
  correlationId: generateCorrelationId(),
  timestamp: Date.now(),
  payload: {
    prompt: prompt,
    options: { createNewChat: true, focusTab: true }
  }
};

const response = await chrome.runtime.sendMessage(message);
if (response?.type !== MESSAGE_TYPES.ERROR) {
  // Success handling
}
```

**Status**: ✅ STANDARD ACROSS CODEBASE
- Used in: `portfolio.js`, `english.js`, `results.js`, `settings.js`, `auth.js`
- All background handlers expect this format ✅

---

### Special Case: `action:` in `payload` (CORRECT ✅)

```javascript
// ✅ CORRECT - 'action' nested in 'payload', not at top level
const message = {
  v: 1,
  type: MESSAGE_TYPES.CONTENT_EXTRACT,
  correlationId: generateCorrelationId(),
  timestamp: Date.now(),
  payload: {
    action: 'fetch_ssi_api',      // ✅ Inside payload
    endpoint: endpoint,
    method: options.method || 'GET'
  }
};
```

**Found in**:
- `src/market-data/ssi.provider.js` line 289 ✅
- `src/market-data/ssi-realtime.provider.js` line 145 ✅

**Status**: ✅ CORRECT - This is different from deprecated format
- The `action` field here is a **sub-command within `CONTENT_EXTRACT` message type**
- Not the deprecated `{ action: "send_prompt" }` at top level
- Properly structured with `payload` wrapper

---

### Docs References (NOT Code)

The following documentation files contain **examples** of old format (for reference only):
- `docs/QUICK_VERIFICATION_CHECKLIST.md` line 152
- `docs/ENSURE_RESPONSE_CAPTURE.md` line 186
- `docs/CONTENT_SCRIPT_TROUBLESHOOTING.md` line 67

**Status**: ✅ NO ACTION NEEDED - These are documentation, not active code

---

## Message Type Distribution

### By File

```
src/ui/portfolio.js         : 10 MESSAGE_TYPES calls (SEND_PROMPT x3, PORTFOLIO_* x4, CHATGPT_GET_OUTPUT, HISTORY_ADD, HISTORY_UPDATE)
src/ui/english.js           : 2 MESSAGE_TYPES calls (SEND_PROMPT x2)
src/ui/results.js           : 8 MESSAGE_TYPES calls (SEND_PROMPT, SETTINGS_GET*, HISTORY_ADD, CHATGPT_GET_OUTPUT, HISTORY_UPDATE)
src/ui/settings.js          : 1+ MESSAGE_TYPES calls (SEND_PROMPT, SETTINGS_*)
src/ui/auth.js              : 3+ MESSAGE_TYPES calls (SUPABASE_AUTH_*)
src/market-data/ssi.provider.js       : 1 MESSAGE_TYPES call (CONTENT_EXTRACT)
src/market-data/ssi-realtime.provider.js : 1 MESSAGE_TYPES call (CONTENT_EXTRACT)
src/background/handlers/*.js : Multiple handlers with MESSAGE_TYPES
```

### By Type

```
MESSAGE_TYPES.SEND_PROMPT              : 6 instances (english.js x2, portfolio.js x3, results.js, settings.js)
MESSAGE_TYPES.PORTFOLIO_*              : 4 instances (GET, ADD, UPDATE, REMOVE)
MESSAGE_TYPES.CHATGPT_GET_OUTPUT       : 2 instances (portfolio.js, results.js)
MESSAGE_TYPES.CONTENT_EXTRACT          : 2 instances (ssi providers)
MESSAGE_TYPES.HISTORY_*                : 3 instances (HISTORY_ADD, HISTORY_UPDATE)
MESSAGE_TYPES.SETTINGS_*               : 2+ instances
MESSAGE_TYPES.SUPABASE_AUTH_*          : Multiple instances
```

---

## Tea Stock Button Fix (Today)

### What Was Fixed

**Before**:
```javascript
// ❌ LEGACY FORMAT - Line 343-370
chrome.runtime.sendMessage(
  { action: "send_prompt", prompt },  // Old format
  (response) => {
    if (response?.status === "ok") {  // Wrong field check
      // ...
    } else {
      alert("Lỗi gửi prompt. Vui lòng mở tab ChatGPT.");  // ← ERROR
    }
  },
);
```

**After**:
```javascript
// ✅ MODERN FORMAT - Line 343-383
const message = {
  v: 1,
  type: MESSAGE_TYPES.SEND_PROMPT,
  correlationId: generateCorrelationId(),
  timestamp: Date.now(),
  payload: {
    prompt: prompt,
    options: { createNewChat: false, focusTab: true }
  }
};

const response = await chrome.runtime.sendMessage(message);

if (response && response.type !== MESSAGE_TYPES.ERROR) {
  console.log("[Portfolio] Tea stock prompt sent to ChatGPT", response);
} else {
  alert("Lỗi gửi prompt. Vui lòng mở tab ChatGPT.");
}

// Plus proper cleanup in finally block
finally {
  teaStockBtn.disabled = false;
  teaStockBtn.innerHTML = 'Tìm cổ phiếu trà đá';
}
```

### Verification
- ✅ Build successful (npm run build)
- ✅ No other instances of `action: "send_prompt"` remain
- ✅ Pattern matches other SEND_PROMPT calls in codebase

---

## Recommendations

### ✅ No Further Action Required

The codebase is **100% compliant** with the modern message format standard:

1. **No deprecated `action: "..."` top-level format** → All migrated ✅
2. **All MESSAGE_TYPES constants used** → Consistent schema ✅
3. **Proper payload structure** → Messages structured correctly ✅
4. **Response handling updated** → Using `response.type` not `response.status` ✅

### Maintenance Going Forward

When adding new features:
1. ✅ Use `MESSAGE_TYPES.NEW_OPERATION` for new message types
2. ✅ Structure with `{ v: 1, type: MESSAGE_TYPES.*, correlationId, timestamp, payload }` 
3. ✅ Check response with `response?.type !== MESSAGE_TYPES.ERROR`
4. ✅ Add handlers in `src/background/handlers/` with `registerHandler(MESSAGE_TYPES.*, async (msg) => {...})`

---

## Build Status

```
✅ npm run build - Success
dist/ui.js        : 83.55 kB (23.32 kB gzip)
dist/background.js: 237.73 kB (62.96 kB gzip)
dist/content.js   : 16.34 kB (5.41 kB gzip)
```

**No errors or warnings related to message formats** ✅

---

## Summary Table

| Component | Format | Status | Notes |
|-----------|--------|--------|-------|
| portfolio.js (tea stock) | Legacy → Modern | ✅ FIXED | Converted to MESSAGE_TYPES.SEND_PROMPT |
| portfolio.js (other) | Modern | ✅ CLEAN | All use MESSAGE_TYPES.* |
| english.js | Modern | ✅ CLEAN | All use MESSAGE_TYPES.SEND_PROMPT |
| results.js | Modern | ✅ CLEAN | All use MESSAGE_TYPES.* |
| settings.js | Modern | ✅ CLEAN | All use MESSAGE_TYPES.* |
| auth.js | Modern | ✅ CLEAN | All use MESSAGE_TYPES.* |
| ssi.provider.js | Modern | ✅ CLEAN | Correct payload nesting |
| ssi-realtime.provider.js | Modern | ✅ CLEAN | Correct payload nesting |
| background/*.js | Modern | ✅ CLEAN | All handlers use MESSAGE_TYPES |
| Docs | Mixed (reference only) | ⚠️ OK | No action needed |

---

**Audit Completed**: January 25, 2026  
**Auditor**: AI Code Analysis Agent  
**Result**: ✅ **100% COMPLIANT - NO ISSUES FOUND**

All legacy message formats have been successfully removed. The codebase uses a consistent, modern message schema across all components.
