-- ============================================
-- ChatGPT Assistant - Fix errors schema
-- Date: 2026-02-01
--
-- Align Supabase schema with current UI/handlers:
-- - severity levels: low/medium/high/critical
-- - optional details payload (JSONB)
-- ============================================

-- Add details column (used by src/background/handlers/errorTracking.js)
ALTER TABLE public.errors
ADD COLUMN IF NOT EXISTS details JSONB;

-- Map legacy severities (from early schema) to the current set
UPDATE public.errors
SET severity = CASE
	WHEN severity = 'warning' THEN 'medium'
	WHEN severity = 'info' THEN 'low'
	ELSE severity
END
WHERE severity IN ('warning', 'info');

-- Update severity constraint to match UI
ALTER TABLE public.errors
DROP CONSTRAINT IF EXISTS errors_severity_check;

ALTER TABLE public.errors
ADD CONSTRAINT errors_severity_check
CHECK (severity IN ('low', 'medium', 'high', 'critical'));

COMMENT ON COLUMN public.errors.details IS 'Optional structured details for debugging/retrospective (JSONB)';
