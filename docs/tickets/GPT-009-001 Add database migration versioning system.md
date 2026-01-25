DONE

# GPT-009-001 Add database migration versioning system

## Project Context (MUST READ)
Currently have single migration file (001_initial_schema.sql). Future schema changes need proper versioning and rollback capability.

## Parent Ticket
GPT-009 (Supabase SQL schema + RLS pack)

## Priority
P2 (Should-have for production - enables safe schema evolution)

## Timebox
1 hour

## Goal
Implement migration tracking table and version management system for database schema changes.

## Inputs
- supabase/migrations/001_initial_schema.sql
- Standard migration tools (Flyway, Liquibase patterns)

## Requirements
1. Create `schema_migrations` table
2. Track applied migrations with timestamps
3. Add migration version to each .sql file
4. Create migration template
5. Document migration workflow

## Recommended Implementation

**Schema Migrations Table**:
```sql
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  checksum TEXT, -- MD5 hash of migration file
  execution_time_ms INTEGER
);

COMMENT ON TABLE public.schema_migrations IS 'Tracks applied database migrations';
```

**Migration File Template** (`supabase/migrations/template.sql`):
```sql
-- ============================================
-- Migration: [DESCRIPTION]
-- Version: [VERSION_NUMBER]
-- Date: [DATE]
-- Author: [NAME]
-- ============================================

-- Prerequisites:
-- - Migration [PREVIOUS_VERSION] must be applied

-- Forward Migration
BEGIN;

-- Your schema changes here
-- ALTER TABLE ...
-- CREATE INDEX ...

-- Record migration
INSERT INTO public.schema_migrations (version, description, checksum)
VALUES ('[VERSION]', '[DESCRIPTION]', '[CHECKSUM]');

COMMIT;

-- ============================================
-- Rollback (if needed)
-- ============================================
-- BEGIN;
-- -- Undo your changes
-- DELETE FROM public.schema_migrations WHERE version = '[VERSION]';
-- COMMIT;
```

**Example Migration** (`002_add_prompt_tags.sql`):
```sql
-- ============================================
-- Migration: Add tags array to prompts table
-- Version: 002
-- Date: 2026-01-24
-- ============================================

BEGIN;

-- Add tags column
ALTER TABLE public.prompts 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add GIN index for array search
CREATE INDEX IF NOT EXISTS idx_prompts_tags 
ON public.prompts USING GIN (tags);

-- Record migration
INSERT INTO public.schema_migrations (version, description)
VALUES ('002', 'Add tags array to prompts table')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Rollback:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_prompts_tags;
-- ALTER TABLE public.prompts DROP COLUMN IF EXISTS tags;
-- DELETE FROM public.schema_migrations WHERE version = '002';
-- COMMIT;
```

**Helper Functions**:
```sql
-- Check which migrations are applied
CREATE OR REPLACE FUNCTION public.get_applied_migrations()
RETURNS TABLE (version TEXT, description TEXT, applied_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT sm.version, sm.description, sm.applied_at
  FROM public.schema_migrations sm
  ORDER BY sm.version;
END;
$$ LANGUAGE plpgsql;

-- Check if migration is applied
CREATE OR REPLACE FUNCTION public.is_migration_applied(p_version TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.schema_migrations WHERE version = p_version
  );
END;
$$ LANGUAGE plpgsql;
```

## Acceptance Criteria
- `schema_migrations` table created
- 001_initial_schema.sql updated to record itself
- Migration template documented
- Helper functions work
- Example migration (002) runs successfully

## DoD
- Apply updated 001_initial_schema.sql
- Test: INSERT into schema_migrations
- Test: Create and apply 002_add_prompt_tags.sql
- Documentation updated in README

## Dependencies
None (can be applied after GPT-009)

## Risks
Low - additive change, doesn't affect existing data

## Notes
- Consider using Supabase CLI migrations (automatic tracking)
- This is manual alternative for teams without CLI access
- Checksum validation prevents running modified migrations
