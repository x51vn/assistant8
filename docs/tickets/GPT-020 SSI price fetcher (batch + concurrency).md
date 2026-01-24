DONE

# GPT-020 SSI price fetcher (batch + concurrency)

## Project Context (MUST READ)
Portfolio prices lấy từ SSI iBoard API. Kiến trúc yêu cầu batch operations, tránh rate limiting, có fallback khi API fail. Background cập nhật giá vào Supabase.

## Timebox
2–4 giờ.

## Goal
Tạo module fetch giá SSI theo batch, giới hạn concurrency + timeout.

## Inputs
- src/market-data/* (existing clients)
- docs/ARCHITECTURE.md (SSI strategy)

## Requirements
1. Implement function `fetchStockPricesBatch(symbols)`:
   - concurrency limit (ví dụ 5)
   - delay giữa batches (ví dụ 1s)
   - timeout per request
   - returns map { SYMBOL: price|null }
2. Do not crash entire batch if one symbol fails.
3. Log minimal + correlationId.

## SOLID Notes
- SRP: market data provider module riêng.
- OCP: provider interface cho SSI/others.

## Acceptance Criteria
- Với list symbols, function trả đủ keys.
- Fail 1 symbol không fail all.

## DoD
- Unit tests cho batching + error tolerance.

## Test Plan
- Unit tests (mock fetch).

## Dependencies
- GPT-001

## Risks
- CORS/host_permissions: cần đảm bảo manifest cho SSI domains.
