DONE

# GPT-026 Migration v1 (portfolio, history, errors, settings)

## Project Context (MUST READ)
Repo hiện có dấu hiệu lưu business data trong chrome.storage.local. Kiến trúc Supabase cloud-first yêu cầu migrate data cũ sang Supabase một lần, backup JSON trước khi clear, và chỉ giữ auth token trong chrome.storage.local.

## Timebox
2–4 giờ.

## Goal
Implement migration handler cho 4 domain chính: portfolio, chat history, errors, settings.

## Inputs
- Existing storage keys used in UI (portfolio/chatHistory/errors/settings)
- Schema Supabase

## Requirements
1. Detect old data on startup:
   - if found → emit MIGRATION_AVAILABLE (hoặc equivalent)
2. MIGRATE_LOCAL_TO_SUPABASE handler:
   - requireAuth
   - read old keys from chrome.storage.local
   - backup JSON via chrome.downloads
   - batch insert into Supabase tables with user_id
   - clear old keys (NOT clear auth token keys)
   - set migration_completed flag
3. Retry transient errors.

## SOLID Notes
- SRP: migration module riêng.

## Acceptance Criteria
- Old data appears in Supabase after migration.
- Local keys cleared (except auth token + migration flag).

## DoD
- Manual flow verified.

## Test Plan
- Manual: seed chrome.storage.local with sample data and run migration.

## Dependencies
- GPT-007, GPT-009

## Risks
- Download permission required if using chrome.downloads.
