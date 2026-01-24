# Apply Migration - Fix chat_id NULL constraint

## 📝 **Migration: 002_fix_chat_id_nullable.sql**

### **Purpose**
Fix database constraint để cho phép `chat_id` NULL khi content script không ready.

### **Changes**
1. ✅ Drop NOT NULL constraint trên `chat_history.chat_id`
2. ✅ Drop unique constraint cũ `unique_chat_per_user`
3. ✅ Add partial unique index (chỉ check uniqueness khi chat_id NOT NULL)

---

## 🚀 **Cách apply migration**

### **Option 1: Supabase CLI (Recommended)**

```bash
# 1. Navigate to project
cd /home/beou/IdeaProjects/chatgpt-assistant

# 2. Check Supabase connection
supabase status

# 3. Apply migration
supabase db push

# 4. Verify
supabase db diff
```

### **Option 2: Supabase Dashboard (Manual)**

1. Vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project: **ChatGPT Assistant**
3. Vào **SQL Editor**
4. Copy nội dung file `supabase/migrations/002_fix_chat_id_nullable.sql`
5. Paste vào editor
6. Click **Run**

### **Option 3: Run SQL directly**

```sql
-- Copy and run this in Supabase SQL Editor:

-- Drop the NOT NULL constraint on chat_id
ALTER TABLE public.chat_history 
  ALTER COLUMN chat_id DROP NOT NULL;

-- Drop the unique constraint that requires chat_id
ALTER TABLE public.chat_history 
  DROP CONSTRAINT IF EXISTS unique_chat_per_user;

-- Add new unique constraint that allows NULL chat_id
CREATE UNIQUE INDEX IF NOT EXISTS unique_chat_per_user_non_null 
  ON public.chat_history (user_id, chat_id) 
  WHERE chat_id IS NOT NULL;

COMMENT ON INDEX public.unique_chat_per_user_non_null IS 
  'Ensures unique chat_id per user, but allows multiple NULL chat_ids';

COMMENT ON COLUMN public.chat_history.chat_id IS 
  'ChatGPT conversation ID (nullable if content script not ready at time of save)';
```

---

## ✅ **Verification**

### **1. Check column constraints**

```sql
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'chat_history' 
  AND column_name = 'chat_id';
```

**Expected:**
| column_name | data_type | is_nullable | column_default |
|-------------|-----------|-------------|----------------|
| chat_id     | text      | **YES**     | NULL           |

### **2. Check unique index**

```sql
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'chat_history' 
  AND indexname LIKE '%chat%';
```

**Expected:**
```
indexname: unique_chat_per_user_non_null
indexdef: CREATE UNIQUE INDEX unique_chat_per_user_non_null 
          ON public.chat_history USING btree (user_id, chat_id) 
          WHERE (chat_id IS NOT NULL)
```

### **3. Test insert with NULL chat_id**

```sql
-- Should succeed now
INSERT INTO public.chat_history (
  user_id,
  chat_id,
  prompt,
  timestamp
) VALUES (
  auth.uid(),
  NULL, -- ✅ NULL is allowed
  'Test prompt without chat_id',
  extract(epoch from now()) * 1000
);
```

### **4. Test unique constraint still works**

```sql
-- Should succeed (first insert)
INSERT INTO public.chat_history (user_id, chat_id, prompt, timestamp) 
VALUES (auth.uid(), 'test123', 'First', extract(epoch from now()) * 1000);

-- Should FAIL with unique constraint violation
INSERT INTO public.chat_history (user_id, chat_id, prompt, timestamp) 
VALUES (auth.uid(), 'test123', 'Duplicate', extract(epoch from now()) * 1000);
-- ERROR: duplicate key value violates unique constraint "unique_chat_per_user_non_null"

-- Cleanup
DELETE FROM public.chat_history WHERE chat_id = 'test123';
```

---

## 🔄 **Rollback (nếu cần)**

```sql
-- Restore NOT NULL constraint
-- ⚠️ WARNING: This will FAIL if any existing rows have NULL chat_id
-- Clean up NULLs first:
DELETE FROM public.chat_history WHERE chat_id IS NULL;

-- Then restore constraint:
ALTER TABLE public.chat_history 
  ALTER COLUMN chat_id SET NOT NULL;

-- Restore old unique constraint
DROP INDEX IF EXISTS unique_chat_per_user_non_null;

ALTER TABLE public.chat_history 
  ADD CONSTRAINT unique_chat_per_user UNIQUE(user_id, chat_id);
```

---

## 📊 **Impact Analysis**

### **Before migration:**
```
❌ Content script not ready → no chat_id 
❌ Insert with chat_id = NULL → Database error
❌ User loses data (prompt not saved)
```

### **After migration:**
```
✅ Content script not ready → no chat_id
✅ Insert with chat_id = NULL → Success
✅ Data saved with warning log
✅ Can update chat_id later when available
```

### **Performance:**
- ✅ Partial unique index: Similar performance to original
- ✅ NULL values không check uniqueness (SQL standard)
- ✅ No impact on existing queries

### **Data integrity:**
- ✅ Unique constraint still enforced (when chat_id NOT NULL)
- ✅ RLS policies unchanged
- ✅ Foreign keys unchanged

---

## 🔍 **Query Examples**

### **Find records without chat_id**

```sql
SELECT 
  id,
  prompt,
  created_at,
  chat_id
FROM chat_history
WHERE user_id = auth.uid()
  AND chat_id IS NULL
ORDER BY created_at DESC
LIMIT 10;
```

### **Update chat_id for existing records**

```sql
UPDATE chat_history
SET 
  chat_id = 'c123-abc-def',
  chat_url = 'https://chatgpt.com/c/c123-abc-def'
WHERE id = 'some-uuid'
  AND user_id = auth.uid()
  AND chat_id IS NULL;
```

---

## 🎯 **Related Code Changes**

### **1. Handler: Allow NULL chat_id**
```javascript
// src/background/handlers/chatHistory.js

const { data, error } = await supabase
  .from('chat_history')
  .insert({
    chat_id: chat_id || null, // ✅ NULL allowed
    ...
  });
```

### **2. UI: Skip save if no chat_id**
```javascript
// src/ui/results.js

if (response.chatId || response.chatUrl) {
  // Save history
} else {
  console.warn('Skipping - content script not ready');
}
```

### **3. Content script: Better logging**
```javascript
// src/content.js

console.log('[ChatGPT Assistant] content script loaded at', new Date().toISOString());
```

---

## 📞 **Support**

Nếu migration fails:

1. **Check Supabase connection:**
   ```bash
   supabase status
   ```

2. **Check for dependent objects:**
   ```sql
   SELECT 
     conname, 
     contype,
     pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'chat_history'::regclass;
   ```

3. **Check for existing NULL values:**
   ```sql
   SELECT COUNT(*) 
   FROM chat_history 
   WHERE chat_id IS NULL;
   ```

---

**Status:** ✅ Ready to apply  
**Risk Level:** 🟢 LOW (backward compatible, improves reliability)  
**Rollback Available:** ✅ YES (with data cleanup)
