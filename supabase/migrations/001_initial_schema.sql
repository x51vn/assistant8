-- ============================================
-- ChatGPT Assistant - Database Schema Setup
-- Version: 1.0
-- Date: January 23, 2026
-- Ticket: GPT-009 (Supabase SQL schema + RLS pack)
-- ============================================

-- This script creates the complete database schema for ChatGPT Assistant
-- including tables, indexes, and Row Level Security (RLS) policies.
--
-- IMPORTANT:
-- - Run this script in Supabase SQL Editor
-- - Script is idempotent (uses IF NOT EXISTS where possible)
-- - Requires Supabase Auth to be enabled
-- - All tables have user_id and RLS policies for multi-user isolation
--
-- Tables Created:
-- 1. users - User profiles (optional, managed by Supabase Auth)
-- 2. prompts - Prompt templates library
-- 3. categories - Categories/Tags for prompts
-- 4. chat_history - ChatGPT conversation history
-- 5. portfolio - Stock portfolio tracking
-- 6. errors - Error retrospective tracking
-- 7. settings - User settings (JSONB)
-- 8. runs - Execution tracking

-- ============================================
-- 1. USERS TABLE (Optional - for extended profile)
-- ============================================
-- Note: Supabase Auth manages auth.users automatically
-- This table is for additional profile data

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Extended user profile data (optional)';

-- ============================================
-- 2. CATEGORIES TABLE
-- ============================================
-- Must be created before prompts (foreign key dependency)

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT, -- hex color code (e.g., #667eea)
  icon TEXT, -- emoji or icon name (e.g., 📁, fas fa-folder)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: each user can't have duplicate category names
  CONSTRAINT unique_category_per_user UNIQUE(user_id, name)
);

COMMENT ON TABLE public.categories IS 'Categories/Tags for organizing prompts';
COMMENT ON COLUMN public.categories.color IS 'Hex color code for category badge';
COMMENT ON COLUMN public.categories.icon IS 'Emoji or Font Awesome icon identifier';

-- ============================================
-- 3. PROMPTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  is_favorite BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  tags TEXT[], -- Array of tag strings for flexible tagging
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT content_not_empty CHECK (LENGTH(TRIM(content)) > 0),
  CONSTRAINT usage_count_non_negative CHECK (usage_count >= 0)
);

COMMENT ON TABLE public.prompts IS 'User prompt templates library';
COMMENT ON COLUMN public.prompts.usage_count IS 'Number of times this prompt has been used';
COMMENT ON COLUMN public.prompts.tags IS 'Flexible array of tag strings';

-- ============================================
-- 4. CHAT_HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL, -- ChatGPT conversation ID
  chat_url TEXT, -- Full URL to ChatGPT conversation
  prompt TEXT NOT NULL,
  response TEXT, -- ChatGPT response
  prompt_id UUID REFERENCES public.prompts(id) ON DELETE SET NULL, -- Link to template if used
  timestamp BIGINT NOT NULL, -- Unix timestamp in milliseconds
  run_id TEXT, -- Execution run identifier
  metadata JSONB, -- Additional metadata (model, tokens, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: each user + chat_id combination is unique
  CONSTRAINT unique_chat_per_user UNIQUE(user_id, chat_id)
);

COMMENT ON TABLE public.chat_history IS 'ChatGPT conversation history';
COMMENT ON COLUMN public.chat_history.timestamp IS 'Unix timestamp in milliseconds';
COMMENT ON COLUMN public.chat_history.metadata IS 'Additional data like model version, token count, etc.';

-- ============================================
-- 5. PORTFOLIO TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL, -- Stock symbol (e.g., VNM, VIC)
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  avg_price DECIMAL(15, 2) NOT NULL, -- Average purchase price
  current_price DECIMAL(15, 2), -- Current market price (updated periodically)
  notes TEXT, -- User notes about this position
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: each user can have only one entry per symbol
  CONSTRAINT unique_symbol_per_user UNIQUE(user_id, symbol)
);

COMMENT ON TABLE public.portfolio IS 'User stock portfolio holdings';
COMMENT ON COLUMN public.portfolio.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN public.portfolio.avg_price IS 'Average purchase price per share';
COMMENT ON COLUMN public.portfolio.current_price IS 'Current market price (updated by alarms)';

-- ============================================
-- 6. ERRORS TABLE (Retrospective)
-- ============================================

CREATE TABLE IF NOT EXISTS public.errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'warning', 'info')),
  type TEXT NOT NULL CHECK (type IN ('general', 'prompt', 'response', 'connection', 'timeout')),
  timestamp BIGINT NOT NULL, -- Unix timestamp in milliseconds
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT, -- How the error was resolved
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ, -- When the error was marked as resolved
  
  CONSTRAINT title_not_empty CHECK (LENGTH(TRIM(title)) > 0)
);

COMMENT ON TABLE public.errors IS 'Error tracking and retrospective';
COMMENT ON COLUMN public.errors.severity IS 'Error severity level';
COMMENT ON COLUMN public.errors.type IS 'Category of error';
COMMENT ON COLUMN public.errors.timestamp IS 'Unix timestamp when error occurred';

