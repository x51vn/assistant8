-- ============================================
-- Fix prompts unique constraint for upsert compatibility
-- Date: 2026-02-05
-- Issue: Partial unique index doesn't work with Supabase JS upsert()
-- ============================================

-- Drop the partial unique index
DROP INDEX IF EXISTS public.idx_prompts_user_key;

-- Create a proper UNIQUE CONSTRAINT (not partial index)
-- This allows Supabase JS .upsert() to work correctly with onConflict
ALTER TABLE public.prompts
ADD CONSTRAINT prompts_user_key_unique UNIQUE (user_id, key);

-- Explanation:
-- Supabase JS .upsert() with onConflict: 'user_id,key' requires a unique constraint
-- Partial indexes (with WHERE clause) are not recognized by the upsert conflict resolution
-- A full unique constraint ensures data integrity and allows upsert to work

-- Note: This means key column CANNOT be NULL for system prompts
-- All system prompts must have a key (which is the intended behavior)

-- ============================================
-- Verification Query
-- ============================================
-- Verify constraint exists:
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.prompts'::regclass AND conname = 'prompts_user_key_unique';
