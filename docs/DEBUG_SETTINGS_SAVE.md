# Debug Settings Save Issue

## 🔍 STEP 1: Check UI Console Logs

```bash
# 1. Mở extension side panel
# 2. F12 → Console
# 3. Vào Settings tab
# 4. Click "Lưu"
# 5. Check console logs
```

**Expected Logs:**
```
[Settings] Đang lưu...
[Settings] Save portfolio prompt: "..."
[Settings] Save settings to Supabase
```

**Common Issues:**
- ❌ `chrome is not defined` → Background SW crashed
- ❌ `SETTINGS_UPDATE is not a function` → Message type not registered
- ❌ `undefined` errors → Missing data

**Screenshot/Copy console output:**
```
[Paste your console logs here]
```

---

## 🔍 STEP 2: Check Background Service Worker Console

```bash
# 1. chrome://extensions
# 2. Find "ChatGPT Assistant"
# 3. Click "Inspect views: Service worker"
# 4. Console tab
# 5. Vào extension Settings → Click "Lưu"
# 6. Check Background Service Worker console
```

**Expected Logs:**
```
[Settings] Handler registered
[Handlers] Registering message handlers...
[Background] Received message: SETTINGS_UPDATE
[Supabase] Upsert successful
[Settings] updateSettings success
```

**Debug Messages to Look For:**
```
[Background] route() received message: type=...
[Settings] updateSettings called with userId=...
[Supabase] INSERT/UPSERT result: { data: {...}, error: null }
```

**Errors to Look For:**
- ❌ `Cannot read property 'from'` → Supabase client not initialized
- ❌ `Auth session missing` → User not authenticated
- ❌ `Invalid API key` → Wrong Supabase credentials
- ❌ `new row violates row-level security policy` → RLS blocking INSERT

**Screenshot/Copy logs:**
```
[Paste your Service Worker console logs here]
```

---

## 🔍 STEP 3: Check Supabase Dashboard

```bash
# 1. Vào Supabase Dashboard
https://supabase.com/dashboard/project/ugqfxklleekniuujohcm

# 2. SQL Editor → New Query

# 3. Chạy:
SELECT * FROM settings ORDER BY updated_at DESC LIMIT 5;

# 4. Check kết quả
```

**Expected Result:**
```
1 row (or more) với:
- user_id: [your user id]
- config: { "prompts": {...}, ... }
- updated_at: [recent timestamp like 2026-01-24 14:30:00]
```

**If NO ROWS:**
- ❌ Insert không hoạt động hoặc có error
- ❌ Check RLS policies

**If HAS OLD ROWS but NOT UPDATED:**
- ❌ Save button không gửi message đúng
- ❌ Handler không được gọi

**Screenshot/Copy SQL result:**
```
[Paste SQL result here]
```

---

## 🔍 STEP 4: Check Network Tab

```bash
# 1. F12 → Network tab
# 2. Vào Settings → Sửa prompt → Click "Lưu"
# 3. Look for request to: https://ugqfxklleekniuujohcm.supabase.co/...
```

**Expected:**
- Request: `POST /rest/v1/settings` (or similar)
- Status: `200` or `201`
- Response: `{ "user_id": "...", "config": {...} }`

**If NOT FOUND:**
- ❌ Message không được gửi đến background handler
- ❌ Handler không call Supabase

**If ERROR (non-2xx):**
- 401 → Auth token invalid
- 403 → RLS policy blocked
- 400 → Invalid request body

**Screenshot/Copy network request/response:**
```
[Paste here]
```

---

## ✅ QUICK DIAGNOSTIC SCRIPT

**Paste into UI Console (F12):**
```javascript
// Check if MESSAGE_TYPES exists
console.log('MESSAGE_TYPES:', typeof MESSAGE_TYPES);
console.log('SETTINGS_UPDATE:', MESSAGE_TYPES?.SETTINGS_UPDATE);

// Check if chrome.runtime exists
console.log('chrome.runtime.sendMessage:', typeof chrome.runtime.sendMessage);

// Test send message manually
chrome.runtime.sendMessage({
  v: 1,
  type: 'SETTINGS_UPDATE',
  correlationId: 'debug-123',
  timestamp: Date.now(),
  data: {
    config: {
      test: true,
      prompts: {
        portfolio: 'TEST MESSAGE'
      }
    }
  }
}, (response) => {
  console.log('[Test] Response from background:', response);
});
```

**Expected Output:**
```
MESSAGE_TYPES: object
SETTINGS_UPDATE: "SETTINGS_UPDATE"
chrome.runtime.sendMessage: function
[Test] Response from background: { type: "SETTINGS_UPDATED", data: {...} }
```

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: "SETTINGS_UPDATE is undefined"
**Cause:** Message type not added to messageSchema.js

**Fix:**
```bash
# Check: src/shared/messageSchema.js
# Should have:
SETTINGS_GET: 'SETTINGS_GET',
SETTINGS_DATA: 'SETTINGS_DATA',
SETTINGS_UPDATE: 'SETTINGS_UPDATE',
SETTINGS_UPDATED: 'SETTINGS_UPDATED',

# If missing → Rebuild:
npm run build
```

---

### Issue 2: "Cannot read property 'from' of undefined"
**Cause:** Supabase client not initialized in background

**Fix:**
```bash
# Check: src/background/handlers/settings.js line 1
# Should import: import { supabase } from '../../supabaseConfig.js';

# Check: src/supabaseConfig.js
# Should export Supabase client with chromeStorageAdapter

# If wrong → Rebuild:
npm run build && Reload extension
```

---

### Issue 3: "Auth session missing"
**Cause:** User not authenticated OR session expired

**Fix:**
```bash
# Check: Settings tab shows user email?
# If NOT → Click Logout, then Login again

# Check auth status:
chrome.runtime.sendMessage({
  type: 'SUPABASE_AUTH_CHECK',
  correlationId: 'debug'
}, console.log);

# Expected: { type: 'SUPABASE_AUTH_STATUS', data: { authenticated: true, ... } }
```

---

### Issue 4: "new row violates row-level security policy"
**Cause:** RLS policies not created or wrong config

**Fix:**
```sql
-- Supabase SQL Editor
-- Check policies on settings table:
SELECT * FROM pg_policies WHERE tablename = 'settings';

-- Should have 4 policies:
-- - Users can view own settings
-- - Users can insert own settings
-- - Users can update own settings
-- - Users can delete own settings

-- Each policy should have: WITH CHECK (auth.uid() = user_id)

-- If missing → Re-run migration script:
-- Paste: supabase/migrations/001_initial_schema.sql
```

---

## 📋 PROVIDE THIS INFO TO DEBUG

When reporting issue, provide:

1. **UI Console Output** (from Step 1)
2. **Service Worker Console Output** (from Step 2)
3. **SQL Query Result** (from Step 3)
4. **Network Request/Response** (from Step 4)
5. **Diagnostic Script Result** (from QUICK DIAGNOSTIC)

---

## 🚀 NEXT STEPS

**After debugging, try:**

```bash
# 1. Rebuild extension
npm run build

# 2. Reload extension
chrome://extensions → Reload

# 3. Login again

# 4. Try save again

# 5. Check all 3 logs again
```

---

**Ready to debug? Follow steps 1-4 and provide output!**
