-- ============================================
-- Watchlist: Deduplicate + Enforce Unique(user_id, symbol)
-- Version: 1.0
-- Description:
--   The original migration 012 attempted to add unique_symbol_per_user but
--   may have failed on databases with pre-existing duplicate (user_id, symbol)
--   rows. This migration:
--     1. Removes duplicate rows (keeps newest per user_id+symbol based on created_at)
--     2. Re-creates the UNIQUE constraint if it doesn't exist
--   Bug: PGRST116 "JSON object requested, multiple (or no) rows returned"
-- ============================================

-- Step 1: Delete duplicate watchlist rows, keeping the newest per (user_id, symbol)
-- Uses DISTINCT ON to pick the "keeper" row (latest created_at, then largest id).
-- All other rows for the same (user_id, symbol) are deleted.
WITH keepers AS (
  SELECT DISTINCT ON (user_id, symbol) id AS keep_id
  FROM public.watchlist
  ORDER BY user_id, symbol, created_at DESC, id DESC
)
DELETE FROM public.watchlist
WHERE id NOT IN (SELECT keep_id FROM keepers);

-- Step 2: Add unique constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_symbol_per_user'
  ) THEN
    ALTER TABLE public.watchlist
      ADD CONSTRAINT unique_symbol_per_user UNIQUE (user_id, symbol);
    RAISE NOTICE 'Created unique_symbol_per_user constraint';
  ELSE
    RAISE NOTICE 'unique_symbol_per_user constraint already exists';
  END IF;
END $$;
