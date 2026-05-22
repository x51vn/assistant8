# Supabase Database Setup Guide

> **Ticket**: GPT-009 (Supabase SQL schema + RLS pack)  
> **Updated**: February 2026 (Asset Summaries + Edge Functions)

## Overview

This guide explains how to set up the PostgreSQL database for ChatGPT Assistant on Supabase. The schema includes 9 tables with Row Level Security (RLS) policies for multi-user data isolation, plus triggers for real-time aggregation and an Edge Function for daily snapshots.

---

## Prerequisites

1. **Supabase Account**: Sign up at [supabase.com](https://supabase.com)
2. **Supabase Project**: Create a new project
3. **Supabase Auth Enabled**: Ensure Email/Password auth is enabled (Settings → Authentication)

---

## Quick Start

### Option 1: Apply via Supabase Dashboard (Recommended)

1. Go to your Supabase project
2. Navigate to **SQL Editor** in the sidebar
3. Click **New Query**
4. Apply migrations **in order**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_fix_chat_id_nullable.sql`
   - `supabase/migrations/003_create_assets_tables.sql`
   - `supabase/migrations/004_asset_summaries_triggers.sql` ← **New**
5. Click **Run** for each
6. Wait for completion (should take ~2-5 seconds each)
7. Verify success by running the verification queries (see below)

### Option 2: Apply via Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migration
supabase db push
```

---

## Edge Function: Daily Asset Snapshot

Deploy the Edge Function for daily net worth snapshots (runs at 4 PM weekdays):

```bash
# From project root
cd supabase

# Deploy the function
supabase functions deploy daily-asset-snapshot

# Verify deployment
supabase functions list
```

### Configure Scheduled Job (Cron)

After deploying, set up the scheduled job in Supabase Dashboard:

1. Go to **Database** → **Scheduled Jobs**
2. Create new job:
   - **Name**: `daily_asset_snapshot`
   - **Schedule**: `0 9 * * 1-5` (9 AM UTC = 4 PM Vietnam time)
   - **Command**: 
     ```sql
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-asset-snapshot',
       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     ```

**Alternative**: Use pg_cron extension if http_post not available.

---

## Database Schema

### Tables Created

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Extended user profiles | id, email, display_name |
| `prompts` | Prompt templates library | title, content, category_id, is_favorite |
| `categories` | Categories/Tags | name, color, icon |
| `chat_history` | ChatGPT conversations | chat_id, prompt, response, timestamp |
| `portfolio` | Stock holdings | symbol, quantity, avg_price |
| `errors` | Error retrospective | title, severity, type, resolved |
| `settings` | User settings (JSONB) | config |
| `runs` | Execution tracking | run_id, status, metadata |

### Indexes Created

**Performance Indexes**:
- `idx_prompts_user` - Fast user prompt lookups
- `idx_prompts_favorite` - Favorites-only queries
- `idx_chat_history_user_timestamp` - Recent history first
- `idx_portfolio_user` - User portfolio queries
- `idx_errors_unresolved` - Unresolved errors only
- And 10+ more for optimal performance

### Row Level Security (RLS)

**All tables have RLS enabled** with the following pattern:

```sql
-- Users can only access their own data
CREATE POLICY "Users can view own [table]"
  ON public.[table]
  FOR SELECT
  USING (auth.uid() = user_id);
```

**4 policies per table**:
- ✅ SELECT: View own data
- ✅ INSERT: Create own data
- ✅ UPDATE: Modify own data
- ✅ DELETE: Remove own data

---

## Verification

### Step 1: Check Tables Exist

Run this query in Supabase SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'users', 'prompts', 'categories', 'chat_history', 
  'portfolio', 'errors', 'settings', 'runs'
);
```

**Expected Result**: 8 rows (all table names)

### Step 2: Verify RLS is Enabled

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'users', 'prompts', 'categories', 'chat_history', 
  'portfolio', 'errors', 'settings', 'runs'
);
```

**Expected Result**: 8 rows with `rowsecurity = true`

### Step 3: Check Policies

```sql
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public' 
GROUP BY tablename
ORDER BY tablename;
```

**Expected Result**: 
- `users`: 2 policies
- Other tables: 4 policies each (SELECT, INSERT, UPDATE, DELETE)

### Step 4: Check Indexes

```sql
SELECT tablename, COUNT(*) as index_count
FROM pg_indexes 
WHERE schemaname = 'public' 
GROUP BY tablename
ORDER BY tablename;
```

**Expected Result**: Multiple indexes per table (varies by table)

---

## Testing RLS Policies

### Test 1: Create Two Test Users

1. Go to **Authentication → Users** in Supabase Dashboard
2. Click **Add User** → Create `user1@test.com`
3. Click **Add User** → Create `user2@test.com`

### Test 2: Insert Data as User 1

```sql
-- Insert prompt as user1 (replace USER1_UUID with actual user ID)
INSERT INTO public.prompts (user_id, title, content)
VALUES 
  ('USER1_UUID', 'Test Prompt', 'This is user 1 prompt');
```

