# Feature: Assets & Net Worth

## 1) Mục tiêu

- Quản lý danh mục tài sản cá nhân (assets) và lịch sử snapshot.
- Tính tổng tài sản, tổng nợ (liability) và net worth.
- Hỗ trợ gold/crypto hiển thị theo quantity/unit/symbol (quantity-first).

## 2) Data model (Supabase)

Tables:
- `assets` (migration 003 + 005)
- `asset_history` (migration 003)
- `asset_summaries` (migration 004)

### 2.1 `assets` fields nổi bật
- `asset_type`:
  - `cash`, `savings`, `real_estate`, `crypto`, `gold`, `vehicle`, `other`, `debt`
- `quantity`, `unit_price`, `current_value`
- `currency` (default VND)
- `liquidity`, `risk_level`
- `institution`, `account_number`, `maturity_date`, `interest_rate`, `location`, `notes`
- `is_active`

### 2.2 Debt/liability
- `asset_type='debt'` biểu diễn khoản nợ.
- DB constraint cập nhật ở migration 005.
- App-level net worth: `totalAssets - totalDebts`.

## 3) Background handlers

### 3.1 Asset CRUD
File: `src/background/handlers/assets.js`
- `ASSETS_GET` → `ASSETS_DATA`
- `ASSET_ADD` → `ASSET_ADDED`
- `ASSET_UPDATE` → `ASSET_UPDATED`
- `ASSET_DELETE` → `ASSET_DELETED`

Input validation:
- Asset type phải nằm trong allowlist.
- Handler hỗ trợ mapping field naming linh hoạt (camelCase/snake_case) trong updates.

### 3.2 Net worth
File: `src/background/handlers/netWorth.js`
- `NET_WORTH_GET` → `NET_WORTH_DATA`

Tính toán:
- Tách assets thành 2 nhóm:
  - `totalAssets` (không bao gồm debt)
  - `totalDebts` (asset_type == debt)
- `netWorth = totalAssets - totalDebts`
- Trả breakdown theo asset_type và có thể kèm `debtBreakdown`.

### 3.3 History / snapshots
- `ASSET_HISTORY_GET` → `ASSET_HISTORY_DATA`
- `ASSET_SNAPSHOT_CREATE` → `ASSET_SNAPSHOT_CREATED`

Snapshot lưu vào `asset_history` theo ngày.

## 4) UI behavior: gold/crypto quantity-first

Các component liên quan:
- `src/ui-preact/components/AssetCard.jsx`
- `src/ui-preact/components/AssetModal.jsx`

Behavior:
- Với **gold**:
  - Hiển thị `quantity + unit` làm primary.
  - Giá trị VND hiển thị thứ cấp dạng “≈”.
  - Units hỗ trợ: `chỉ`, `lượng` (và các unit khác nếu UI cho phép).

- Với **crypto**:
  - Hiển thị quantity + symbol (vd BTC/ETH) làm primary.
  - Giá trị VND hiển thị “≈” dạng phụ.

## 5) asset_summaries precompute

- `asset_summaries` được update bởi triggers khi `portfolio`/`assets` thay đổi.
- Triggers tính `total_net_worth = total_portfolio + total_assets`.
- UI/netWorth handler có thể override net worth khi cần trừ debts.

## 6) Edge cases & consistency rules

- Service worker stateless: mọi call phải query Supabase.
- Response payload của `createResponse` không nested trong `data`.
- Khi thêm asset types mới:
  - Update DB constraint
  - Update backend allowlist validation
  - Update UI mapping/display
