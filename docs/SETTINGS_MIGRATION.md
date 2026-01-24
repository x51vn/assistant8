# Settings Migration - Chrome Local Storage → Supabase

## ✅ ĐÃ FIX

**Vấn đề:** Settings tab đang lưu prompts vào `chrome.storage.local` thay vì Supabase PostgreSQL.

**Giải pháp:** Migrate hoàn toàn sang Supabase với handler mới.

---

## 📁 FILES CHANGED

### 1. `src/ui/settings.js`
**Changes:**
- ❌ **REMOVED**: `chrome.storage.local.set()` / `chrome.storage.local.get()`
- ✅ **ADDED**: `chrome.runtime.sendMessage(MESSAGE_TYPES.SETTINGS_GET)` 
- ✅ **ADDED**: `chrome.runtime.sendMessage(MESSAGE_TYPES.SETTINGS_UPDATE)`

**Before:**
```javascript
// ❌ Old: Local storage
await chrome.storage.local.set({ 
  [PORTFOLIO_PROMPT_KEY]: portfolioPrompt,
  [STOCK_EVAL_PROMPT_KEY]: stockEvalPrompt,
  ...
});
const stored = await chrome.storage.local.get([PORTFOLIO_PROMPT_KEY]);
```

**After:**
```javascript
// ✅ New: Supabase via message handler
await chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.SETTINGS_UPDATE,
  data: {
    config: {
      prompts: {
        portfolio: portfolioPrompt,
        stockEval: stockEvalPrompt,
        contextMenu: contextMenuPrompt,
        english: englishPrompt
      },
      ...otherSettings
    }
  }
});

const response = await chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.SETTINGS_GET
});
const portfolioPrompt = response.data?.config?.prompts?.portfolio || '';
```

---

### 2. `src/background/handlers/settings.js` (NEW)
**Purpose:** Handle SETTINGS_GET and SETTINGS_UPDATE messages

**Handlers:**
- `MESSAGE_TYPES.SETTINGS_GET` → Fetch user settings từ Supabase
- `MESSAGE_TYPES.SETTINGS_UPDATE` → Upsert user settings vào Supabase

**Database:**
- Table: `settings`
- Columns: `user_id`, `config` (JSONB), `created_at`, `updated_at`
- RLS: User chỉ access own settings

**Code:**
```javascript
// GET
const { data, error } = await supabase
  .from('settings')
  .select('*')
  .eq('user_id', userId)
  .single();

// UPDATE (upsert)
const { data, error } = await supabase
  .from('settings')
  .upsert(
    { user_id: userId, config: config },
    { onConflict: 'user_id' }
  )
  .select()
  .single();
```

---

### 3. `src/shared/messageSchema.js`
**Added:**
```javascript
SETTINGS_GET: 'SETTINGS_GET',
SETTINGS_DATA: 'SETTINGS_DATA',
SETTINGS_UPDATE: 'SETTINGS_UPDATE',
SETTINGS_UPDATED: 'SETTINGS_UPDATED',
```

---

### 4. `src/background/handlers/index.js`
**Added:**
```javascript
import './settings.js'; // ✅ GPT-FIX: Settings handlers
```

---

## 📊 DATA STRUCTURE

### Supabase `settings` Table

```sql
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Config JSON Structure

```json
{
  "prompt": "Main prompt text...",
  "autoRun": true,
  "evaluatePrevious": false,
  "reviewPrompt": true,
  "realtimeEnabled": false,
  "interval": 5,
  "prompts": {
    "portfolio": "Portfolio evaluation prompt...",
    "stockEval": "Stock analysis prompt...",
    "contextMenu": "Context menu prompt...",
    "english": "English learning prompt..."
  }
}
```

---

## 🚀 TESTING

### 1. Rebuild Extension
```bash
npm run build
# Output: dist/background.js (251.57 kB) ✅
```

### 2. Reload Extension
```bash
chrome://extensions
# Click "Reload" on ChatGPT Assistant
```

### 3. Login
- Open extension side panel
- Login với Supabase account

### 4. Test Save
- Vào Settings tab
- Chỉnh sửa prompts (Portfolio, Stock Eval, etc.)
- Click "Lưu"
- Check console: "All settings saved to Supabase" ✅

### 5. Verify Database
```sql
-- Supabase SQL Editor
SELECT * FROM settings WHERE user_id = auth.uid();

