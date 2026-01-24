# Debugging Guide - Error Resolution (January 24, 2026)

## 🔴 Error Summary

You're seeing 4 main errors in the browser console:

1. **`supabase.auth.signInWithPassword failed`** - Invalid login credentials (400)
2. **`Content script not ready after max retries`** - Extension not injected properly
3. **`addHistory failed - null value in column "chat_id"`** - Database constraint
4. **`scheduleHistoryUpdate: missing historyId or chatUrl`** - Undefined variable reference

## ✅ Fixes Applied

### Fix #1: historyId Undefined Reference ✅
**File**: `src/ui/results.js` (lines 167-186)

**Problem**: 
- `historyId` was scoped inside an `else` block
- Referenced after the `else` block, causing ReferenceError

**Solution**:
- Moved `historyId` extraction outside the conditional
- Now available for `scheduleHistoryUpdate()` and `startPollingForResponse()`
- Added explicit null checks before using it

**Code Change**:
```javascript
// BEFORE (WRONG):
if (historyResponse?.errorCode) {
  console.error('❌ Failed to save history');
} else {
  const historyId = historyResponse?.history?.id || null;
  // ...
}
// historyId is UNDEFINED here!

// AFTER (CORRECT):
if (historyResponse?.errorCode) {
  console.error('❌ Failed to save history');
}

// Now defined for all code paths
const historyId = historyResponse?.history?.id || null;
console.log('History ID:', historyId);

if (!chatIdToSave && response.chatUrl && historyId) {
  scheduleHistoryUpdate(historyId, response.chatUrl);
}
```

### Fix #2: chat_id NULL Constraint ✅
**File**: `supabase/migrations/002_fix_chat_id_nullable.sql`

**Problem**:
- Database constraint required `chat_id NOT NULL`
- Content script not ready → null chat_id → INSERT fails
- Error: `null value in column "chat_id" violates not-null constraint`

**Solution**:
- Migration makes `chat_id` nullable
- Allows saving history without chat_id when content script not ready
- Will update later when content script is ready

**Verification**:
```sql
-- Check if migration applied
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name='chat_history' AND column_name='chat_id';

-- Should show: is_nullable = YES
```

---

## 🔧 Remaining Issues to Debug

### Issue #1: Invalid Login Credentials
**Error**: 
```
supabase.auth.signInWithPassword failed
errorCode="invalid_credentials"
errorStatus=400
errorMessage="Invalid login credentials"
```

**Root Causes**:
1. Email/password doesn't exist in Supabase Auth
2. User account not created yet
3. Typo in email or password
4. Wrong Supabase project URL

**Debug Steps**:
```javascript
// 1. Check Supabase config
chrome.runtime.sendMessage({
  type: 'SUPABASE_AUTH_CHECK'
}, (response) => {
  console.log('Auth status:', response);
  console.log('Authenticated:', response.data?.authenticated);
  console.log('User:', response.data?.user);
});

// 2. Check Supabase credentials in environment
// File: .env.local
// Should have:
// VITE_SUPABASE_URL=https://xxx.supabase.co
// VITE_SUPABASE_ANON_KEY=eyJhbGc...

// 3. Verify user exists in Supabase dashboard
// Go to: Supabase Dashboard → Authentication → Users
// Look for your email address
```

**Solution**:
1. **Create Test User**:
   - Go to Supabase Dashboard → Authentication → Users
   - Click "Add User"
   - Enter email: `test@example.com`
   - Set password: `TestPassword123!`
   - Click "Create User"

2. **Test Login in Console**:
   ```javascript
   // Open DevTools in Side Panel
   await chrome.runtime.sendMessage({
     type: 'SUPABASE_AUTH_LOGIN',
     data: {
       email: 'test@example.com',
       password: 'TestPassword123!'
     }
   });
   ```

3. **Check .env.local**:
   - Ensure Supabase URL and key are correct
   - Run: `cat /home/beou/IdeaProjects/chatgpt-assistant/.env.local`

---

