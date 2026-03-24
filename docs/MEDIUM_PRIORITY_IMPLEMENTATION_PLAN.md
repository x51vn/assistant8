# Kế Hoạch Triển Khai - Nhóm Ưu Tiên Trung Hạn

## 1) Mục tiêu

Tài liệu này cụ thể hóa 3 hạng mục ưu tiên trung hạn:
- Refactor handler registration theo module group, giảm kích thước file trung tâm.
- Trích xuất metadata navigation/page config ra file cấu hình riêng.
- Bổ sung contract tests giữa UI message requests và background handlers.

Mục tiêu tổng quát:
- Giảm độ phức tạp kiến trúc ở các điểm "nút thắt".
- Tăng tính nhất quán giữa UI và background.
- Giảm nguy cơ regression khi thêm/sửa feature.

## 2) Kết quả mong đợi (Outcome)

- Handler registry chuyển từ mô hình tập trung một file lớn sang mô hình theo domain.
- Navigation không còn hardcode danh sách page trong component.
- Có bộ contract tests tối thiểu cho các domain trọng yếu.
- Team có guideline ngắn để mở rộng an toàn về sau.

## 3) Phạm vi kỹ thuật

- `src/background/handlers/`
- `src/background/messageRouter.js`
- `src/ui-preact/components/Navigation.jsx`
- `src/ui-preact` (pages và route metadata)
- `src/shared/messageSchema.js`
- `tests/unit` và/hoặc `tests/integration`

## 4) Kế hoạch theo pha (4-5 tuần)

## Pha 0 - Khảo sát và thiết kế (3-4 ngày)

### Công việc
- Lập inventory toàn bộ handler hiện có:
  - Tên handler
  - Message types đăng ký
  - Domain liên quan
- Lập inventory page/navigation metadata hiện có trong UI.
- Chọn domain grouping chuẩn cho handlers:
  - `auth`, `settings`, `portfolio`, `stock-research`, `watchlist`, `system`.
- Xác định danh sách contract test cần có trong đợt 1.

### Deliverables
- Bảng mapping handler -> message types -> domain.
- Tài liệu thiết kế ngắn cho:
  - `handlers registry by domain`
  - `navigation config schema`
  - `contract test matrix`.

### DoD
- Team thống nhất naming + grouping convention.
- Có checklist migration theo domain.

---

## Pha 1 - Refactor Handler Registration theo module group (Tuần 1-2)

### Mục tiêu
Giảm độ phình file trung tâm, tăng khả năng tách biệt theo domain.

### Thiết kế đề xuất
- Tạo entry registration theo domain, ví dụ:
  - `src/background/handlers/registries/authRegistry.js`
  - `src/background/handlers/registries/settingsRegistry.js`
  - `src/background/handlers/registries/stockResearchRegistry.js`
- Tạo aggregator:
  - `src/background/handlers/registerAllHandlers.js`
- File trung tâm chỉ còn gọi `registerAllHandlers()`.

### Công việc chi tiết
1. Tạo registry module theo domain và di chuyển logic đăng ký handler.
2. Giữ nguyên handler implementation hiện tại (để giảm rủi ro).
3. Thêm logging startup cho từng domain registry:
   - Số lượng message types đã register.
4. Thêm smoke test:
   - Verify domain registries được gọi đủ.
   - Verify các message type cốt lõi vẫn route được.
5. Loại bỏ import/comment legacy không còn dùng.

### DoD
- File trung tâm handler giảm đáng kể trách nhiệm.
- 100% handler active nằm trong registry domain rõ ràng.
- Tất cả test hiện có liên quan routing pass.

### Rủi ro và giảm thiểu
- **Rủi ro:** Lỡ bỏ sót registration khi tách file.  
  **Giảm thiểu:** So sánh danh sách type trước/sau bằng test snapshot danh sách registered types.
- **Rủi ro:** Vòng import phụ thuộc lẫn nhau.  
  **Giảm thiểu:** Registry chỉ import handler functions, không import chéo registry.

---

## Pha 2 - Trích xuất Navigation/Page Config (Tuần 3)

### Mục tiêu
Bỏ hardcode metadata page trong `Navigation.jsx`, chuẩn hóa một nguồn cấu hình duy nhất.

### Thiết kế đề xuất
- Tạo file config, ví dụ:
  - `src/ui-preact/config/navigationConfig.js`
