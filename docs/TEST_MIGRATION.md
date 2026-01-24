# Test Guide - Settings Migration to Supabase

## 🎯 MỤC TIÊU TEST

Verify Settings tab ĐÃ LƯU VÀO SUPABASE thay vì chrome.storage.local

---

## 📋 PREREQUISITES

- ✅ Extension đã build: `npm run build` (249.61 kB)
- ✅ Tables đã tạo trên Supabase (chạy migration SQL)
- ✅ User account đã tạo trong Supabase Auth

---

## 🧪 TEST SCENARIOS

### Test 1: Reload Extension

```bash
# 1. Mở Chrome
chrome://extensions

# 2. Tìm "ChatGPT Assistant"

# 3. Click "Reload" (icon refresh)

# 4. Verify không có errors
# - Kiểm tra background service worker: "Inspect views: Service worker"
# - Console không có errors màu đỏ
```

**Expected:** Service worker active, no errors

---

### Test 2: Login

```bash
# 1. Mở extension side panel (click icon trên toolbar)

# 2. Nếu chưa login → Nhập email + password

# 3. Click "Login"

# 4. Check console logs (F12 → Console)
```

**Expected Console Logs:**
```
[Auth] User logged in: { id: "...", email: "..." }
[Auth] Login success, initializing app
[Settings] Loading user info
```

**Expected UI:**
- Login screen biến mất
- Main UI hiển thị
- Settings tab có email user

---

### Test 3: Settings Tab - Save Prompts

```bash
# 1. Vào tab "Cấu hình" (Settings)

# 2. Scroll xuống prompts:
#    - Portfolio Prompt
#    - Stock Eval Prompt  
#    - Context Menu Prompt
#    - English Prompt

# 3. Chỉnh sửa một prompt bất kỳ
#    VD: Portfolio Prompt = "Test Supabase Migration 123"

# 4. Click "Lưu" (Save button)

# 5. Check console logs
```

**Expected Console Logs:**
```
[Settings] Đang lưu...
[Background] Received SETTINGS_UPDATE
[Background] userId: abc-123-def
[Supabase] Upsert successful
[Settings] All settings saved to Supabase
```

**Expected UI:**
```
"Lưu cấu hình thành công!" (màu xanh)
```

---

### Test 4: Verify Database (Supabase Dashboard)

```bash
# 1. Vào Supabase Dashboard
https://supabase.com/dashboard/project/ugqfxklleekniuujohcm

# 2. SQL Editor → New Query

# 3. Chạy query:
SELECT * FROM settings WHERE user_id = auth.uid();

# 4. Check kết quả
```

**Expected Result:**
```json
{
  "user_id": "<uuid>",
  "config": {
    "prompt": "...",
    "prompts": {
      "portfolio": "Test Supabase Migration 123",
      "stockEval": "...",
      "contextMenu": "...",
      "english": "..."
    },
    "autoRun": false,
    "interval": 5
  },
  "created_at": "2026-01-24T...",
  "updated_at": "2026-01-24T..."
}
```

**CRITICAL CHECK:** 
- ✅ `config.prompts.portfolio` phải có text "Test Supabase Migration 123"
- ✅ Row tồn tại với `user_id` matching auth.uid()

---

### Test 5: Reload Extension → Verify Persistence

```bash
# 1. chrome://extensions → Reload extension

# 2. Mở side panel lại

# 3. Login (nếu bị logout)

# 4. Vào Settings tab

# 5. Check Portfolio Prompt
```

**Expected:**
- Portfolio Prompt = "Test Supabase Migration 123" (KHÔNG mất dữ liệu)
- Tất cả prompts khác cũng load đúng

**FAIL nếu:**
- ❌ Prompts bị reset về giá trị mặc định
- ❌ Portfolio Prompt = "" (empty)

---

### Test 6: Reset Button (No Data Loss)

```bash
# 1. Settings tab → Chỉnh sửa prompts

# 2. Click "Reset" button

# 3. Check UI → Prompts cleared to defaults

# 4. KHÔNG CLICK "Lưu"

# 5. Reload extension

# 6. Login → Settings tab
```

