# Yêu cầu phát triển: Lưu kết quả đánh giá thị trường hằng ngày (chạy thủ công)

**Ngày**: 2026-03-03  
**Owner**: ChatGPT Extension  
**Phạm vi**: Lưu và hiển thị kết quả đánh giá thị trường theo ngày, chạy thủ công bằng 1 prompt (LLM trả JSON).

---

## 1) Rà soát hiện trạng hệ thống

### 1.1 Luồng hiện tại

- Nút `Run Prompt` hiện gọi `SEND_PROMPT` để gửi prompt text sang LLM:
  - `src/ui-preact/pages/PortfolioPage.jsx` (`handleRunPrompt`)
  - `src/background/handlers/llm.js` (`SEND_PROMPT`)
- Kết quả hiện chỉ lưu trong `chat_history` dạng text tự do.
- Chưa có dữ liệu có cấu trúc để:
  - lưu kết quả đánh giá thị trường theo ngày
  - truy vết lịch sử theo ngành và theo mã

### 1.2 Năng lực có sẵn có thể tái sử dụng

- Parser JSON robust: `src/shared/llm/parseJsonResponse.js`.
- Pattern validator output: `src/shared/validators/stockResearchOutputValidator.js`.
- Pattern chạy nền + parse + persist: `src/background/handlers/watchlistEnrich.js`.
- Hệ thống prompt key trong `public.prompts`:
  - `src/shared/allPrompts.js`
  - `src/background/handlers/prompts.js`

### 1.3 Khoảng trống cần bổ sung

- Chưa có output contract chuẩn cho market assessment.
- Chưa có parser/validator chuyên biệt.
- Chưa có schema DB tối ưu cho:
  - lịch sử theo `symbol`
  - lịch sử theo `sector`
  - biểu đồ regime theo ngày
- Chưa có trang UI riêng để hiển thị dữ liệu market assessment.

---

## 2) Mục tiêu nghiệp vụ

1. Lưu kết quả đánh giá thị trường theo ngày, chạy thủ công.
2. Lưu dữ liệu theo mô hình **trải phẳng theo symbol**:
  - 1 record = 1 mã (`symbol`)
  - trong record có đủ: market regime, ngành, điểm và giải thích
3. Theo dõi được lịch sử:
  - regime score (0-100)
  - ngành
  - mã cổ phiếu
4. Có cơ chế danh mục ngành do người dùng nhập để ràng buộc phân loại khi cần.

---

## 3) Phạm vi MVP và non-goals

### 3.1 MVP scope

- Trigger bằng 1 nút, không có form nhập input lúc chạy.
- Input duy nhất để gửi LLM là 1 prompt đã cấu hình sẵn.
- LLM trả JSON theo contract (records trải phẳng theo symbol).
- Parse/validate và lưu DB bằng **1 bảng chính** `market_assessment`.
- Có 1 bảng `sectors` để người dùng nhập danh sách ngành.
- Tạo **trang mới** để chạy và xem kết quả (không gắn vào trang Portfolio).

### 3.2 Non-goals

- Không auto trading.
- Không auto schedule trong MVP.
- Không backfill toàn bộ `chat_history` cũ.

---

## 4) Yêu cầu chức năng

### FR-01: Manual run không cần input người dùng

- Người dùng chỉ bấm nút `Chạy đánh giá thị trường` trên **trang mới**.
- Không có input date/ngành/mã trên UI khi chạy.
- Prompt gửi đi lấy từ system prompt đã lưu: `prompt.marketDailyAssessment`.
- Hệ thống tự gắn metadata nội bộ:
  - `as_of_date` = ngày chạy
  - `run_id`, `correlation_id`

### FR-02: Prompt template cho Market Daily Assessment

- Thêm prompt key: `prompt.marketDailyAssessment`.
- Prompt yêu cầu LLM:
  - Chỉ trả JSON object hợp lệ
  - Không markdown, không text ngoài JSON
  - Trả danh sách `records` theo symbol (trải phẳng)
- Số lượng mã trong 1 lần chạy:
  - MVP mặc định: 10 mã và tập trung trong 2 ngành (do người dùng quy định trong prompt)

### FR-03: JSON output contract (trải phẳng theo symbol)

```json
{
  "as_of_date": "YYYY-MM-DD",
  "records": [
    {
      "symbol": "VCB",
      "sector_name": "Ngân hàng",

      "market_regime_state": "ON|OFF",
      "market_regime_score": 72,
      "market_regime_explanation": "string",

      "sector_score": 75,
      "sector_trend": "UP|NEUTRAL|DOWN",
      "sector_explanation": "string",

      "symbol_score": 80,
      "action": "BUY|HOLD|SELL|WATCH",
      "symbol_explanation": "string"
    }
  ]
}
```

