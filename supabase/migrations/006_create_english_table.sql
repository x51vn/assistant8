-- ============================================
-- ChatGPT Assistant - English Learning Table
-- Version: 1.0
-- Date: 2026-02-01
--
-- Purpose:
-- - Persist English learning records created from the English module
-- - Supports upsert conflict target: (user_id, chat_id)
--
-- Notes:
-- - This table is referenced by src/background/handlers/english.js
-- - RLS enforced: auth.uid() = user_id
-- ============================================

CREATE TABLE IF NOT EXISTS public.english (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_english_chat_per_user UNIQUE(user_id, chat_id),
  CONSTRAINT topic_not_empty CHECK (LENGTH(TRIM(topic)) > 0),
  CONSTRAINT prompt_not_empty CHECK (LENGTH(TRIM(prompt)) > 0)
);

COMMENT ON TABLE public.english IS 'English learning records (topic + prompt) linked to ChatGPT chat_id';
COMMENT ON COLUMN public.english.chat_id IS 'ChatGPT conversation ID used as stable dedupe key per user';

CREATE INDEX IF NOT EXISTS idx_english_user_created_at ON public.english(user_id, created_at DESC);

ALTER TABLE public.english ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own english"
  ON public.english
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own english"
  ON public.english
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own english"
  ON public.english
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own english"
  ON public.english
  FOR DELETE
  USING (auth.uid() = user_id);

-- Keep updated_at current (function created in 001_initial_schema.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'handle_updated_at'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_updated_at_english'
    ) THEN
      CREATE TRIGGER set_updated_at_english
        BEFORE UPDATE ON public.english
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
  END IF;
END $$;
