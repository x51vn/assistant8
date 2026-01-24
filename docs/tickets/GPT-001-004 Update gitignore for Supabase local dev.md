DONE

# GPT-001-004 Update gitignore for Supabase local dev

## Project Context (MUST READ)
Project chuyển sang Supabase. Cần ensure .gitignore không commit sensitive data (.env, Supabase local state nếu dùng).

## Parent Ticket
GPT-001 (Baseline audit & Architecture-Code mapping)

## Timebox
15 phút.

## Goal
Update .gitignore với Supabase-related entries.

## Inputs
- .gitignore hiện tại

## Requirements
1. Add to .gitignore:
   ```
   # Supabase
   .env
   .env.local
   supabase/.branches
   supabase/.temp
   
   # Keep if exists (already there?)
   node_modules/
   dist/
   ```
2. Verify .env đã được ignore.

## SOLID Notes
N/A (config).

## Acceptance Criteria
- .env không thể commit (test với `git add .env`).

## DoD
- .gitignore updated.

## Test Plan
- Create dummy .env và verify git status không show.

## Dependencies
- None (housekeeping).

## Risks
- None.