**Expected:**
- Prompts vẫn giữ giá trị CŨ (từ database)
- Reset CHỈ clear UI, KHÔNG xóa database
- Phải click "Lưu" sau "Reset" mới xóa database

---

### Test 7: Multiple Devices (Optional)

```bash
# Device 1: Save prompt "Test Device 1"
# Device 2: Reload extension → Login
# Check: Settings tab phải có "Test Device 1"
```

**Expected:** Cross-device sync hoạt động

---

## 🐛 DEBUGGING

### Issue 1: "Auth session missing"

**Cause:** User chưa login

**Fix:**
```bash
# Check auth status
chrome.runtime.sendMessage({
  type: 'SUPABASE_AUTH_CHECK',
  correlationId: 'test-123'
}, console.log);

# Expected: { authenticated: true, user: {...} }
# If false → Login lại
```

---

### Issue 2: "Lưu thất bại"

**Cause:** Lỗi khi call SETTINGS_UPDATE

**Debug:**
```bash
# F12 → Console → Check error message
# VD: "Invalid API key", "Network error", "RLS policy violation"

# Background Service Worker Console:
chrome://extensions → Inspect Service Worker → Console
# Check logs: "[Settings] updateSettings", errors?
```

---

### Issue 3: Prompts không load

**Cause:** SETTINGS_GET trả về empty hoặc error

**Debug:**
```bash
# UI Console:
chrome.runtime.sendMessage({
  type: 'SETTINGS_GET',
  correlationId: 'debug-1'
}, (response) => {
  console.log('Settings response:', response);
});

# Expected: { type: 'SETTINGS_DATA', data: { config: {...} } }
# If error → Check auth, RLS policies
```

---

### Issue 4: Database empty

**Cause:** RLS policies chặn INSERT

**Fix:**
```sql
-- Supabase SQL Editor
-- Check policies
SELECT * FROM pg_policies WHERE tablename = 'settings';

-- Should have 4 policies: SELECT, INSERT, UPDATE, DELETE
-- WITH CHECK (auth.uid() = user_id)

-- Test insert manually:
INSERT INTO settings (user_id, config)
VALUES (auth.uid(), '{"test": true}');

-- If error → Re-run migration script
```

---

## ✅ SUCCESS CRITERIA

- [x] ✅ Extension reload không có errors
- [x] ✅ Login thành công
- [x] ✅ Save prompts → "Lưu cấu hình thành công!"
- [x] ✅ Database có row trong `settings` table
- [x] ✅ Reload extension → Prompts vẫn persist
- [x] ✅ Reset button chỉ clear UI (không xóa DB)

---

## 🚫 FAILURE INDICATORS

- ❌ Console errors: "chrome.storage.local is not defined"
- ❌ Settings không save: "Lưu thất bại"
- ❌ Database empty: `SELECT * FROM settings → 0 rows`
- ❌ Reload mất data: Prompts reset về defaults
- ❌ RLS errors: "new row violates row-level security policy"

---

## 📊 TEST RESULTS TEMPLATE

```
TEST RESULTS - Settings Migration
Date: 2026-01-24
Build: 249.61 kB

Test 1 - Reload Extension: ✅ / ❌
Test 2 - Login: ✅ / ❌
Test 3 - Save Prompts: ✅ / ❌
Test 4 - Verify Database: ✅ / ❌
Test 5 - Reload Persistence: ✅ / ❌
Test 6 - Reset Button: ✅ / ❌

Overall: PASS / FAIL

Notes:
- [Your observations here]
```

---

## 🎯 NEXT AFTER TEST

**If PASS:**
- ✅ Tiếp tục migrate 8 files còn lại
- ✅ Commit code: "feat: migrate settings to Supabase"

**If FAIL:**
- ❌ Debug errors
- ❌ Check migration script chạy đúng chưa
- ❌ Verify Supabase credentials trong .env

---

**Ready to test?** Reload extension ngay! 🚀
