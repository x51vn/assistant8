-- ============================================
-- Fix chat_id nullable constraint
-- Date: January 24, 2026
-- Issue: Content script not ready → no chat_id → database error
-- Solution: Allow chat_id to be NULL initially (can be updated later)
-- ============================================

-- Drop the NOT NULL constraint on chat_id
ALTER TABLE public.chat_history 
  ALTER COLUMN chat_id DROP NOT NULL;

-- Drop the unique constraint that requires chat_id
ALTER TABLE public.chat_history 
  DROP CONSTRAINT IF EXISTS unique_chat_per_user;

-- Add new unique constraint that allows NULL chat_id
-- (NULL values are considered distinct in UNIQUE constraints)
-- Multiple NULL chat_ids per user are allowed
CREATE UNIQUE INDEX IF NOT EXISTS unique_chat_per_user_non_null 
  ON public.chat_history (user_id, chat_id) 
  WHERE chat_id IS NOT NULL;

COMMENT ON INDEX public.unique_chat_per_user_non_null IS 
  'Ensures unique chat_id per user, but allows multiple NULL chat_ids';

-- Update comments
COMMENT ON COLUMN public.chat_history.chat_id IS 
  'ChatGPT conversation ID (nullable if content script not ready at time of save)';
