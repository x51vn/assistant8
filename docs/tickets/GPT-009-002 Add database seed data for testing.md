DONE

# GPT-009-002 Add database seed data for testing

## Project Context (MUST READ)
Empty database makes testing difficult. Need seed data (categories, sample prompts) for development and testing environments.

## Parent Ticket
GPT-009 (Supabase SQL schema + RLS pack)

## Priority
P3 (Nice-to-have for dev experience)

## Timebox
30 minutes

## Goal
Create seed data script for populating dev/test databases with sample data.

## Inputs
- supabase/migrations/001_initial_schema.sql
- Common prompt templates
- Standard stock symbols

## Requirements
1. Create seed data SQL file
2. Include sample categories
3. Include sample prompts
4. Include sample portfolio (VN stocks)
5. Make idempotent (can re-run safely)
6. Only for dev/test (not production)

## Recommended Implementation

**File**: `supabase/seed_data.sql`

```sql
-- ============================================
-- Seed Data for Development & Testing
-- ============================================
-- DO NOT RUN IN PRODUCTION!
-- This script populates database with sample data for testing

-- Get a test user (create one if needed)
-- You must create a test user first via Supabase Dashboard
-- Email: dev@test.com, Password: dev123456

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get test user ID (replace with your test user email)
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = 'dev@test.com';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Test user not found. Please create dev@test.com first.';
  END IF;
  
  -- ============================================
  -- Seed Categories
  -- ============================================
  INSERT INTO public.categories (user_id, name, color, icon) VALUES
    (v_user_id, 'Work', '#667eea', '💼'),
    (v_user_id, 'Personal', '#f093fb', '🏠'),
    (v_user_id, 'Code Review', '#4facfe', '🔍'),
    (v_user_id, 'Debug', '#ff6b6b', '🐛'),
    (v_user_id, 'Learning', '#43e97b', '📚')
  ON CONFLICT (user_id, name) DO NOTHING;
  
  RAISE NOTICE 'Seeded categories';
  
  -- ============================================
  -- Seed Prompts
  -- ============================================
  INSERT INTO public.prompts (user_id, title, content, category_id, is_favorite) VALUES
    (v_user_id, 
     'Code Review', 
     'Review the following code and suggest improvements:\n\n[PASTE CODE HERE]',
     (SELECT id FROM public.categories WHERE user_id = v_user_id AND name = 'Code Review' LIMIT 1),
     TRUE),
    
    (v_user_id,
     'Debug Helper',
     'Help me debug this error:\n\nError: [ERROR MESSAGE]\n\nCode:\n[CODE]',
     (SELECT id FROM public.categories WHERE user_id = v_user_id AND name = 'Debug' LIMIT 1),
     TRUE),
    
    (v_user_id,
     'Explain Code',
     'Explain the following code in simple terms:\n\n[CODE]',
     (SELECT id FROM public.categories WHERE user_id = v_user_id AND name = 'Learning' LIMIT 1),
     FALSE),
    
    (v_user_id,
     'SQL Query Helper',
     'Help me write a SQL query to [DESCRIPTION]',
     (SELECT id FROM public.categories WHERE user_id = v_user_id AND name = 'Work' LIMIT 1),
     FALSE),
    
    (v_user_id,
     'Translate to English',
     'Translate the following Vietnamese text to English:\n\n[TEXT]',
     (SELECT id FROM public.categories WHERE user_id = v_user_id AND name = 'Personal' LIMIT 1),
     FALSE)
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Seeded prompts';
  
  -- ============================================
  -- Seed Portfolio (Vietnam stocks)
  -- ============================================
  INSERT INTO public.portfolio (user_id, symbol, quantity, avg_price, current_price) VALUES
    (v_user_id, 'VNM', 100, 85000, 87000),
    (v_user_id, 'VIC', 50, 120000, 125000),
    (v_user_id, 'FPT', 200, 45000, 47000),
    (v_user_id, 'HPG', 150, 28000, 29000),
    (v_user_id, 'VHM', 80, 95000, 92000)
  ON CONFLICT (user_id, symbol) DO UPDATE 
  SET 
    quantity = EXCLUDED.quantity,
    avg_price = EXCLUDED.avg_price,
    current_price = EXCLUDED.current_price;
  
  RAISE NOTICE 'Seeded portfolio';
  
  -- ============================================
  -- Seed Settings
  -- ============================================
  INSERT INTO public.settings (user_id, config) VALUES
    (v_user_id, '{
      "theme": "dark",
      "language": "en",
      "autoRun": true,
      "interval": 5,
      "realtimeEnabled": true
    }'::jsonb)
  ON CONFLICT (user_id) DO UPDATE
  SET config = EXCLUDED.config;
  
  RAISE NOTICE 'Seeded settings';
  
  -- ============================================
  -- Seed Sample Errors
  -- ============================================
  INSERT INTO public.errors (user_id, title, description, severity, type, timestamp, resolved) VALUES
    (v_user_id, 
     'API Timeout',
     'ChatGPT API timed out after 30 seconds',
     'high',
     'timeout',
     EXTRACT(EPOCH FROM NOW() - INTERVAL '2 days') * 1000,
     TRUE),
    
    (v_user_id,
     'Invalid Response Format',
     'ChatGPT returned unexpected JSON structure',
     'warning',
     'response',
     EXTRACT(EPOCH FROM NOW() - INTERVAL '1 day') * 1000,
     FALSE)
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Seeded errors';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Seed data created successfully for user: %', v_user_id;
  RAISE NOTICE 'Categories: 5, Prompts: 5, Portfolio: 5 stocks, Errors: 2';
  RAISE NOTICE '========================================';
  
END $$;
```

**Usage**:

```bash
# 1. Create test user in Supabase Dashboard
# Email: dev@test.com
# Password: dev123456

# 2. Run seed script
# In Supabase SQL Editor, paste and run seed_data.sql

# 3. Verify data
SELECT 
  (SELECT COUNT(*) FROM public.categories) as categories,
  (SELECT COUNT(*) FROM public.prompts) as prompts,
  (SELECT COUNT(*) FROM public.portfolio) as portfolio_items;
```

## Test Cases
- Run seed script twice → no duplicates (idempotent)
- Login as dev@test.com → see seeded data
- Delete seeded data → re-run script → data restored

## Acceptance Criteria
- Seed script runs without errors
- Test user has sample data in all tables
- Script is idempotent (safe to re-run)
- Clear instructions in comments

## DoD
- seed_data.sql created
- Tested with dev@test.com user
- Documentation added to README
- Script commented clearly

## Dependencies
- GPT-009 (schema must exist)

## Risks
Very low - dev/test only, clearly marked

## Notes
- Never run in production (add safety check)
- Useful for onboarding new developers
- Can extend with more realistic data
- Consider adding CLI command: `npm run seed-db`