### Issue #2: Content Script Not Ready After Max Retries
**Error**:
```
Content script not ready after max retries
tabId=1206990163
maxRetries=10
possibleCauses=[...]
```

**Root Causes**:
1. Extension not reloaded after build
2. ChatGPT tab opened before extension loaded
3. Content script failed to inject
4. ChatGPT URL changed
5. JavaScript error in content script

**Debug Steps**:

**Step 1: Reload Extension**
```bash
# In Chrome:
# 1. Go to chrome://extensions
# 2. Find "ChatGPT Assistant"
# 3. Click "Reload" button (circular arrow)
# 4. Verify files loaded: should show "Loaded unpacked" with dist/ folder
```

**Step 2: Check Content Script Injection**
```javascript
// In ChatGPT tab DevTools Console:
// 1. Go to https://chatgpt.com
// 2. Press F12 to open DevTools
// 3. Run in Console:

console.log('Content script marker:', window.__ChatGPTAssistantReady);
console.log('Ready timestamp:', window.__ChatGPTAssistantReadyTimestamp);
console.log('Ready at:', new Date(window.__ChatGPTAssistantReadyTimestamp).toISOString());

// Should show:
// Content script marker: true
// Ready timestamp: 1234567890
// Ready at: 2026-01-24T14:30:45.000Z

// If shows "undefined", content script is NOT injected!
```

**Step 3: Verify Service Worker Is Active**
```javascript
// In Extension DevTools (chrome://extensions):
// 1. Find "ChatGPT Assistant"
// 2. Click "Inspect views: Service worker"
// 3. In DevTools Console, run:

console.log('Service worker is alive');
chrome.tabs.query({url: 'https://chatgpt.com/*'}, (tabs) => {
  console.log('ChatGPT tabs:', tabs.length);
  tabs.forEach(tab => {
    console.log(`- Tab ${tab.id}: ${tab.status} (${tab.url.substring(0, 50)})`);
  });
});
```

**Step 4: Check Manifest Content Scripts**
```javascript
// File: src/extension/manifest.json
// Should have:
"content_scripts": [
  {
    "matches": ["https://chatgpt.com/*", "https://*.chatgpt.com/*"],
    "js": ["dist/content.js"],
    "run_at": "document_start"
  }
]

// ⚠️ CRITICAL: "run_at": "document_start" ensures injection is early
```

**Solution**:
1. **Reload extension**:
   - `chrome://extensions` → Find extension → Click Reload
   - Should show yellow banner: "Reloaded unpacked extension"

2. **Close and reopen ChatGPT tab**:
   - Close all `chatgpt.com` tabs
   - Open new tab to `https://chatgpt.com`
   - Content script should inject immediately

3. **Check browser console for JS errors**:
   - DevTools → Console tab
   - Look for red error messages
   - If errors in content script, fix them and rebuild

4. **Verify manifest.json is correct**:
   - File: `dist/manifest.json` (built version)
   - Should match `src/extension/manifest.json`
   - Run: `cat dist/manifest.json | grep -A 10 "content_scripts"`

---

### Issue #3: Missing chat_id in History Insert

**Error**:
```
null value in column "chat_id" of relation "chat_history" 
violates not-null constraint
```

**Status**: ✅ FIXED by migration `002_fix_chat_id_nullable.sql`

**Verification**:
```sql
-- In Supabase SQL Editor, run:
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name='chat_history'
ORDER BY ordinal_position;

-- Output should show:
-- id               | NO
-- chat_id          | YES  ← Should be YES (nullable)
-- prompt           | NO
-- response         | YES
-- chat_url         | YES
-- timestamp        | NO
-- user_id          | NO
```

**If Still Failing**:
1. **Check if migration applied**:
   ```bash
   # In Supabase dashboard:
   # 1. Go to SQL Editor
   # 2. Look for "Migrations" tab
   # 3. Should show: "002_fix_chat_id_nullable.sql" as applied
   ```

2. **Manually apply migration if needed**:
   ```sql
   ALTER TABLE public.chat_history 
   ALTER COLUMN chat_id DROP NOT NULL;
   ```

