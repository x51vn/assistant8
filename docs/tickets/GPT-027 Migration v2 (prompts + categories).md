DONE

# GPT-027 Migration v2 (prompts + categories)

## Project Context (MUST READ)
Sau khi thêm prompts/categories vào Supabase, nếu repo có dữ liệu templates cũ (hoặc future upgrade), cần migration tương tự. Business data không được giữ local.

## Timebox
2–4 giờ.

## Goal
Extend migration để migrate prompts + categories.

## Inputs
- Old keys if existed (prompts/categories)
- Supabase schema

## Requirements
1. Read old prompts/categories arrays.
2. Insert categories first, map category name → new id.
3. Insert prompts with mapped category_id.
4. Clear old keys after success.

## SOLID Notes
- SRP: migration logic modular (domain-specific functions).

## Acceptance Criteria
- Prompts/categories migrated and linked correctly.

## DoD
- Verified on sample dataset.

## Test Plan
- Manual with seeded data.

## Dependencies
- GPT-010, GPT-012, GPT-026

## Risks
- Category mapping collisions; handle duplicates per user.