-- ============================================
-- 7. SETTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.settings IS 'User settings stored as JSONB';
COMMENT ON COLUMN public.settings.config IS 'Flexible settings object (prompts, intervals, flags, etc.)';

-- ============================================
-- 8. RUNS TABLE (Execution Tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL, -- Unique run identifier
  status TEXT, -- running, completed, failed, cancelled
  metadata JSONB, -- Run-specific data
  timestamp BIGINT NOT NULL, -- Unix timestamp in milliseconds
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT run_id_not_empty CHECK (LENGTH(TRIM(run_id)) > 0)
);

COMMENT ON TABLE public.runs IS 'Execution run tracking';
COMMENT ON COLUMN public.runs.run_id IS 'Unique identifier for this execution';
COMMENT ON COLUMN public.runs.metadata IS 'Run-specific data like input params, output summary, etc.';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Prompts
CREATE INDEX IF NOT EXISTS idx_prompts_user ON public.prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON public.prompts(category_id);
CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON public.prompts(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX IF NOT EXISTS idx_prompts_updated ON public.prompts(user_id, updated_at DESC);

-- Categories
CREATE INDEX IF NOT EXISTS idx_categories_user ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON public.categories(user_id, name);

-- Chat History
CREATE INDEX IF NOT EXISTS idx_chat_history_user_timestamp ON public.chat_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_prompt ON public.chat_history(prompt_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_run ON public.chat_history(user_id, run_id);

-- Portfolio
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON public.portfolio(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON public.portfolio(user_id, symbol);

-- Errors
CREATE INDEX IF NOT EXISTS idx_errors_user_timestamp ON public.errors(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_errors_unresolved ON public.errors(user_id, resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_errors_severity ON public.errors(user_id, severity);

-- Settings
-- No additional indexes needed (primary key on user_id is sufficient)

-- Runs
CREATE INDEX IF NOT EXISTS idx_runs_user_timestamp ON public.runs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON public.runs(user_id, status);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - USERS TABLE
-- ============================================

CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- RLS POLICIES - PROMPTS TABLE
-- ============================================

CREATE POLICY "Users can view own prompts"
  ON public.prompts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prompts"
  ON public.prompts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prompts"
  ON public.prompts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prompts"
  ON public.prompts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - CATEGORIES TABLE
-- ============================================

CREATE POLICY "Users can view own categories"
  ON public.categories
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON public.categories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON public.categories
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON public.categories
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - CHAT_HISTORY TABLE
-- ============================================

CREATE POLICY "Users can view own chat_history"
  ON public.chat_history
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat_history"
  ON public.chat_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat_history"
  ON public.chat_history
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat_history"
  ON public.chat_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - PORTFOLIO TABLE
-- ============================================

CREATE POLICY "Users can view own portfolio"
  ON public.portfolio
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolio"
  ON public.portfolio
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolio"
  ON public.portfolio
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolio"
  ON public.portfolio
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - ERRORS TABLE
-- ============================================

CREATE POLICY "Users can view own errors"
  ON public.errors
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own errors"
  ON public.errors
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own errors"
  ON public.errors
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own errors"
  ON public.errors
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - SETTINGS TABLE
-- ============================================

CREATE POLICY "Users can view own settings"
  ON public.settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON public.settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.settings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON public.settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - RUNS TABLE
-- ============================================

CREATE POLICY "Users can view own runs"
  ON public.runs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own runs"
  ON public.runs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own runs"
  ON public.runs
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own runs"
  ON public.runs
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS (Optional - for auto-updated_at)
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_prompts
  BEFORE UPDATE ON public.prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_categories
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_portfolio
  BEFORE UPDATE ON public.portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_settings
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these queries after applying the script to verify setup:

-- 1. Check all tables exist
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name IN 
-- ('users', 'prompts', 'categories', 'chat_history', 'portfolio', 'errors', 'settings', 'runs');

-- 2. Check RLS is enabled
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('users', 'prompts', 'categories', 'chat_history', 'portfolio', 'errors', 'settings', 'runs');

-- 3. Check policies exist (should see 4 policies per table for SELECT/INSERT/UPDATE/DELETE)
-- SELECT schemaname, tablename, policyname 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, policyname;

-- 4. Check indexes
-- SELECT tablename, indexname 
-- FROM pg_indexes 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, indexname;

-- ============================================
-- CLEANUP (Use with caution!)
-- ============================================

-- To drop all tables and start fresh (WARNING: Deletes all data!):
-- DROP TABLE IF EXISTS public.runs CASCADE;
-- DROP TABLE IF EXISTS public.settings CASCADE;
-- DROP TABLE IF EXISTS public.errors CASCADE;
-- DROP TABLE IF EXISTS public.portfolio CASCADE;
-- DROP TABLE IF EXISTS public.chat_history CASCADE;
-- DROP TABLE IF EXISTS public.prompts CASCADE;
-- DROP TABLE IF EXISTS public.categories CASCADE;
-- DROP TABLE IF EXISTS public.users CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

-- ============================================
-- END OF SCHEMA SETUP
-- ============================================
