DONE

# GPT-018 Background portfolio CRUD (Supabase)

## Project Context (MUST READ)
Portfolio là user-based data trong Supabase. Hiện code có handler dùng chrome.storage.local; kiến trúc yêu cầu chuyển sang Supabase, giữ validation và uniqueness (user_id,symbol).

## Timebox
2–4 giờ.

## Goal
Implement portfolio CRUD Supabase-backed.

## Inputs
- src/background/handlers/portfolio.js (existing)
- MESSAGE_TYPES portfolio
- Schema portfolio

## Requirements
1. Handlers:
   - PORTFOLIO_GET: list by symbol asc
   - PORTFOLIO_ADD: validate symbol/quantity/avg_price
   - PORTFOLIO_UPDATE: update quantity/avg_price/note
   - PORTFOLIO_REMOVE
2. Security: eq('user_id', userId) for updates.
3. Normalize symbol uppercase.

## SOLID Notes
- SRP: portfolio handler.

## Acceptance Criteria
- CRUD works; duplicates prevented by DB constraint.

## DoD
- Remove direct chrome.storage.local usage inside portfolio handler for business data.

## Test Plan
- Unit tests + manual UI.

## Dependencies
- GPT-003, GPT-004, GPT-005, GPT-006, GPT-009

## Risks
- Existing UI expects fields: code/entryPrice; need mapping.
