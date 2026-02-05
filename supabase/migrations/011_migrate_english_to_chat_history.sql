/**
 * Migration 011: Migrate English learning data to unified chat_history table
 *
 * Purpose: Move all records from the `english` table to `chat_history` with appropriate metadata
 * This consolidates English learning records with other writing assistant records.
 */

BEGIN;

-- Insert all English records into chat_history with english_learning metadata
INSERT INTO public.chat_history (
  id,
  user_id,
  chat_id,
  chat_url,
  prompt,
  response,
  prompt_id,
  timestamp,
  metadata,
  created_at
)
SELECT
  id,
  user_id,
  chat_id,
  NULL as chat_url,
  prompt,
  NULL as response,
  NULL as prompt_id,
  EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 as timestamp,
  jsonb_build_object(
    'module', 'english_learning',
    'jobType', 'english_learning',
    'topic', topic,
    'autoSelected', false,
    'options', jsonb_build_object(
      'languageOutput', 'vi'
    )
  ) as metadata,
  created_at
FROM public.english
ON CONFLICT (user_id, chat_id) DO UPDATE
SET
  metadata = EXCLUDED.metadata,
  prompt = EXCLUDED.prompt;

COMMIT;