- Mỗi item gồm:
  - `id`, `label`, `icon`, `group`, `visibleInPrimary`, `featureFlag?`, `order`.
- `Navigation.jsx` chỉ render từ config.

### Công việc chi tiết
1. Tạo schema nhẹ cho navigation config (runtime validation nếu cần).
2. Di chuyển danh sách page hiện tại sang config mới.
3. Cập nhật `Navigation.jsx`:
   - Lấy dữ liệu từ config.
   - Tách logic primary/hidden theo field cấu hình thay vì `slice`.
4. Bổ sung unit test:
   - Không trùng `id`.
   - Có order hợp lệ.
   - Component render đúng số item.
5. Bổ sung guideline:
   - Cách thêm page mới đúng chuẩn.

### DoD
- `Navigation.jsx` không còn hardcode list pages.
- Cấu hình page dùng chung được và dễ mở rộng.
- Unit tests cho config pass.

### Rủi ro và giảm thiểu
- **Rủi ro:** Sai order hoặc mất page khi migrate.  
  **Giảm thiểu:** Snapshot test UI + test uniqueness/order.
- **Rủi ro:** Feature chưa sẵn sàng vẫn hiện trên nav.  
  **Giảm thiểu:** Hỗ trợ `featureFlag`/`enabled` trong config.

---

## Pha 3 - Contract Tests UI Request <-> Background Handler (Tuần 4)

### Mục tiêu
Đảm bảo request từ UI luôn khớp contract handler background theo message type.

### Thiết kế đề xuất
- Tạo test matrix theo domain trọng yếu (đợt 1):
  - `settings`
  - `stock-research`
  - `auth`
- Mỗi test xác nhận:
  1. UI gửi đúng `type`.
  2. Envelope đủ trường bắt buộc (`v`, `type`, `correlationId`, `timestamp`).
  3. Handler trả response schema kỳ vọng.
  4. Trường lỗi chuẩn hóa khi thất bại.

### Công việc chi tiết
1. Tạo helper test chung cho contract assertions.
2. Viết tests cho các API wrappers và gateway quan trọng.
3. Viết tests route -> handler cho các message core.
4. Thiết lập coverage gate tối thiểu cho contract tests domain core.
5. Thêm CI step chạy nhóm tests này trước merge.

### DoD
- Có contract tests cho 3 domain trọng yếu.
- Các mismatch phổ biến (type sai, payload sai shape, error envelope sai) đều có test.
- Contract test chạy ổn định trên CI.

### Rủi ro và giảm thiểu
- **Rủi ro:** Test flaky do mock thiếu ổn định.  
  **Giảm thiểu:** Dùng fixtures + helper mock thống nhất.
- **Rủi ro:** Test khó maintain nếu over-coupled implementation.  
  **Giảm thiểu:** Assert theo contract public, không assert chi tiết nội bộ.

---

## Pha 4 - Ổn định và tài liệu hóa (3-4 ngày)

### Công việc
- Chạy regression suite cho domain vừa refactor.
- Dọn dẹp các warning/deprecation tạm thời.
- Viết tài liệu ngắn:
  - Cách đăng ký handler mới theo domain.
  - Cách thêm page mới qua config.
  - Cách viết contract test khi thêm message type.

### DoD
- Không còn bug blocker sau 1 vòng kiểm thử tích hợp.
- Tài liệu đủ để dev mới follow mà không cần hỏi lại.

## 5) Ưu tiên sprint đề xuất

- Sprint A:
  - Pha 0 + Pha 1
- Sprint B:
  - Pha 2 + Pha 3
- Sprint C (ngắn):
  - Pha 4 + tối ưu hậu refactor

## 6) KPI đo hiệu quả

- Giảm số dòng/độ phức tạp file trung tâm handler >= 40%.
- 100% page metadata lấy từ config thay vì hardcode trong component.
- Tăng số contract test cho domain core lên mức bao phủ đã thống nhất (ví dụ >= 80% message types core).
- Giảm lỗi runtime do mismatch UI/background trong 2 release liên tiếp.

## 7) Checklist bàn giao

- [ ] Domain registries đã tách và hoạt động.
- [ ] Navigation config mới đã áp dụng và test pass.
- [ ] Contract tests domain core đã có trên CI.
- [ ] Guideline kỹ thuật đã cập nhật trong `docs/`.
