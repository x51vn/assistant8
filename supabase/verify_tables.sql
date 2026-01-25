-- ============================================
-- Verify Tables Exist
-- ============================================
-- Run this in Supabase SQL Editor to check if migration succeeded

SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('users', 'prompts', 'categories', 'chat_history', 'portfolio', 'errors', 'settings', 'runs')
ORDER BY table_name;

-- Expected output (8 rows):
-- categories | 6
-- chat_history | 10
-- errors | 8
-- portfolio | 7
-- prompts | 10
-- runs | 6
-- settings | 3
-- users | 6

-- ============================================
-- Check RLS Policies
-- ============================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Expected: ~32 policies (4 per table: SELECT, INSERT, UPDATE, DELETE)

-- ============================================
-- Test Prompt Insert (Should work after auth)
-- ============================================
-- Run this AFTER logging in to extension:

-- INSERT INTO public.prompts (user_id, title, content)
-- VALUES (auth.uid(), 'Test Prompt', 'This is a test prompt content');

-- SELECT * FROM public.prompts WHERE user_id = auth.uid();
