# Supabase Database (Schema, RLS, Triggers)

## 1) Tổng quan

Database nằm trên Supabase Postgres, mọi dữ liệu người dùng đều có `user_id` và áp dụng **Row Level Security (RLS)** để đảm bảo isolation.

Migrations hiện có trong `supabase/migrations/`:

- `001_initial_schema.sql`
  - Tables: `users`, `categories`, `prompts`, `chat_history`, `portfolio`, `errors`, `settings`, `runs`
  - Indexes và RLS policies chuẩn (SELECT/INSERT/UPDATE/DELETE cho mỗi table)
  - Function `handle_updated_at()` + triggers cập nhật `updated_at` cho một số tables

- `002_fix_chat_id_nullable.sql`
  - Điều chỉnh `chat_history.chat_id` có thể nullable và unique index chỉ áp dụng khi `chat_id` != NULL.

- `003_create_assets_tables.sql`
  - Tables: `assets`, `asset_history`
  - Constraint asset_type ban đầu chưa có `debt`.

- `004_asset_summaries_triggers.sql`
  - Table `asset_summaries` (precomputed totals)
  - Triggers recalculation khi portfolio/assets thay đổi

- `005_add_debt_type.sql`
  - Bổ sung `asset_type='debt'` vào constraint của `assets`.

- `006_create_english_table.sql`
  - Table `english` cho English learning module + RLS.

## 2) Core tables

### 2.1 `portfolio`
- Mục đích: holdings chứng khoán của user
- Fields nổi bật:
  - `symbol` (unique per user)
  - `quantity`, `avg_price`, `current_price`
  - `notes`

### 2.2 `chat_history`
- Mục đích: lưu prompt/response và metadata liên quan tới ChatGPT
- Fields:
  - `chat_id`, `chat_url`
  - `prompt`, `response`
  - `prompt_id` (optional link tới `prompts` table)
  - `timestamp` (ms)
  - `run_id` và `metadata` JSONB

### 2.3 `errors`
- Mục đích: retrospective tracking
- Fields:
  - `severity`: critical/high/warning/info
  - `type`: general/prompt/response/connection/timeout
  - `resolved`, `resolution_notes`, `resolved_at`
  - `timestamp` (ms)

### 2.4 `settings`
- Mục đích: cấu hình dạng JSONB
- Primary key: `user_id`
- Field `config` (JSONB) lưu:
  - prompt templates (`config.prompts.*`), flags, intervals...

### 2.5 `assets`
- Mục đích: quản lý tài sản (và liabilities)
- Fields:
  - `asset_type`: cash/savings/real_estate/crypto/gold/vehicle/other/debt
  - `quantity`, `unit_price`, `current_value`
  - `currency` (default VND)
  - `liquidity`, `risk_level`
  - metadata: `institution`, `account_number`, `maturity_date`, `interest_rate`, `location`, `notes`
  - `is_active`

**Debt/liability**:
- `asset_type='debt'` dùng để biểu diễn khoản nợ.
- Ở layer app: net worth tính theo `assets - debts` (xem module Net Worth).

### 2.6 `asset_history`
- Snapshot theo ngày:
  - `snapshot_date`, `total_value`, `breakdown` JSONB

### 2.7 `asset_summaries` (precomputed totals)
- Precompute để đọc nhanh ở UI:
  - `total_portfolio`, `total_assets`, `total_net_worth`
  - `portfolio_breakdown` JSONB, `assets_breakdown` JSONB
  - `last_portfolio_update`, `last_assets_update`

- Trigger-driven recalculation:
  - Khi `portfolio` insert/update/delete → `recalculate_portfolio_summary(user_id)`
  - Khi `assets` insert/update/delete → `recalculate_assets_summary(user_id)`

Lưu ý: logic `total_net_worth` trong trigger là `portfolio + assets` (chưa trừ `debt`). Ở runtime app có thể override/derive theo nhu cầu UI.

### 2.8 `english`
- Mục đích: lưu record cho English learning module
- Dedupe key: unique `(user_id, chat_id)` để upsert.

## 3) RLS (Row Level Security)

Mọi table chính bật RLS và có policies dạng:
- SELECT: `USING (auth.uid() = user_id)`
- INSERT: `WITH CHECK (auth.uid() = user_id)`
- UPDATE/DELETE: `USING (auth.uid() = user_id)`

Điều này đảm bảo:
- User chỉ nhìn/sửa dữ liệu của mình.

## 4) Triggers & functions

- `001_initial_schema.sql` tạo `public.handle_updated_at()` và triggers cho:
  - users, prompts, categories, portfolio, settings

- `003_create_assets_tables.sql` tạo `update_assets_updated_at()` và trigger riêng cho `assets`.

- `006_create_english_table.sql` tạo trigger cập nhật `updated_at` (nếu function tồn tại).

## 5) Service role grants

- `004_asset_summaries_triggers.sql` grant execute cho `service_role`:
  - `recalculate_portfolio_summary(UUID)`
  - `recalculate_assets_summary(UUID)`

## 6) Setup checklist (DB)

- Apply migrations theo thứ tự.
- Ensure RLS enabled cho tất cả tables.
- Verify constraints:
  - `assets.asset_type` có `debt`.
  - `english` unique `(user_id, chat_id)`.
