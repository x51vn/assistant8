# Kế Hoạch Triển Khai - Nhóm Ưu Tiên Cao

## 1) Mục tiêu và phạm vi

Tài liệu này cụ thể hóa kế hoạch cho 3 hạng mục ưu tiên cao đã nêu trong `docs/CODEBASE_REVIEW_ARCHITECTURE.md`:
- Tách `messageSchema` theo domain và áp dụng versioning contract.
- Chuẩn hóa một API gateway duy nhất cho UI -> background.
- Bổ sung monitoring cho các lỗi persistence non-fatal.

Mục tiêu tổng thể:
- Giảm rủi ro mismatch contract.
- Giảm coupling UI với lớp messaging thấp.
- Tăng khả năng phát hiện lỗi dữ liệu âm thầm.

## 2) Nguyên tắc triển khai

- Không thay đổi hành vi người dùng cuối theo kiểu "big bang".
- Làm theo hướng tương thích ngược trong từng pha.
- Mỗi pha đều có tiêu chí "Definition of Done" (DoD) rõ ràng.
- Ưu tiên canary rollout nội bộ trước khi áp dụng toàn bộ.

## 3) Kế hoạch theo pha (6 tuần)

## Pha 0 - Chuẩn bị (2-3 ngày)

### Mục tiêu
Thiết lập baseline để đo hiệu quả trước/sau.

### Công việc
- Chốt danh sách message types đang dùng thực tế (UI, content, background).
- Chốt danh sách component đang gọi `chrome.runtime.sendMessage` trực tiếp.
- Chốt các điểm persistence đang bắt lỗi non-fatal.
- Thiết lập dashboard tạm (log-based) để đo:
  - Tỷ lệ lỗi theo message type.
  - Tỷ lệ persistence fail theo pipeline/feature.
  - Số lượng handler chưa có contract test.

### DoD
- Có checklist inventory đầy đủ.
- Có baseline metric trước khi refactor.

---

## Pha 1 - Tách `messageSchema` theo domain + versioning (Tuần 1-2)

### Mục tiêu
Giảm độ phình của contract, tăng khả năng kiểm soát thay đổi.

### Thiết kế đề xuất
- Tách schema thành các file domain:
  - `auth.schema.js`
  - `portfolio.schema.js`
  - `stockResearch.schema.js`
  - `settings.schema.js`
  - `system.schema.js` (ping/health/internal)
- Tạo `index` aggregator để export backward-compatible:
  - `MESSAGE_TYPES`
  - `createResponse`
  - `createErrorResponse`
- Bổ sung metadata version:
  - `domainVersion` (ví dụ: `stockResearch@1`)
  - `schemaVersion` (ví dụ: `v1`)

### Công việc chi tiết
1. Tạo module contract theo domain và map message type hiện hữu.
2. Bổ sung rule đặt tên message type thống nhất:
   - `<DOMAIN>_<ACTION>_<PHASE?>` (ví dụ: `STOCK_RESEARCH_RUN`).
3. Tạo compatibility layer để không phá code cũ.
4. Cập nhật router/handler import theo domain.
5. Viết contract test:
   - Message hợp lệ theo domain.
   - Message sai version bị reject có kiểm soát.
6. Viết guideline ngắn trong `docs/` về cách thêm message mới.

### DoD
- 100% message type active được gắn domain rõ ràng.
- Có version metadata cho domain trọng yếu (`auth`, `stockResearch`, `settings`).
- Không phát sinh regression ở unit/integration test hiện có.

### Rủi ro và giảm thiểu
- **Rủi ro:** Sót message type ít dùng.  
  **Giảm thiểu:** Có telemetry cảnh báo "unknown type" sau rollout.
- **Rủi ro:** Handler cũ import sai path.  
  **Giảm thiểu:** Thêm test smoke cho toàn bộ handler registry.

---

## Pha 2 - Chuẩn hóa API gateway UI -> background (Tuần 3-4)

### Mục tiêu
Loại bỏ việc gọi `sendMessage` trực tiếp trong component, đưa toàn bộ qua một gateway chuẩn.

### Thiết kế đề xuất
- Tạo lớp gateway trung tâm (ví dụ `src/ui-preact/api/runtimeGateway.js`) với trách nhiệm:
  - Validate input theo schema domain.
  - Đóng gói envelope chuẩn (`type`, `v`, `correlationId`, `timestamp`).
  - Chuẩn hóa error mapping sang kiểu lỗi UI-friendly.
  - Có retry policy cho lỗi transient (nếu phù hợp).