3. **Test insert with null chat_id**:
   ```javascript
   // In Extension DevTools Service Worker:
   const { data, error } = await supabase
     .from('chat_history')
     .insert({
       user_id: 'your-user-id',
       prompt: 'test',
       response: null,
       chat_id: null,  // This should now be allowed
       chat_url: null,
       timestamp: Date.now()
     })
     .select()
     .single();
     
   if (error) {
     console.error('Insert failed:', error.message);
   } else {
     console.log('Insert succeeded:', data.id);
   }
   ```

---

## 🔄 Complete Debug Workflow

### Step 1: Verify Extension is Built and Loaded
```bash
# 1. Build extension
npm run build

# 2. Check dist folder exists
ls -la dist/

# 3. Load in Chrome
# chrome://extensions → Load unpacked → select dist/ folder
```

### Step 2: Verify Content Script is Injected
```javascript
// In ChatGPT tab DevTools Console:
console.log('Content script ready:', window.__ChatGPTAssistantReady);

// Should be: true
// If undefined, reload extension and ChatGPT tab
```

### Step 3: Create Test User in Supabase
```bash
# Go to Supabase Dashboard
# Authentication → Users → Add User
# Email: test@example.com
# Password: TestPassword123!
```

### Step 4: Test Login Flow
```javascript
// In Extension DevTools Console:
const response = await chrome.runtime.sendMessage({
  type: 'SUPABASE_AUTH_LOGIN',
  data: {
    email: 'test@example.com',
    password: 'TestPassword123!'
  }
});

console.log('Login response:', response);
// Should show success with user data
```

### Step 5: Test History Insert
```javascript
// In Extension DevTools Console:
const response = await chrome.runtime.sendMessage({
  type: 'HISTORY_ADD',
  data: {
    prompt: 'Test prompt',
    response: 'Test response',
    chat_id: null,  // Can be null now
    chat_url: 'https://chatgpt.com/c/xxx',
    timestamp: Date.now()
  }
});

console.log('History add response:', response);
// Should show success with history ID
```

---

## 📋 Quick Checklist

- [ ] Extension built successfully: `npm run build` (exit code 0)
- [ ] Extension reloaded: `chrome://extensions` → Find → Click Reload
- [ ] ChatGPT tab reopened: Close and reopen `chatgpt.com`
- [ ] Content script injected: DevTools Console → `window.__ChatGPTAssistantReady === true`
- [ ] Supabase user created: Supabase Dashboard → Authentication → Users
- [ ] Login test passed: `SUPABASE_AUTH_LOGIN` handler returns success
- [ ] History insert test passed: `HISTORY_ADD` with `chat_id: null` succeeds
- [ ] Migration applied: Supabase → SQL Editor → Check migrations

---

## 📞 Still Having Issues?

### Enable Debug Logging
```javascript
// In Extension DevTools Console, enable detailed logging:
localStorage.setItem('DEBUG', '*');
location.reload();

// Will show verbose logs for all modules
```

### Check Extension Logs
```bash
# Open Service Worker DevTools
# chrome://extensions → Details → "Inspect views: Service worker"

# All console.log() output appears here
```

### Check Background Errors
```bash
# chrome://extensions → Details → "Inspect views: Service worker"
# Look for red error messages in the console
```

---

## 🚀 After Fixing All Issues

Once all errors are resolved:

1. **Test complete flow**:
   - Login with email/password
   - Open ChatGPT
   - Send a prompt using the extension
   - Verify history is saved with chat_id

2. **Monitor console for new errors**:
   - Keep DevTools open during testing
   - Watch for new error patterns
   - Check correlation IDs for tracing

3. **Rebuild if needed**:
   ```bash
   npm run build
   # Reload extension
   # Reopen ChatGPT tab
   ```

---

**Last Updated**: January 24, 2026  
**Issues Fixed**: 1 ✅  
**Issues Remaining**: 3 (auth, content script, migration verification)

