DONE

# GPT-013 UI Prompts library page

## Project Context (MUST READ)
UI side panel cung cấp prompt templates (CRUD, search, favorite) theo user. Mọi thao tác qua background middleware. Không lưu prompts locally.

## Timebox
2–4 giờ.

## Goal
Tạo UI cho prompt library.

## Inputs
- src/ui/*
- MESSAGE_TYPES prompts/categories

## Requirements
1. UI list prompts (title + snippet + category + favorite).
2. Search input (debounce 300ms) gọi PROMPT_SEARCH.
3. Create/edit modal: title, category dropdown, content.
4. Favorite toggle.
5. Optional: usage_count display.

## SOLID Notes
- SRP: prompts UI module.

## Acceptance Criteria
- CRUD + search + favorite hoạt động.

## DoD
- XSS safe rendering (escape HTML).

## Test Plan
- Playwright: create prompt, search, toggle favorite.

## Dependencies
- GPT-010, GPT-011, GPT-012

## Risks
- UI large file; keep changes contained.
