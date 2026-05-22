## Why

Extension hiện đã có lớp dữ liệu và theo dõi giao dịch, nhưng giá trị quyết định vẫn chủ yếu nằm ở việc hiển thị thông tin. Người dùng cần một hệ thống giúp ra quyết định có kỷ luật, giảm lỗi hành vi lặp lại, và chuyển dữ liệu journal thành hành động cụ thể theo ngữ cảnh thị trường.

## What Changes

- Introduce Decision Intelligence Layer để chấm điểm tín hiệu vào lệnh dựa trên checklist, market regime, và lịch sử lỗi cá nhân.
- Add Journal-to-Playbook Engine để tự động trích xuất pattern thắng/thua, lỗi lặp lại, và gợi ý playbook cá nhân hóa.
- Add Pre-Trade Guardrails để kiểm tra bắt buộc trước khi xác nhận entry (risk per trade, stoploss, regime, checklist threshold).
- Add Explainable AI Research Card 2.0 (lightweight phase) với confidence, bằng chứng ủng hộ/phản biện, và điều kiện invalid thesis.
- Add Automation Hub v1 cho rule-based workflows theo ngữ cảnh (regime change, target reached, checklist exit readiness).
- Define phased delivery plan:
  - Phase A (4-6 tuần): Guardrails + Playbook v1
  - Phase B (3-4 tuần): Explainable Research + dashboard insights nâng cao
  - Phase C (6-8 tuần): Automation Hub v1
- Defer Team/Advisor Mode as a future extension after core decision pipeline ổn định và đo được KPI nền.

## Capabilities

### New Capabilities
- `decision-intelligence-scoring`: Chấm điểm tín hiệu giao dịch bằng rule-based model từ checklist, market regime, và historical mistakes.
- `journal-playbook-insights`: Trích xuất insight từ journal để tạo playbook cá nhân và gợi ý cải thiện kỷ luật.
- `pre-trade-guardrails`: Áp các cổng kiểm tra bắt buộc trước khi mở vị thế để giảm trade sai quy tắc.
- `explainable-research-card`: Chuẩn hóa research output với confidence, evidence for/against, và invalidation conditions.
- `automation-hub-workflows`: Kịch bản bán tự động dựa trên trigger thị trường, trạng thái vị thế, và checklist.

### Modified Capabilities
- `journal-metrics`: Mở rộng metrics để hỗ trợ KPI decision intelligence (rule adherence trend, repeated mistakes, recent discipline score).
- `trade-journal-crud`: Bổ sung field/flow cần thiết để lưu guardrail checks, decision score snapshot, và playbook feedback metadata.

## Impact

- Affected background handlers: journal, market assessment, watchlist/portfolio analysis, alerts, and new decision automation handlers.
- Affected UI/API modules: journalApi, checklistApi, marketAssessmentApi, writing/research presentation layers, dashboard widgets.
- Supabase impact: thêm bảng/materialized views phục vụ scoring, playbook insights, automation rules, execution logs.
- Messaging contracts impact: bổ sung message types, request/response contracts, validation schemas theo chuẩn io-contract-layer-standardization.
- Risk areas: false-positive guardrails, trust calibration for AI confidence, workflow safety/idempotency, and KPI instrumentation quality.
