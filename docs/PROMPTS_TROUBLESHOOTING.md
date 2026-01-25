# Hướng Dẫn Troubleshooting - Prompts Không Hiển Thị

## ✅ XÁC NHẬN: Code ĐÃ ĐÚNG

Code của bạn ĐÃ DÙNG SUPABASE 100%:
- ✅ `src/background/handlers/prompts.js` → `supabase.from('prompts').insert()`
- ✅ `src/ui/prompts.js` → gửi messages đến background handler
- ✅ KHÔNG có `chrome.storage.local` trong code prompts

## ❌ LÝ DO PROMPTS CHƯA THẤY

### 1. Tables chưa được tạo trên Supabase (QUAN TRỌNG NHẤT!)

**Kiểm tra:**
```bash
# Vào Supabase Dashboard
https://supabase.com/dashboard/project/ugqfxklleekniuujohcm

# SQL Editor → New Query → Chạy:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'prompts';
```

**Kết quả mong đợi:**
- Nếu **EMPTY** (0 rows) → Tables chưa tồn tại ❌
- Nếu có **1 row** với `table_name = 'prompts'` → Tables đã tồn tại ✅

**FIX:**
```bash
# 1. Vào SQL Editor
# 2. Paste toàn bộ file: supabase/migrations/001_initial_schema.sql
# 3. Nhấn RUN (hoặc Ctrl+Enter)
# 4. Đợi ~5-10 giây
# 5. Chạy lại verify query
```

---

### 2. RLS Policies chưa đúng

**Kiểm tra:**
```sql
SELECT policyname FROM pg_policies 
WHERE tablename = 'prompts';
```

**Kết quả mong đợi:** 4 policies
- `Users can view own prompts`
- `Users can insert own prompts`
- `Users can update own prompts`
- `Users can delete own prompts`

**FIX:** Nếu không có policies → Chạy lại migration script

---

### 3. User chưa login

**Kiểm tra trong Chrome DevTools:**
```javascript
// F12 → Console
chrome.runtime.sendMessage({
  type: 'SUPABASE_AUTH_CHECK',
  correlationId: 'test-123'
}, (response) => {
  console.log('Auth Status:', response);
});
```

**Kết quả mong đợi:**
```json
{
  "type": "SUPABASE_AUTH_STATUS",
  "data": {
    "authenticated": true,
    "user": { "id": "...", "email": "..." }
  }
}
```

**FIX:** Nếu `authenticated: false` → Login lại trong extension

---

### 4. Network/CORS Issues

**Kiểm tra trong Background Service Worker:**
```javascript
// chrome://extensions → Service Worker → Console
import { supabase } from './supabaseConfig.js';

const { data, error } = await supabase.from('prompts').select('*');
console.log('Direct query:', { data, error });
```

**Lỗi thường gặp:**
- `relation "public.prompts" does not exist` → Chạy migration
- `Invalid API key` → Check `.env` credentials
- `Auth session missing` → Login lại
- `Failed to fetch` → Firewall/Network issue

---

## 🔍 STEP-BY-STEP DEBUGGING

### Bước 1: Verify Tables
```bash
# Supabase SQL Editor
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```

**Nếu EMPTY** → Chạy migration:
1. Copy nội dung `supabase/migrations/001_initial_schema.sql`
2. Paste vào SQL Editor
3. Run
4. Refresh page

---

### Bước 2: Verify Auth
```bash
# Extension → F12 → Console
chrome.runtime.sendMessage({
  type: 'SUPABASE_AUTH_CHECK',
  correlationId: 'debug'
}, console.log);
```

**Nếu unauthenticated** → Login:
1. Vào Settings tab
2. Nhập email + password
3. Click "Login"
4. Check console logs

---

### Bước 3: Test Insert
```bash
# Supabase SQL Editor (sau khi login extension)
INSERT INTO public.prompts (user_id, title, content)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'Test Prompt',
  'This is a test'
);

SELECT * FROM public.prompts;
```

**Nếu lỗi** `user_id violates foreign key` → User chưa tồn tại trong auth.users
**Fix:** Tạo user trong Dashboard → Authentication → Users

---

### Bước 4: Test UI Flow
```bash
# Extension → Prompts tab → Click "Thêm Prompt"
# Fill form → Save
# Check console logs (both UI and Background)
```

**Expected logs:**
```
[UI] Sending PROMPT_ADD message...
[Background] Received PROMPT_ADD
[Background] userId: abc-123-def
[Supabase] Insert successful
[UI] Received PROMPT_ADDED response
[UI] Refreshing prompts list...
```

---

## 🚀 QUICK FIX (90% Cases)

**MOST LIKELY ISSUE:** Tables chưa được tạo

**1-MINUTE FIX:**
```bash
1. Vào https://supabase.com/dashboard/project/ugqfxklleekniuujohcm/sql/new
2. Copy/Paste: supabase/migrations/001_initial_schema.sql
3. Click RUN
4. Đợi "Success" message
5. Reload extension (chrome://extensions → Reload)
6. Login lại
7. Test thêm prompt
```

---

## 📊 VERIFICATION CHECKLIST

- [ ] Tables tồn tại: `SELECT * FROM prompts LIMIT 1;` không lỗi
- [ ] RLS enabled: `SELECT relrowsecurity FROM pg_class WHERE relname = 'prompts';` → `t`
- [ ] Policies exist: `SELECT COUNT(*) FROM pg_policies WHERE tablename = 'prompts';` → `4`
- [ ] User logged in: Auth check returns `authenticated: true`
- [ ] API keys đúng: `.env` có 205-character anon key
- [ ] Extension rebuilt: `npm run build` → No errors
- [ ] Background SW active: `chrome://extensions` → Service Worker "active"

---

## 📝 COMMON ERRORS & FIXES

| Error | Cause | Fix |
|-------|-------|-----|
| `relation "public.prompts" does not exist` | Tables chưa tạo | Run migration SQL |
| `Auth session missing` | User chưa login | Login trong extension |
| `Invalid API key` | `.env` sai | Check anon key length (>100 chars) |
| `Failed to fetch` | Network/CORS | Check internet, firewall |
| `user_id violates foreign key` | User không trong auth.users | Tạo user qua Dashboard |
| `RLS policy violation` | Policies chưa enable | Run migration (includes RLS) |

---

## 🆘 LAST RESORT

Nếu tất cả đều fail:

```bash
# 1. Drop tables (nếu có)
DROP TABLE IF EXISTS public.prompts CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
# ... (all tables)

# 2. Chạy lại migration từ đầu
# Paste 001_initial_schema.sql

# 3. Tạo test user
# Dashboard → Authentication → Add User
# Email: test@example.com
# Password: Test1234!

# 4. Rebuild extension
npm run build

# 5. Reload extension
# chrome://extensions → Reload

# 6. Login với test user

# 7. Test insert prompt
```

---

**TÓM TẮT:** 99% khả năng là tables CHƯA ĐƯỢC TẠO. Chạy migration script là xong!

