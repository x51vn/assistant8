-- ============================================
-- Add 'key' column to prompts table for stable template identification
-- Date: 2026-02-05
-- Scope: Writing Assistant Templates → Supabase migration
-- ============================================

-- Add 'key' column (nullable initially for existing rows)
ALTER TABLE public.prompts
ADD COLUMN IF NOT EXISTS key TEXT;

-- Create unique constraint on (user_id, key) to prevent duplicate templates
-- This allows each user to have one template per key
-- Note: Allows NULL keys for non-system prompts
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_user_key
ON public.prompts(user_id, key)
WHERE key IS NOT NULL;

-- Add index for faster lookups by key
CREATE INDEX IF NOT EXISTS idx_prompts_key
ON public.prompts(key)
WHERE key IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.prompts.key IS 'Stable key for system templates (e.g., writing.email). NULL for user-created prompts.';

-- ============================================
-- Verification Query
-- ============================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'prompts' AND column_name = 'key';
