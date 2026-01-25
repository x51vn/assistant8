-- ============================================
-- RLS Testing Script
-- ============================================
-- This script helps verify that Row Level Security (RLS)
-- is working correctly for multi-user data isolation.
--
-- IMPORTANT: Run these tests after applying 001_initial_schema.sql

-- ============================================
-- SETUP: Create Test Users
-- ============================================

-- Note: You need to create test users via Supabase Dashboard
-- Go to Authentication → Users → Add User
-- Create two users:
-- - user1@test.com (password: test123456)
-- - user2@test.com (password: test123456)
--
-- Get their UUIDs from auth.users table:

SELECT id, email FROM auth.users WHERE email LIKE '%test.com' ORDER BY email;

-- Replace USER1_UUID and USER2_UUID below with actual values

-- ============================================
-- TEST 1: Insert Data as Admin (Bypasses RLS)
-- ============================================

-- Insert test categories for user1
INSERT INTO public.categories (user_id, name, color, icon) VALUES
  ('USER1_UUID', 'Work', '#667eea', '💼'),
  ('USER1_UUID', 'Personal', '#f093fb', '🏠');

-- Insert test categories for user2
INSERT INTO public.categories (user_id, name, color, icon) VALUES
  ('USER2_UUID', 'Projects', '#4facfe', '🚀'),
  ('USER2_UUID', 'Study', '#43e97b', '📚');

-- Verify both users' categories exist (admin view)
SELECT user_id, name, color FROM public.categories ORDER BY user_id, name;
-- Expected: 4 rows (2 for each user)

-- ============================================
-- TEST 2: Insert Prompts for Both Users
-- ============================================

-- Get category IDs
SELECT id, user_id, name FROM public.categories ORDER BY user_id;

-- Insert prompts for user1 (replace CATEGORY_ID_1 with actual ID)
INSERT INTO public.prompts (user_id, title, content, category_id, is_favorite) VALUES
  ('USER1_UUID', 'Code Review Prompt', 'Review this code and suggest improvements', 'CATEGORY_ID_1', TRUE),
  ('USER1_UUID', 'Debug Helper', 'Help me debug this error', 'CATEGORY_ID_1', FALSE);

-- Insert prompts for user2
INSERT INTO public.prompts (user_id, title, content, category_id) VALUES
  ('USER2_UUID', 'Learn Python', 'Teach me Python basics', 'CATEGORY_ID_3', FALSE),
  ('USER2_UUID', 'SQL Query Help', 'Help me write a SQL query', 'CATEGORY_ID_4', TRUE);

-- Verify all prompts (admin view)
SELECT user_id, title, is_favorite FROM public.prompts ORDER BY user_id, title;
-- Expected: 4 rows (2 for each user)

-- ============================================
-- TEST 3: Verify RLS - SELECT Isolation
-- ============================================

-- As admin, you can see all data
-- But users should only see their own data

-- Simulate user1 query (will only work with proper auth context)
-- In extension, this happens automatically via supabase.auth.getUser()

-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'prompts';
-- Expected: rowsecurity = TRUE

-- Check policies exist
SELECT policyname FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'prompts';
-- Expected: 4 policies (view, insert, update, delete)

-- ============================================
-- TEST 4: Try Cross-User Access (Should Fail)
-- ============================================

-- This test simulates what happens when user2 tries to access user1's data
-- Note: This will work as admin but WILL FAIL with authenticated user context

