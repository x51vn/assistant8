-- ============================================
-- Add prompt_type and is_system columns for unified prompt management
-- Date: 2026-02-05
-- Scope: Merge system prompts and writing templates into single table
-- ============================================

-- Add prompt_type column (system, writing, custom)
ALTER TABLE public.prompts
ADD COLUMN IF NOT EXISTS prompt_type TEXT DEFAULT 'custom';

-- Add is_system flag (system prompts cannot be deleted)
ALTER TABLE public.prompts
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Create index on prompt_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_prompts_type
ON public.prompts(prompt_type)
WHERE prompt_type IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.prompts.prompt_type IS 'Prompt category: system (ChatGPT system prompts), writing (Writing Assistant templates), custom (user prompts)';
COMMENT ON COLUMN public.prompts.is_system IS 'System prompts cannot be deleted by users (true for all system and writing prompts)';

-- ============================================
-- Update existing rows (if any)
-- ============================================
-- Mark existing templates as system prompts
UPDATE public.prompts
SET
  prompt_type = CASE
    WHEN key LIKE 'prompt.%' THEN 'system'
    WHEN key LIKE 'writing.%' THEN 'writing'
    ELSE 'custom'
  END,
  is_system = CASE
    WHEN key LIKE 'prompt.%' OR key LIKE 'writing.%' THEN true
    ELSE false
  END
WHERE key IS NOT NULL;

-- ============================================
-- Verification Query
-- ============================================
-- SELECT key, prompt_type, is_system, title
-- FROM public.prompts
-- WHERE is_system = true
-- ORDER BY prompt_type, key;