### Test 3: Verify RLS Isolation

```sql
-- Try to query as user2 (should return 0 rows)
-- Switch user context in Supabase dashboard or use JWT token
SELECT * FROM public.prompts WHERE user_id = 'USER1_UUID';
```

**Expected**: 
- User 1 sees their own prompt
- User 2 sees **nothing** (RLS blocks access)

### Test 4: Insert with Wrong user_id (Should Fail)

```sql
-- Try to insert with different user_id (should fail RLS check)
INSERT INTO public.prompts (user_id, title, content)
VALUES 
  ('DIFFERENT_USER_UUID', 'Hacked Prompt', 'This should fail');
```

**Expected**: Error - "new row violates row-level security policy"

---

## Schema Features

### 1. Automatic Timestamps

All tables have:
- `created_at` - Set automatically on INSERT
- `updated_at` - Updated automatically on UPDATE (via triggers)

### 2. Constraints

**Data Integrity**:
- `quantity > 0` on portfolio
- `title_not_empty`, `content_not_empty` on prompts
- `unique_symbol_per_user` on portfolio
- `severity IN (...)` on errors

### 3. Foreign Keys

**Cascade Deletion**:
- Delete user → All their data deleted (ON DELETE CASCADE)
- Delete category → Prompts keep running (ON DELETE SET NULL)
- Delete prompt → Chat history keeps running (ON DELETE SET NULL)

### 4. JSONB Columns

**Flexible Data**:
- `settings.config` - User settings object
- `runs.metadata` - Run-specific data
- `chat_history.metadata` - Conversation metadata (model, tokens, etc.)

---

## Common Issues & Solutions

### Issue 1: "permission denied for schema public"

**Solution**: Run this as Supabase admin:

```sql
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
```

### Issue 2: "relation already exists"

**Solution**: Script is idempotent - safe to re-run. If you need fresh start:

```sql
-- WARNING: Deletes all data!
DROP TABLE IF EXISTS public.runs CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.errors CASCADE;
DROP TABLE IF EXISTS public.portfolio CASCADE;
DROP TABLE IF EXISTS public.chat_history CASCADE;
DROP TABLE IF EXISTS public.prompts CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

-- Then re-run 001_initial_schema.sql
```

### Issue 3: "auth.uid() is null"

**Solution**: 
- Ensure user is authenticated before inserting data
- Use `supabase.auth.signIn()` in extension before database operations
- Check `chrome.storage.local` has valid Supabase session token

### Issue 4: Policies not working

**Solution**: Check RLS is enabled:

```sql
-- Enable RLS if not already
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
-- ... etc for all tables
```

---

## Maintenance

### Backup Database

```bash
# Via Supabase CLI
supabase db dump -f backup.sql

# Or use Supabase Dashboard → Database → Backups
```

### View Active Connections

```sql
SELECT count(*) FROM pg_stat_activity;
```

### View Table Sizes

```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Analyze Query Performance

```sql
EXPLAIN ANALYZE
SELECT * FROM public.prompts WHERE user_id = 'YOUR_USER_ID' AND is_favorite = TRUE;
```

---

## Migration Strategy (Future)

For schema changes after initial deployment:

1. Create new migration file: `supabase/migrations/002_add_prompt_tags.sql`
2. Use `ALTER TABLE` instead of `CREATE TABLE`
3. Always include rollback instructions
4. Test on staging project first
5. Apply to production

**Example Migration**:

```sql
-- 002_add_prompt_tags.sql
-- Add tags column to prompts table

ALTER TABLE public.prompts 
ADD COLUMN IF NOT EXISTS tags TEXT[];

COMMENT ON COLUMN public.prompts.tags IS 'Array of tag strings for flexible tagging';

CREATE INDEX IF NOT EXISTS idx_prompts_tags 
ON public.prompts USING GIN (tags);

-- Rollback:
-- ALTER TABLE public.prompts DROP COLUMN IF EXISTS tags;
```

---

## Security Best Practices

✅ **DO**:
- Always use RLS policies
- Use `auth.uid()` in policies
- Test with multiple users
- Use service_role key only in backend
- Keep anon key in client (extension)

❌ **DON'T**:
- Disable RLS on production tables
- Use service_role key in client code
- Store sensitive data without encryption
- Allow public INSERT without auth check

---

## References

- [Supabase Database Docs](https://supabase.com/docs/guides/database)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Project Architecture](../docs/ARCHITECTURE.md)

---

## Support

If you encounter issues:

1. Check [Supabase Status](https://status.supabase.com/)
2. Review [Supabase Community](https://github.com/supabase/supabase/discussions)
3. Check project logs in Supabase Dashboard

---

**Last Updated**: January 23, 2026  
**Schema Version**: 1.0  
**Maintainer**: ChatGPT Assistant Team

Database Password:
```CeVPfW92S5GtMR0Q```