-- Expected result:
-- user_id: <uuid>
-- config: { "prompts": { "portfolio": "...", ... }, ... }
```

### 6. Test Load
- Reload extension (chrome://extensions → Reload)
- Mở Settings tab
- Prompts phải load từ database (không bị reset) ✅

---

## 🔍 DEBUGGING

### UI Console (F12)
```javascript
// Check if message sent
chrome.runtime.sendMessage({
  type: 'SETTINGS_GET',
  correlationId: 'test-123'
}, (response) => {
  console.log('Settings response:', response);
  // Expected: { type: 'SETTINGS_DATA', data: { config: {...} } }
});
```

### Background Service Worker Console
```javascript
// chrome://extensions → Inspect Service Worker
console.log('[Settings] Handler registered?', 
  messageRouter.handlers.has('SETTINGS_GET')
);
```

### Supabase Dashboard
- SQL Editor → `SELECT * FROM settings;`
- Check RLS policies enabled
- Check user_id matches auth.users

---

## ⚠️ MIGRATION NOTES

### Old Data (chrome.storage.local)
```javascript
// Data structure before migration
{
  "portfolioPrompt": "...",
  "stockEvalPrompt": "...",
  "contextMenuPrompt": "...",
  "englishPrompt": "...",
  "prompt": "...",
  "autoRun": true,
  ...
}
```

### New Data (Supabase settings.config)
```json
{
  "prompt": "...",
  "autoRun": true,
  "prompts": {
    "portfolio": "...",
    "stockEval": "...",
    "contextMenu": "...",
    "english": "..."
  }
}
```

**Migration Path:**
1. User opens Settings tab → UI tries to load from Supabase
2. If empty (404/PGRST116) → Return empty config
3. User edits prompts → Click Save
4. Handler creates new row in settings table
5. Old chrome.storage.local data ignored (can be manually cleared)

---

## ✅ BENEFITS

### Before (chrome.storage.local)
- ❌ Data lost khi uninstall extension
- ❌ Không sync cross-device
- ❌ Quota limit ~10 MB
- ❌ No user isolation (single-user only)
- ❌ No query capabilities

### After (Supabase)
- ✅ Data persist cloud-side
- ✅ Sync across all devices (same account)
- ✅ Unlimited storage (within Supabase plan)
- ✅ RLS enforces user isolation
- ✅ Full SQL query support
- ✅ Realtime updates possible (future)
- ✅ Backup/restore via Supabase dashboard

---

## 🎯 NEXT STEPS

1. **Test thoroughly**:
   - Save different prompts
   - Reload extension
   - Check persistence

2. **Add migration helper** (Optional):
   ```javascript
   // Detect old chrome.storage.local data
   const oldData = await chrome.storage.local.get([
     'portfolioPrompt', 'stockEvalPrompt', ...
   ]);
   
   if (oldData.portfolioPrompt) {
     // Show "Migrate old data?" prompt
     // Call SETTINGS_UPDATE with old data
     // Clear chrome.storage.local after success
   }
   ```

3. **Monitor errors**:
   - Watch for "Invalid API key"
   - Watch for "Auth session missing"
   - Check Supabase logs

4. **Optimize**:
   - Add caching (TTL 30s) to reduce API calls
   - Debounce save button (500ms)
   - Optimistic UI updates

---

## 📋 CHECKLIST

- [x] ✅ Created `src/background/handlers/settings.js`
- [x] ✅ Updated `src/ui/settings.js` (removed chrome.storage.local)
- [x] ✅ Added MESSAGE_TYPES in `messageSchema.js`
- [x] ✅ Registered handler in `handlers/index.js`
- [x] ✅ Build successful (251.57 kB)
- [ ] ⏳ User testing required
- [ ] ⏳ Verify database persistence
- [ ] ⏳ Check RLS policies working

---

**Status:** ✅ **READY FOR TESTING**

**Build Output:**
```
dist/background.js    251.57 kB │ gzip: 65.37 kB ✅
```

**Next:** Reload extension và test Settings tab!