- Rule bắt buộc:
  - `records.length == 10`
  - `symbol` không trùng nhau
  - `COUNT(DISTINCT sector_name) == 2` (MVP)
  - tất cả score trong [0..100]
  - mỗi record bắt buộc có:
    - market regime (state/score/explanation)
    - `sector_name`
    - đánh giá ngành (sector_score/trend/explanation)
    - đánh giá mã (symbol_score/action/symbol_explanation)

### FR-04: Parsing, validation, retry correction

- Tạo validator riêng: `marketAssessmentOutputValidator`.
- Parser dùng `parseJsonResponse` để xử lý noise/code fence.
- Strict mode:
  - Sai schema => fail run
  - Retry 1 lần bằng corrective prompt (nhắc lại JSON-only + field thiếu/sai)
- Luôn lưu `raw_output` để audit/debug khi cần.

### FR-05: Data model database (1 bảng chính + 1 bảng sectors)

#### 1) Bảng `market_assessment` (bảng chính, 1 row / 1 symbol)

- `id` UUID PK
- `user_id` UUID FK auth.users
- `run_id` text
- `as_of_date` date
- `symbol` text
- `sector_name` text
- `market_regime_state` text (`ON|OFF`)
- `market_regime_score` int (0..100)
- `market_regime_explanation` text
- `sector_score` int (0..100)
- `sector_trend` text (`UP|NEUTRAL|DOWN`)
- `sector_explanation` text
- `symbol_score` int (0..100)
- `action` text (`BUY|HOLD|SELL|WATCH`)
- `symbol_explanation` text
- `classification_mode` text (`AUTO|CONSTRAINED`)
- `provider` text
- `raw_record` jsonb
- `created_at`, `updated_at`

Constraints/indexes:
- Unique để tránh duplicate: `(user_id, run_id, symbol)`
- Index:
  - `(user_id, as_of_date desc)`
  - `(user_id, symbol, as_of_date desc)`
  - `(user_id, sector_name, as_of_date desc)`
- Bật RLS đầy đủ.

Ghi chú query:
- Biểu đồ regime theo ngày: lấy DISTINCT theo `(user_id, run_id)` hoặc GROUP BY `as_of_date` (vì regime bị lặp lại trên 10 records).

#### 2) Bảng `sectors` (danh sách ngành do người dùng nhập)

- `id` UUID PK
- `user_id` UUID FK auth.users
- `sector_name` text
- `is_active` boolean default true
- `created_at`, `updated_at`

Constraints/indexes:
- Unique theo user: `(user_id, sector_name)`
- Index:
  - `(user_id, is_active)`
- Bật RLS đầy đủ.

### FR-06: Quy tắc phân loại theo bảng `sectors`

- **Case A - Bảng `sectors` rỗng (hoặc không có ngành active)**:
  - `classification_mode = AUTO`
  - LLM được phép trả `sector_name` tự do.
- **Case B - Bảng `sectors` có dữ liệu active**:
  - `classification_mode = CONSTRAINED`
  - Mỗi `sector_name` trong output bắt buộc nằm trong tập ngành active của user.
  - Nếu có 1 record có `sector_name` không hợp lệ => fail validation toàn run, không persist partial.

### FR-07: Message/API contract cho feature mới

- Thêm message types:
  - `MARKET_ASSESSMENT_RUN`
  - `MARKET_ASSESSMENT_STATUS`
  - `MARKET_ASSESSMENT_DONE`
  - `MARKET_ASSESSMENT_FAILED`
  - `MARKET_ASSESSMENT_GET_HISTORY`
  - `MARKET_ASSESSMENT_HISTORY_DATA`
  - `MARKET_ASSESSMENT_GET_DETAIL`
  - `MARKET_ASSESSMENT_DETAIL_DATA`
  - `SECTORS_GET`
  - `SECTORS_UPSERT`
  - `SECTORS_DELETE`

- Background handlers đề xuất:
  - `src/background/handlers/marketAssessment.js`
  - `src/background/handlers/sectors.js`

### FR-08: UI hiển thị và quản lý (tạo trang mới)

1. Trang mới
- Tạo page mới, ví dụ: `Market` / `Thị trường` (đặt id navigation riêng).
- Trang này chứa:
  - nút chạy manual
  - latest card
  - regime chart
  - history theo sector/symbol

