# Requirements: Facts → Signals → Decisions (System Upgrade v2)

**Date**: 2026-03-04  
**Owner**: ChatGPT Extension  
**Status**: Draft  
**Scope**: Decision-support for Vietnamese stock investors (fast + accurate)

---

## 0) Executive Summary

Mục tiêu của đợt nâng cấp này là chuẩn hoá hệ thống thành 3 lớp rõ ràng:

1. **Facts**: Dữ liệu “có nguồn + thời điểm” (timestamp + provenance) là nền cho mọi phân tích.
2. **Signals**: Tính toán deterministic/rules từ Facts (không dùng LLM), có thể test được.
3. **Decisions**: LLM diễn giải/xếp hạng theo schema, bắt buộc “grounded” vào Facts/Sources.

Trọng tâm triển khai:

- Chuyển **cập nhật giá watchlist** sang **background fetch** để **alerts always-on** (không phụ thuộc UI mở/đóng).
- **Inject market snapshot** (Facts) vào Market Assessment và Stock Research để giảm hallucination, tăng nhất quán.
- **Siết validator**: bắt buộc `sourcesUsed` + ràng buộc logic `entry/stop/target` theo `recommendation`.

---

## 1) Background / Current Gaps

### 1.1 Hiện trạng (rút gọn)

- Watchlist price:
  - UI sidepanel mở Watchlist → polling 60s, fetch giá từ providers → persist vào Supabase.
  - Background alarm 5 phút chỉ đọc DB rồi broadcast + check alerts (DB có thể stale nếu UI đóng).
- Stock Research:
  - Pipeline 7 bước có search + LLM output JSON + persist.
  - Output validator hiện chưa ép “grounding” chặt (nguồn được dùng) và chưa kiểm tra logic entry/target/stop.
- Market Daily Assessment:
  - LLM trả JSON records; có validator output; chưa có market snapshot facts “đính kèm” để tăng độ chính xác.

### 1.2 Tác hại

- Alerts không “always-on” vì dữ liệu giá không được background cập nhật chủ động.
- LLM có thể:
  - đưa kết luận không bám dữ liệu mới nhất,
  - đưa `sources`/URLs không nằm trong danh sách nguồn được cung cấp,
  - đưa entry/target/stop không hợp lý so với recommendation.

---

## 2) Definitions

### 2.1 Facts

Facts là dữ liệu đầu vào đã “đóng dấu”:

- `value` + `asOf` (timestamp)
- `source` (provider name / endpoint / URL)
- `confidence` hoặc `quality` (tuỳ loại facts)

Ví dụ Facts:

- `PriceFact`: giá theo symbol từ provider (VPS/SSI), kèm `asOf`.
- `MarketSnapshotFact`: chỉ số (VNINDEX, VN30, HNX), breadth, volume… kèm `asOf`.
- `SearchSourceFact`: danh sách nguồn (title/url/snippet/publishedAt) từ Google search step.

### 2.2 Signals

Signals là kết quả tính toán deterministic từ Facts, ví dụ:

- `ediff`, `pprofit` trong watchlist
- risk/reward ratio
- “entry validity band” so với current price
- regime zone classification dựa trên điểm (nếu có)

### 2.3 Decisions

Decisions là output do LLM tạo ra, **theo schema**, và **phải grounded**:

- Chỉ được dùng nguồn trong Facts (search sources) → `sourcesUsed` là subset hợp lệ.
- Logic entry/target/stop phải tuân thủ rules theo recommendation.

---

## 3) Goals & Non-Goals

### 3.1 Goals

- G1. Alerts watchlist hoạt động “always-on” trong market hours, kể cả khi UI đóng.
- G2. Stock Research và Market Assessment giảm hallucination bằng market snapshot facts.
- G3. Output AI được chuẩn hoá và kiểm tra chặt trước khi lưu/hiển thị:
  - `sourcesUsed` bắt buộc và hợp lệ,
  - `entry/target/stop` hợp logic theo `recommendation`.
- G4. Kiến trúc 3 lớp giúp dễ mở rộng, test, và quan sát (observability).

### 3.2 Non-Goals (đợt này)

- Không triển khai auto-trading.
- Không tối ưu UI/UX lớn (ngoài thay đổi cần thiết do thay đổi data flow).
- Không bắt buộc chuyển toàn bộ pipeline sang API-based providers (giữ web/DOM mode).

---

## 4) Architecture Requirements (Facts → Signals → Decisions)

### 4.1 Nguyên tắc bắt buộc

- A1. Mọi quyết định LLM (Decisions) phải có đầu vào là Facts (không “phán” từ không khí).
- A2. Mọi phép tính có thể deterministic phải nằm ở Signals (không giao cho LLM).
- A3. Decisions phải trả structured JSON theo contract, có validator.
- A4. Persist luôn lưu kèm:
  - facts snapshot (hoặc reference tới facts snapshot),
  - decisions output đã validated,
  - metadata (provider, latency, correlationId, schemaVersion).