### Công việc chi tiết
1. Tạo runtime gateway + hàm helper theo domain.
2. Cập nhật API wrappers hiện có để dùng gateway mới.
3. Refactor component còn gọi trực tiếp `chrome.runtime.sendMessage`.
4. Bổ sung lint rule/convention:
   - Cấm import `chrome.runtime.sendMessage` trực tiếp trong `components/`.
5. Bổ sung test:
   - Unit test cho gateway.
   - Test mapping lỗi (timeout, no handler, invalid response).

### DoD
- 0 component gọi `sendMessage` trực tiếp.
- 100% luồng UI -> background đi qua gateway.
- Tỷ lệ lỗi runtime do envelope sai format giảm rõ rệt so với baseline.

### Rủi ro và giảm thiểu
- **Rủi ro:** Đứt luồng ở các feature cũ/ít dùng.  
  **Giảm thiểu:** Rollout theo domain, ưu tiên domain core trước.
- **Rủi ro:** Gateway thành điểm nghẽn mới.  
  **Giảm thiểu:** Giữ gateway mỏng, chia helper theo domain.

---

## Pha 3 - Monitoring cho persistence non-fatal (Tuần 5)

### Mục tiêu
Không để lỗi ghi dữ liệu bị "im lặng"; tăng khả năng quan sát và phản ứng.

### Thiết kế đề xuất
- Chuẩn hóa event log khi persistence fail:
  - `feature`
  - `operation` (insert/update/upsert)
  - `runId`/`correlationId`
  - `table`
  - `errorCode`/`message`
  - `severity`
- Định nghĩa metric:
  - `persistence_non_fatal_total`
  - `persistence_non_fatal_rate`
  - `persistence_recovery_success_total` (nếu có retry)

### Công việc chi tiết
1. Thêm helper logging thống nhất cho persistence error.
2. Chuẩn hóa tất cả catch non-fatal trong service/orchestrator.
3. Thiết lập ngưỡng cảnh báo:
   - Theo feature.
   - Theo tần suất trong 15m/1h.
4. Tạo dashboard theo domain và bảng dữ liệu.
5. Bổ sung runbook xử lý khi cảnh báo vượt ngưỡng.

### DoD
- 100% persistence non-fatal có structured log.
- Có dashboard và alert threshold hoạt động.
- Có runbook xử lý sự cố mức team.

### Rủi ro và giảm thiểu
- **Rủi ro:** Nhiễu cảnh báo quá nhiều.  
  **Giảm thiểu:** Tuning threshold theo baseline 1-2 tuần đầu.
- **Rủi ro:** Thiếu context để debug.  
  **Giảm thiểu:** Bắt buộc có `correlationId`/`runId` trong log.

---

## Pha 4 - Ổn định và chốt rollout (Tuần 6)

### Mục tiêu
Đánh giá hiệu quả, fix tồn đọng, chốt tiêu chuẩn vận hành.

### Công việc
- So sánh metric trước/sau:
  - Unknown message type.
  - UI runtime message error.
  - Persistence non-fatal visibility.
- Sửa lỗi hậu refactor và tối ưu điểm nghẽn.
- Chốt tài liệu:
  - Coding guideline cho message contract.
  - API gateway usage guide.
  - Monitoring/runbook final.

### DoD
- Toàn bộ test chính xanh.
- Không còn regression nghiêm trọng sau 1 chu kỳ release.
- Team có tài liệu vận hành đủ dùng.

## 4) Thứ tự ưu tiên thực thi trong sprint

- Sprint 1: Pha 0 + Pha 1.
- Sprint 2: Pha 2.
- Sprint 3: Pha 3 + Pha 4.

Lý do thứ tự:
- Contract phải chuẩn trước để gateway bám đúng interface.
- Gateway chuẩn rồi mới đo monitoring ổn định hơn (ít nhiễu do contract lỗi).

## 5) Phân công vai trò đề xuất

- Backend/Extension owner:
  - Dẫn dắt refactor schema + handler/router compatibility.
- Frontend owner:
  - Refactor UI qua gateway + chuẩn hóa lỗi hiển thị.
- QA/Automation:
  - Bổ sung test contract/gateway và smoke flows quan trọng.
- DevOps/Platform (nếu có):
  - Dashboard, alerting, runbook vận hành.

## 6) KPI theo dõi thành công

- Giảm >= 70% lỗi message sai contract sau 2 release.
- 100% luồng UI messaging đi qua gateway chuẩn.
- 100% persistence non-fatal có log cấu trúc.
- MTTR cho lỗi persistence giảm ít nhất 30% nhờ có telemetry + runbook.

## 7) Backlog kỹ thuật đi kèm (khuyến nghị)

- Tạo rule kiểm tra naming convention message type trong CI.
- Tạo generator/template khi thêm message domain mới.
- Bổ sung e2e critical path cho các domain đã gateway hóa.