-- Try to insert prompt with wrong user_id
-- (This should fail when executed with user2's JWT token)
BEGIN;
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claim.sub = 'USER2_UUID';
  
  -- This INSERT should FAIL because user2 is trying to insert for user1
  INSERT INTO public.prompts (user_id, title, content) VALUES
    ('USER1_UUID', 'Hacked Prompt', 'This should fail RLS check');
ROLLBACK;
-- Expected: Error - "new row violates row-level security policy"

-- ============================================
-- TEST 5: Portfolio RLS
-- ============================================

-- Insert portfolio data for both users
INSERT INTO public.portfolio (user_id, symbol, quantity, avg_price, current_price) VALUES
  ('USER1_UUID', 'VNM', 100, 85000, 87000),
  ('USER1_UUID', 'VIC', 50, 120000, 125000),
  ('USER2_UUID', 'FPT', 200, 45000, 47000),
  ('USER2_UUID', 'HPG', 150, 28000, 29000);

-- Verify admin can see all
SELECT user_id, symbol, quantity, avg_price FROM public.portfolio ORDER BY user_id, symbol;
-- Expected: 4 rows

-- Simulate user1 query (should only see VNM and VIC)
SELECT symbol, quantity FROM public.portfolio WHERE user_id = 'USER1_UUID';
-- Expected: 2 rows (VNM, VIC)

-- ============================================
-- TEST 6: Chat History with Prompt Link
-- ============================================

-- Get a prompt_id from user1
SELECT id FROM public.prompts WHERE user_id = 'USER1_UUID' LIMIT 1;

-- Insert chat history for user1 (replace PROMPT_ID_1)
INSERT INTO public.chat_history (user_id, chat_id, prompt, response, prompt_id, timestamp) VALUES
  ('USER1_UUID', 'chat-123', 'Review my code', 'Here are my suggestions...', 'PROMPT_ID_1', EXTRACT(EPOCH FROM NOW()) * 1000);

-- Verify foreign key link works
SELECT 
  ch.chat_id,
  ch.prompt,
  p.title as prompt_template_title
FROM public.chat_history ch
LEFT JOIN public.prompts p ON ch.prompt_id = p.id
WHERE ch.user_id = 'USER1_UUID';
-- Expected: 1 row with prompt_template_title populated

-- ============================================
-- TEST 7: Settings JSONB
-- ============================================

-- Insert settings for both users
INSERT INTO public.settings (user_id, config) VALUES
  ('USER1_UUID', '{"theme": "dark", "language": "en", "autoRun": true}'),
  ('USER2_UUID', '{"theme": "light", "language": "vi", "autoRun": false}');

-- Query JSONB fields
SELECT 
  user_id,
  config->>'theme' as theme,
  config->>'language' as language,
  config->>'autoRun' as auto_run
FROM public.settings;
-- Expected: 2 rows with parsed JSONB values

-- Update JSONB field
UPDATE public.settings 
SET config = jsonb_set(config, '{theme}', '"blue"')
WHERE user_id = 'USER1_UUID';

-- Verify update
SELECT config->>'theme' as theme FROM public.settings WHERE user_id = 'USER1_UUID';
-- Expected: 'blue'

-- ============================================
-- TEST 8: Error Tracking
-- ============================================

-- Insert errors for user1
INSERT INTO public.errors (user_id, title, description, severity, type, timestamp, resolved) VALUES
  ('USER1_UUID', 'API Timeout', 'ChatGPT API timed out after 30s', 'high', 'timeout', EXTRACT(EPOCH FROM NOW()) * 1000, FALSE),
  ('USER1_UUID', 'Invalid Prompt', 'Prompt was rejected by ChatGPT', 'warning', 'prompt', EXTRACT(EPOCH FROM NOW()) * 1000, TRUE);

-- Query unresolved errors (uses index)
SELECT title, severity, type FROM public.errors 
WHERE user_id = 'USER1_UUID' AND resolved = FALSE
ORDER BY timestamp DESC;
-- Expected: 1 row (API Timeout)

-- Mark error as resolved
UPDATE public.errors 
SET resolved = TRUE, 
    resolution_notes = 'Increased timeout to 60s',
    resolved_at = NOW()
WHERE user_id = 'USER1_UUID' AND title = 'API Timeout';

-- ============================================
-- TEST 9: Performance - Favorites Index
-- ============================================

-- This query uses idx_prompts_favorite index
EXPLAIN ANALYZE
SELECT title, content FROM public.prompts 
WHERE user_id = 'USER1_UUID' AND is_favorite = TRUE;
-- Check execution plan - should use "Index Scan" on idx_prompts_favorite

-- ============================================
-- TEST 10: Cascade Delete
-- ============================================

-- Test cascade delete (WARNING: Deletes data!)
-- Uncomment to test

-- BEGIN;
--   -- Delete user1's category
--   DELETE FROM public.categories WHERE user_id = 'USER1_UUID' AND name = 'Work';
--   
--   -- Verify prompts in that category now have NULL category_id (ON DELETE SET NULL)
--   SELECT title, category_id FROM public.prompts WHERE user_id = 'USER1_UUID';
--   -- Expected: category_id is NULL for prompts that were in 'Work' category
-- ROLLBACK;

-- ============================================
-- TEST 11: Unique Constraints
-- ============================================

-- Try to insert duplicate category name for same user (should fail)
BEGIN;
  INSERT INTO public.categories (user_id, name, color) VALUES
    ('USER1_UUID', 'Work', '#000000');
  -- Expected: Error - "duplicate key value violates unique constraint"
ROLLBACK;

-- Try to insert duplicate symbol in portfolio (should fail)
BEGIN;
  INSERT INTO public.portfolio (user_id, symbol, quantity, avg_price) VALUES
    ('USER1_UUID', 'VNM', 50, 90000);
  -- Expected: Error - "duplicate key value violates unique constraint"
ROLLBACK;

-- ============================================
-- TEST 12: Triggers - Auto updated_at
-- ============================================

-- Get current updated_at
SELECT title, updated_at FROM public.prompts WHERE user_id = 'USER1_UUID' LIMIT 1;

-- Wait 2 seconds, then update
SELECT pg_sleep(2);

UPDATE public.prompts 
SET content = 'Updated content'
WHERE user_id = 'USER1_UUID' AND title = 'Code Review Prompt';

-- Verify updated_at changed
SELECT title, updated_at FROM public.prompts WHERE user_id = 'USER1_UUID' AND title = 'Code Review Prompt';
-- Expected: updated_at is newer than before

-- ============================================
-- CLEANUP: Remove Test Data
-- ============================================

-- Uncomment to clean up test data
-- DELETE FROM public.chat_history WHERE user_id IN ('USER1_UUID', 'USER2_UUID');
-- DELETE FROM public.portfolio WHERE user_id IN ('USER1_UUID', 'USER2_UUID');
-- DELETE FROM public.errors WHERE user_id IN ('USER1_UUID', 'USER2_UUID');
-- DELETE FROM public.settings WHERE user_id IN ('USER1_UUID', 'USER2_UUID');
-- DELETE FROM public.prompts WHERE user_id IN ('USER1_UUID', 'USER2_UUID');
-- DELETE FROM public.categories WHERE user_id IN ('USER1_UUID', 'USER2_UUID');

-- Delete test users (do this in Supabase Dashboard → Authentication → Users)

-- ============================================
-- SUMMARY
-- ============================================

-- Run this to see summary of all data
SELECT 
  'categories' as table_name, 
  COUNT(*) as row_count,
  COUNT(DISTINCT user_id) as user_count
FROM public.categories
UNION ALL
SELECT 'prompts', COUNT(*), COUNT(DISTINCT user_id) FROM public.prompts
UNION ALL
SELECT 'chat_history', COUNT(*), COUNT(DISTINCT user_id) FROM public.chat_history
UNION ALL
SELECT 'portfolio', COUNT(*), COUNT(DISTINCT user_id) FROM public.portfolio
UNION ALL
SELECT 'errors', COUNT(*), COUNT(DISTINCT user_id) FROM public.errors
UNION ALL
SELECT 'settings', COUNT(*), COUNT(DISTINCT user_id) FROM public.settings
UNION ALL
SELECT 'runs', COUNT(*), COUNT(DISTINCT user_id) FROM public.runs
ORDER BY table_name;

-- Expected: Each table shows counts and number of distinct users

-- ============================================
-- END OF TEST SCRIPT
-- ============================================