2. Trigger run (trên trang mới)
- 1 nút `Chạy đánh giá thị trường`.
- Không có input form.

3. Hiển thị dữ liệu đánh giá
- Latest card:
  - regime state/score + giải thích
  - tóm tắt top/bottom theo `symbol_score`
- Regime history chart:
  - line chart 0-100 theo ngày
  - zone ON/OFF
- Symbol history view:
  - filter theo `symbol`
- Sector history view:
  - filter theo `sector_name`

4. Quản lý danh sách ngành
- Thêm UI CRUD cho bảng `sectors` (đặt ở Settings hoặc ngay trên trang Market).
- UI phải hiển thị mode:
  - `AUTO` khi list rỗng
  - `CONSTRAINED` khi có ngành active

### FR-09: Logging và observability

- Log theo `correlationId/runId`.
- Không log full prompt/full response trong production.
- Telemetry tối thiểu:
  - parse strategy
  - validation errors
  - persist timing
  - `classification_mode`

---

## 5) Yêu cầu phi chức năng

- Reliability:
  - Không ảnh hưởng flow watchlist enrich hiện tại.
  - Lưu run fail để truy vết.
- Performance:
  - Query chart 90 ngày < 1s với index đề xuất.
- Security:
  - RLS đầy đủ cho `market_assessment` và `sectors`.
- Maintainability:
  - Tách validator riêng, không parse inline ở UI.

---

## 6) Task breakdown triển khai

### Phase 1: Prompt + output contract

1. Thêm `prompt.marketDailyAssessment` vào:
  - `src/shared/systemPrompts.js`
  - `src/shared/allPrompts.js`
2. Viết default prompt theo output contract trải phẳng.
3. Tạo spec: `docs/specs/market-assessment-message-schema.md`.

### Phase 2: Message + backend pipeline

1. Bổ sung `MESSAGE_TYPES` cho market assessment và sectors CRUD.
2. Tạo handler/service parse/validate/persist (1 run => persist 10 rows).
3. Áp dụng rule `AUTO/CONSTRAINED` theo bảng `sectors`.
4. Retry correction khi output sai format.

### Phase 3: Database

1. Tạo migration:
  - `market_assessment`
  - `sectors`
2. Tạo constraints/indexes/RLS.
3. Tạo query helper:
  - latest theo ngày
  - history theo symbol
  - history theo sector
  - regime time-series (distinct run_id / group by date)

### Phase 4: UI (trang mới)

1. Thêm page mới + navigation entry.
2. Thêm nút manual run + latest card + regime chart + history views.
3. Thêm UI quản lý `sectors` (Settings hoặc Market page).

### Phase 5: Test và quality gate

1. Unit test parser/validator:
  - valid JSON records
  - code fence JSON
  - duplicate symbol
  - invalid sector trong mode CONSTRAINED
2. Integration test:
  - persist 10 rows vào `market_assessment`
  - fail run khi sector không hợp lệ (mode CONSTRAINED)
3. Manual E2E:
  - sectors rỗng => mode AUTO
  - sectors có dữ liệu => mode CONSTRAINED
  - chart và history hiển thị đúng

---

## 7) Tiêu chí nghiệm thu

1. User bấm chạy thủ công trên trang mới, không cần nhập input.
2. Mỗi run thành công lưu đúng 10 records vào `market_assessment` (1 symbol/1 row).
  - 10 records phải thuộc đúng 2 `sector_name` (MVP).
3. Mỗi row trong `market_assessment` có đủ:
  - regime fields + explanation
  - sector fields + explanation
  - symbol fields + explanation
4. Khi `sectors` rỗng:
  - run vẫn thành công với `classification_mode = AUTO`.
5. Khi `sectors` có dữ liệu active:
  - tất cả records phải có `sector_name` nằm trong tập sectors active
  - nếu sai => run `failed`, không persist partial.
6. UI hiển thị được:
  - regime chart 0-100 theo ngày
  - history theo sector
  - history theo symbol

---

## 8) Mở rộng sau MVP (optional)

1. Auto-run theo lịch.
2. Export CSV lịch sử đánh giá.
3. Dashboard KPI cho độ ổn định regime và sector rotation.

---

## 9) Quyết định thiết kế quan trọng

- Chuẩn hóa data model về 1 bảng chính `market_assessment` theo symbol để đơn giản query/triển khai.
- Tách riêng bảng `sectors` để user cấu hình ranh giới phân loại khi cần.
- Dùng 2 chế độ phân loại:
  - `AUTO` (sectors rỗng)
  - `CONSTRAINED` (sectors có dữ liệu)
