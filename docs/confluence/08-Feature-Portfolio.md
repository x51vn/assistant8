# Feature: Portfolio (Stocks)

## 1) Mục tiêu

- Lưu danh mục cổ phiếu của user (Supabase table `portfolio`).
- Tự động cập nhật giá hiện tại định kỳ (market hours).
- Hỗ trợ evaluation prompt → lấy response từ ChatGPT → lưu vào history (tuỳ flow UI).

## 2) Data model

Supabase table: `public.portfolio` (migration 001)
- `symbol` (unique per user)
- `quantity` (int > 0)
- `avg_price` (decimal)
- `current_price` (decimal, có thể null)
- `notes`

## 3) Background handlers

File: `src/background/handlers/portfolio.js`

### 3.1 Get all
- Request: `PORTFOLIO_GET`
- Response: `PORTFOLIO_DATA` với `{ success, items }`

### 3.2 Add
- Request: `PORTFOLIO_ADD` với `{ symbol, quantity, avgPrice, notes }`
- Normalize `symbol` uppercase.
- Unique constraint per user → duplicate map thành message “đã có trong danh mục”.

### 3.3 Update
- Request: `PORTFOLIO_UPDATE` với `{ symbol|id, updates }`
- FIX-3: ưu tiên update theo `symbol` để tránh UUID type error.
- Support both camelCase/snake_case:
  - `updates.avgPrice` hoặc `updates.avg_price`
  - `updates.currentPrice` hoặc `updates.current_price`

### 3.4 Remove
- Request: `PORTFOLIO_REMOVE` với `{ symbol|id }`
- FIX-3: ưu tiên delete theo `symbol`.

### 3.5 Update prices
- Request: `PORTFOLIO_UPDATE_PRICES`
- Flow:
  1. query `portfolio` lấy list symbols
  2. fetch batch prices từ SSI (`fetchStockPricesBatch`)
  3. upsert back `current_price` theo `id`

Response: `PORTFOLIO_PRICES_UPDATED` với `{ updated, failed, prices }`.

## 4) Alarms & market hours

- Background setup tạo alarm CHECK mỗi 5 phút.
- Alarm handler (`src/background/handlers/alarms.js`) chỉ chạy update prices trong giờ thị trường VN (9:00–15:00).

## 5) Market data providers

- SSI endpoint: `https://iboard-query.ssi.com.vn/*`
- VPS endpoint: `https://bgapidatafeed.vps.com.vn/*`

Provider registry và client nằm trong `src/market-data/*`.

## 6) UI flows (high level)

- UI gọi CRUD qua message types.
- Khi user bấm “Cập nhật giá”: gọi `PORTFOLIO_UPDATE_PRICES`.
- Khi user bấm “Đánh giá/Phân tích”: UI chuẩn bị prompt template và dùng prompt sending flow (xem module Prompt/ChatGPT).
