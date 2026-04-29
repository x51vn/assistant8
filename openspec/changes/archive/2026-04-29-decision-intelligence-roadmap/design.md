## Context

ChatGPT extension hiện có nền Data Layer mạnh: portfolio, watchlist, market assessment, trade journal, checklist, và hệ message contract chuẩn hóa. Tuy nhiên lớp quyết định vẫn phân tán ở nhiều màn hình, người dùng phải tự tổng hợp dữ liệu và dễ lặp lại lỗi hành vi.

Change này thiết kế chuỗi tiến hóa từ Data Layer -> Insight Layer -> Decision Layer -> Automation Layer, ưu tiên triển khai theo phase để giảm rủi ro và đo được hiệu quả sớm.

Ràng buộc chính:
- MV3 service worker stateless, mọi quyết định phải dựa vào dữ liệu Supabase hoặc payload request.
- Toàn bộ user data lưu Supabase với RLS theo user_id.
- Message contracts cần bám chuẩn io-contract-layer-standardization.
- Guardrails không được tạo false block cao gây giảm trải nghiệm.

## Goals / Non-Goals

**Goals:**
- Thiết lập Decision Intelligence Scoring v1 theo rule-based engine (không ML ở phase đầu).
- Sinh Journal-to-Playbook insights định kỳ và trả về đề xuất hành vi rõ ràng.
- Áp Pre-Trade Guardrails trước khi xác nhận entry để chặn lỗi kỷ luật quan trọng.
- Chuẩn hóa Explainable Research Card output với confidence + evidence for/against.
- Cung cấp Automation Hub v1 dạng trigger-condition-action với cơ chế an toàn và audit log.
- Đo KPI vận hành: repeated-error rate, 30-day win-rate delta, rule adherence, insight adoption.

**Non-Goals:**
- Không triển khai mô hình ML huấn luyện online trong change này.
- Không triển khai collaborative realtime editing cho Team/Advisor mode.
- Không tự động thực thi giao dịch broker; chỉ hỗ trợ cảnh báo/gợi ý.
- Không thay đổi kiến trúc auth hoặc chuyển nền tảng dữ liệu.

## Decisions

1. Decision scoring dùng rule engine có trọng số cấu hình
- Quyết định: dùng rule-based weighted score với output `decisionScore`, `grade`, `blockingReasons`, `advice`.
- Lý do: dễ giải thích, kiểm thử được, rollout nhanh và an toàn hơn ML.
- Thay thế đã cân nhắc:
  - ML scoring sớm: độ chính xác tiềm năng cao hơn nhưng thiếu dữ liệu sạch và khó giải thích.
  - Heuristic cứng không trọng số: đơn giản nhưng khó mở rộng và calibration.

2. Guardrails tách thành 2 mức: hard-block và soft-warn
- Quyết định: các lỗi critical (thiếu stoploss, risk vượt ngưỡng, regime OFF + policy strict) là hard-block; phần còn lại là soft warning.
- Lý do: giảm trade sai nguyên tắc nhưng tránh chặn quá mức.
- Thay thế đã cân nhắc: single-level blocking, nhưng gây UX cứng và khó adoption.

3. Playbook insights xây theo pipeline batch + cache theo user
- Quyết định: nightly/periodic job tổng hợp journal thành `playbook_insights` + snapshot dashboard.
- Lý do: giảm tải query runtime, ổn định hiệu năng trên side panel.
- Thay thế đã cân nhắc: tính realtime mỗi lần mở dashboard; chi phí cao và latency lớn.

4. Research card chuẩn JSON schema có trường giải thích bắt buộc
- Quyết định: enforce fields `thesis`, `confidence`, `supportingEvidence[]`, `counterEvidence[]`, `invalidConditions[]`, `sources[]`.
- Lý do: tăng trust calibration và giảm hành vi tin mù quáng.
- Thay thế đã cân nhắc: giữ output text tự do; khó validate và khó so sánh chất lượng.

5. Automation Hub v1 theo sandbox action set
- Quyết định: chỉ cho phép action an toàn (notify, create task, suggest review, queue prompt), không action hủy/sửa dữ liệu tự động ở phase đầu.
- Lý do: kiểm soát rủi ro tự động hóa sai và audit dễ hơn.
- Thay thế đã cân nhắc: full action engine ngay; rủi ro cao và khó rollback.

6. Phased rollout với feature flags
- Quyết định: rollout theo Phase A/B/C với cờ tính năng theo user cohort.
- Lý do: giảm blast radius, đo KPI theo giai đoạn và rollback nhanh.
- Thay thế đã cân nhắc: big-bang release; rủi ro vận hành cao.

## Risks / Trade-offs

- [Guardrails chặn sai] -> Dùng shadow mode 1-2 tuần, log block reasons, điều chỉnh threshold trước khi hard-enable.
- [Score thiếu tin cậy giai đoạn đầu] -> Public rubric, hiển thị breakdown điểm theo rule để người dùng kiểm chứng.
- [Insight nhiễu/khó áp dụng] -> Chỉ xuất top 3 insight có confidence cao, thêm feedback loop helpful/not-helpful.
- [Automation tạo thông báo quá nhiều] -> Rate limit theo rule + dedup key + quiet hours.
- [Tăng độ phức tạp message contracts] -> Mọi message mới phải khai báo trong MessageContractRegistry + ValidatorEngine tests.
- [Data model phình to] -> Thiết kế retention policy cho execution logs và snapshots.

## Migration Plan

1. Phase A: thêm schema và handler cho guardrails + playbook snapshots; chạy shadow mode scoring.
2. Bật decision score widget + guardrail soft warnings cho cohort nhỏ.
3. Nâng lên hard-block cho critical checks sau khi tỷ lệ false-positive dưới ngưỡng.
4. Phase B: phát hành Explainable Research Card 2.0 và insight dashboard mở rộng.
5. Phase C: phát hành Automation Hub v1 với action sandbox và audit logs.
6. Rollback strategy: feature-flag off theo capability; giữ dữ liệu lịch sử nhưng ngừng evaluation jobs.

## Open Questions

- Ngưỡng risk mặc định theo hồ sơ user sẽ lấy từ settings hiện có hay tạo profile risk mới?
- Regime OFF có luôn hard-block hay cho phép override theo strategy tag?
- Chu kỳ cập nhật playbook tối ưu là ngày, tuần, hay hybrid theo activity?
- KPI adoption đo theo click-through hay theo thay đổi hành vi thực sự trong 30 ngày?
- Khi automation và alert cùng kích hoạt, thứ tự ưu tiên thông báo được xác định như thế nào?