### 4.2 Data contracts (high-level)

#### FactsContext (được inject vào prompts)

```json
{
  "asOf": "2026-03-04T03:30:00.000Z",
  "marketSnapshot": { "...": "..." },
  "priceSnapshot": { "symbol": "FPT", "price": 123450, "source": "SSI", "asOf": "..." },
  "searchSources": [
    { "title": "...", "url": "...", "snippet": "...", "publishedAt": "..." }
  ]
}
```

#### DecisionCard (đề xuất áp dụng cho Stock Research v2 output)

```json
{
  "symbol": "FPT",
  "recommendation": "BUY|HOLD|SELL|WATCH",
  "confidence": 0,
  "timeHorizon": "1w|1m|1-3m|3-6m|6-12m|1y+",
  "entryPrice": 0,
  "targetPrice": 0,
  "stopLoss": 0,
  "thesis": ["..."],
  "risks": ["..."],
  "catalysts": ["..."],
  "sourcesUsed": ["https://..."]
}
```

Ghi chú:

- `sourcesUsed` là bắt buộc (đợt này).
- Field `sources` cũ (nếu có) sẽ bị deprecate dần; ưu tiên `sourcesUsed`.

---

## 5) Feature 1 — Watchlist Price Update via Background Fetch (Alerts Always-on)

### 5.1 Target Behavior

- Background service worker chạy theo alarm (mặc định 1–5 phút trong market hours) để:
  1. lấy danh sách symbol cần cập nhật từ Supabase,
  2. fetch giá mới từ market-data providers (failover),
  3. tính Signals (`ediff`, `pprofit`) từ Facts + dữ liệu watchlist (entry/target),
  4. persist watchlist prices,
  5. check và trigger `price_alerts` (Chrome notifications),
  6. broadcast update cho UI (nếu đang mở).

### 5.2 Functional Requirements

- FR-WP-01 (Always-on): Khi UI đóng, background vẫn cập nhật giá và kích hoạt alerts trong market hours.
- FR-WP-02 (Market hours): Chỉ chạy trong giờ giao dịch VN (weekday; 09:00–15:00) trừ khi user bật “extended hours” (future).
- FR-WP-03 (Batch + retry): Cập nhật theo batch, có retry/backoff cho lỗi tạm thời; không block toàn bộ batch nếu 1 symbol lỗi.
- FR-WP-04 (Provenance): Lưu `price_provider`, `price_updated_at` (hoặc equivalent) cho từng symbol.
- FR-WP-05 (Alert correctness): Alert type `above`/`below` phải trigger đúng theo giá mới.
- FR-WP-06 (change_pct baseline): Alert type `change_pct` phải hoạt động:
  - nếu `current_value` null tại lần check đầu tiên → set baseline = giá hiện tại (không trigger),
  - các lần sau so sánh với baseline như hiện tại.
- FR-WP-07 (UI flow): UI Watchlist không còn là nguồn chính để fetch giá; UI ưu tiên:
  - nghe broadcast,
  - hoặc refresh từ DB.
- FR-WP-08 (Manual refresh): Có message/action “Refresh watchlist prices now” gọi background fetch ngay (rate-limited).

### 5.3 Data / Schema Requirements

Tối thiểu cần bổ sung 2 cột cho bảng `watchlist`:

- `price_updated_at TIMESTAMPTZ NULL`
- `price_provider TEXT NULL` (ví dụ: `vps`, `ssi`)

Khuyến nghị (optional):

- `price_source JSONB` (để lưu endpoint/metadata tuỳ provider).

### 5.4 Observability

- Log structured:
  - tổng symbol, số update thành công/thất bại,
  - provider được dùng,
  - latency tổng và per-batch,
  - correlationId.
- Nếu failover provider xảy ra → log WARN kèm reason.

### 5.5 Acceptance Criteria

- AC-WP-01: Đóng sidepanel, vẫn nhận Chrome notification khi giá vượt ngưỡng alert (above/below).
- AC-WP-02: Watchlist trong DB có `price` và `price_updated_at` được cập nhật đều trong giờ giao dịch.
- AC-WP-03: `change_pct` alert hoạt động sau khi baseline được set tự động.

---

## 6) Feature 2 — Inject Market Snapshot (Facts) into Market Assessment + Stock Research

### 6.1 MarketSnapshotFact (contract)

MarketSnapshotFact phải có tối thiểu:

- `asOf` timestamp
- `indices`: VNINDEX, VN30, HNX (value/change/changePercent/volume/breadth nếu có)
- `source`: provider + endpoint (ví dụ SSI iBoard)

Ví dụ:

```json
{
  "asOf": "2026-03-04T03:30:00.000Z",
  "source": { "provider": "ssi", "endpoint": "/exchange-index/VNINDEX" },
  "indices": [
    { "symbol": "VNI", "value": 1234.56, "change": 7.89, "changePercent": 0.64 }
  ]
}
```

### 6.2 Functional Requirements

- FR-MS-01: Market Assessment khi chạy phải fetch MarketSnapshotFact và inject vào prompt (facts section).
- FR-MS-02: Stock Research pipeline phải fetch MarketSnapshotFact và inject vào analysis prompt (facts section).
- FR-MS-03: Persist:
  - Stock Research: lưu market snapshot dùng trong `stock_research_runs` (hoặc table/column tương đương).
  - Market Assessment: lưu market snapshot dùng trong `market_assessment` (hoặc table/column tương đương).
- FR-MS-04: Failure mode: nếu snapshot fetch fail thì:
  - pipeline vẫn chạy,
  - output có metadata “snapshot_missing=true”,
  - log WARN (không crash toàn run).

### 6.3 Acceptance Criteria

- AC-MS-01: Mỗi run Stock Research có lưu/trace được snapshot dùng (asOf + source).
- AC-MS-02: Market Assessment prompt có chứa snapshot facts (có thể audit trong prompt_runs / logs).

---

## 7) Feature 3 — Tighten Validators (sourcesUsed + entry/stop/target logic)

### 7.1 `sourcesUsed` requirements (Stock Research)

- FR-V-01: Output phải có `sourcesUsed` (array URLs).
- FR-V-02: `sourcesUsed` chỉ được chứa URLs nằm trong `FactsContext.searchSources[].url`.
- FR-V-03: `sourcesUsed` length giới hạn (ví dụ <= 5) để tránh noise.
- FR-V-04: Nếu vi phạm FR-V-01/02 thì:
  - strict mode: fail validation → corrective retry → nếu vẫn fail thì mark run failed.
  - non-strict mode: auto-correct (loại URLs invalid) + warning.

### 7.2 entry/target/stop logic requirements (Stock Research)

Giả định có `currentPrice` từ PriceFact (nếu không có → chỉ áp các ràng buộc nội tại).

- FR-ETS-01 (BUY): nếu `recommendation=BUY` thì bắt buộc:
  - `entryPrice`, `targetPrice`, `stopLoss` đều khác null
  - `stopLoss < entryPrice < targetPrice`
  - (optional signal) risk/reward >= 1.5
- FR-ETS-02 (SELL): nếu `recommendation=SELL` thì:
  - mặc định **không** xuất `entryPrice/targetPrice/stopLoss` (đều null) để tránh hiểu nhầm kế hoạch mua.
- FR-ETS-03 (HOLD): nếu `recommendation=HOLD` thì:
  - có thể null; nếu có đủ 3 giá thì vẫn phải thoả `stopLoss < entryPrice < targetPrice`.
- FR-ETS-04 (WATCH): có thể đưa “kế hoạch” entry/target/stop; nếu có đủ 3 giá thì phải thoả `stopLoss < entryPrice < targetPrice`.
- FR-ETS-05 (Current price sanity, optional):
  - nếu `currentPrice` có:
    - BUY: `entryPrice` không được lệch quá X% so với currentPrice (config; default 8–12%).
    - SELL: giá fields phải null (FR-ETS-02).

### 7.3 Validator API changes (implementation guidance)

Validator cần nhận thêm context để kiểm tra grounding:

- `allowedSourceUrls: string[]`
- `currentPrice?: number`
- `mode?: 'stock-research'|'watchlist-enrich'|'portfolio-eval'`

### 7.4 Acceptance Criteria

- AC-V-01: Output có URL không thuộc input sources → fail strict validation.
- AC-V-02: BUY output có stopLoss >= entryPrice → fail strict validation.
- AC-V-03: SELL output vẫn trả entry/target/stop → fail strict validation.

---

## 8) Rollout / Backward Compatibility

- R-01: Ship dưới feature flags:
  - `watchlist_background_pricing_v1`
  - `decision_contract_v2` (sourcesUsed + ETS rules)
  - `market_snapshot_injection_v1`
- R-02: Logging/telemetry bật trước để đo:
  - failure rate khi validator siết,
  - latency tăng do snapshot fetch,
  - provider error rate.
- R-03: UI giữ tương thích:
  - nếu DB chưa có cột mới → degrade gracefully (không crash).

---

## 9) Open Questions

1. Background watchlist price update nên chạy mỗi bao lâu (1 phút hay 5 phút) để cân bằng rate-limit vs “nhanh”?
2. Chuẩn “entry sanity band” theo currentPrice (X%) nên là bao nhiêu theo từng nhóm cổ phiếu (VN30 vs penny)?
3. Có cần thêm table `market_assessment_runs` để lưu run-level metadata (snapshot, regime score/state) thay vì lặp ở từng record?

