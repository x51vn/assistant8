# GPT-001-005 Document storage keys transition plan

## Project Context (MUST READ)
Audit section 2 list chi tiết các chrome.storage.local keys hiện tại (portfolio, chatHistory, errorList, settings keys). Cần document transition plan để dev biết key nào sẽ bị xóa khi nào.

## Parent Ticket
GPT-001 (Baseline audit & Architecture-Code mapping)

## Timebox
30 phút - 1 giờ.

## Goal
Create docs/STORAGE_MIGRATION_PLAN.md với chi tiết keys transition.

## Inputs
- docs/GPT-001-AUDIT-REPORT.md section 2
- docs/STORAGE_EXPLAINED.md

## Requirements
1. Create STORAGE_MIGRATION_PLAN.md:
   ```markdown
   # Storage Keys Migration Plan
   
   ## Current Keys (Will Be Removed)
   | Key | Handler | UI Module | Removal Ticket |
   |-----|---------|-----------|----------------|
   | portfolio | portfolio.js | portfolio.js | GPT-026 |
   | chatHistory | history.js | history.js | GPT-026 |
   | errorList | errors.js | errors.js | GPT-026 |
   | stockEvalPrompt | portfolio.js | settings.js | GPT-026 |
   | portfolioPromptKey | - | portfolio.js | GPT-026 |
   
   ## Target Keys (After Migration)
   | Key | Purpose |
   |-----|---------|
   | sb-{project}-auth-token | Supabase auth (managed by SDK) |
   | migration_completed | One-time flag |
   
   ## Migration Flow
   1. GPT-026: Read old keys → Bulk insert Supabase → Backup JSON → Clear
   2. Post-migration: Only auth token remains
   ```

## SOLID Notes
N/A (documentation).

## Acceptance Criteria
- Document exists với full key mapping.

## DoD
- Referenced in migration tickets (GPT-026/027).

## Test Plan
- Review by team.

## Dependencies
- None (planning doc).

## Risks
- None.
