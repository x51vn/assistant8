# GPT-021 Background portfolio prices update handler

## Project Context (MUST READ)
Background middleware định kỳ (alarms) hoặc manual trigger sẽ update current_price cho portfolio items của user trong Supabase. UI không fetch SSI trực tiếp cho persistence.

## Timebox
2–4 giờ.

## Goal
Implement handler `PORTFOLIO_UPDATE_PRICES` theo kiến trúc.

## Inputs
- GPT-020 fetchStockPricesBatch
- Schema portfolio (current_price, updated_at)
- MESSAGE_TYPES portfolio prices

## Requirements
1. Handler flow:
   - requireAuth → load portfolio symbols của user
   - call batch fetch prices
   - upsert/update current_price + updated_at
   - return { updatedCount, prices }
2. Tolerate missing price (null): keep old price hoặc set null (chọn phổ biến: keep old, không overwrite).
3. Rate limit protection via batching.

## SOLID Notes
- SRP: handler chỉ orchestration; price fetch ở module riêng.

## Acceptance Criteria
- Calling handler updates DB rows.

## DoD
- Unit tests for: no items, some failures.

## Test Plan
- Unit tests (mock supabase + mock fetcher).
- Manual: UI refresh prices button.

## Dependencies
- GPT-018, GPT-020

## Risks
- Running outside market hours: next ticket will gate via alarms.
