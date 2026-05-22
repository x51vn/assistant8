# Codebase Review - ChatGPT Assistant

## 1) Mục tiêu tài liệu

Tài liệu này tổng hợp review codebase theo góc nhìn kiến trúc hệ thống, bao gồm:
- Cấu trúc tổng thể và cách các module tương tác.
- Luồng xử lý chính từ UI đến background và persistence.
- Điểm mạnh, điểm yếu (technical debt/risk) đang tồn tại.
- Đề xuất hướng cải tiến theo thứ tự ưu tiên.

Phạm vi review dựa trên mã nguồn hiện tại trong repository, tập trung vào các khối:
- `src/background`
- `src/ui-preact`
- `src/shared`
- `tests`
- `supabase`

## 2) Tổng quan kiến trúc

Hệ thống được tổ chức theo model extension MV3, phân tách khá rõ các lớp:

1. `background`  
   Service Worker làm trung tâm điều phối. Đăng ký listener đồng bộ ở top-level, route message, gọi handler/service, quản lý alarm và startup lifecycle.

2. `content`  
   Chứa logic thao tác DOM/trình duyệt để phục vụ một số luồng automation.

3. `ui-preact`  
   Side panel/settings UI với Preact. Có auth gate, state cho từng feature, các component theo trang/chức năng.

4. `shared`  
   Chứa contract message, provider routing, validator, helper dùng chung giữa UI/background.

5. External integrations  
   Supabase (auth + persistence), LLM providers, market/search providers.

Kiến trúc này phù hợp với đặc thù MV3: event-driven, không phụ thuộc long-lived memory, và hướng đến persistence bên ngoài.

## 3) Luồng dữ liệu chính

Luồng cơ bản:
1. UI phát sinh action (hoặc content script phát sinh sự kiện).
2. Gửi message đến background.
3. `messageRouter` dispatch đến handler theo `type`.
4. Handler delegate xử lý sang service/orchestrator.
5. Service gọi hệ thống ngoài (LLM, search, Supabase) và tổng hợp kết quả.
6. Background trả response + broadcast event cập nhật trạng thái.
7. UI nhận data, render và cập nhật state.

Nhận xét:
- Luồng dữ liệu nhìn chung nhất quán, dễ trace theo hướng message -> handler -> service.
- Các module stock research thể hiện rõ nhất model orchestrator có step và progress update.

## 4) Các thành phần kiến trúc nổi bật

### 4.1 Background Service Worker

Mục tiêu MV3 được thể hiện rõ:
- Listener đăng ký đồng bộ ngay khi module load.
- Khởi tạo bất đồng bộ được defer (`setTimeout`) để không chặn message routing.
- Tư duy "serverless-like" và state được đẩy ra storage/persistence.

Điểm tích cực:
- Có startup path rõ ràng: restore session, initialize registry, flush outbox.
- Có xử lý install/update/startup/alarm/context menu theo đúng event model.

Rủi ro:
- File background entrypoint đang gánh nhiều trách nhiệm (lifecycle + alarm + auth restore + debug marker), cần tiếp tục chia nhỏ để giảm coupling.

### 4.2 Message Router và message contracts

`messageRouter` dùng registry map cho handler, khá sạch và dễ test.

Điểm tích cực:
- Pattern `registerHandler`/`route` dễ mở rộng.
- Có timing/log slow handler.

Rủi ro:
- `messageSchema` quá lớn, trộn domain mới/legacy; về lâu dài sẽ tăng nguy cơ mismatch contract và khó bảo trì.
- Kiểu message giữa các khu vực chưa đồng nhất tuyệt đối (có nội dung schema `type/v`, có nội dung action-style).

### 4.3 Stock Research pipeline (khối được đầu tư tốt)

Đây là module có kiến trúc mạnh nhất hiện tại:
- Orchestrator theo step rõ ràng: validate -> agent loop -> build context -> LLM -> validate output -> persist.
- Có progress callback, retry logic, telemetry, và phân tách helper/database operations.
- Có nguyên tắc "evidence-first": ưu tiên nội dung đã fetch thay vì dựa trên snippet SERP.

Điểm tích cực:
- Bounded loop (giới hạn rounds/url) giúp kiểm soát chi phí và latency.
- Validation output + correction retry tăng độ tin cậy.
- Persistence theo nhiều bảng (`runs`, `sources`, `insights`) phù hợp audit/history.

Rủi ro:
- Độ phức tạp cao, số dependency nhiều; cần tiếp tục giữ chặt test theo từng boundary.
- Một số lỗi persistence được coi là non-fatal (ưu tiên UX) -> cần bổ sung monitoring để không "mất dữ liệu âm thầm".

### 4.4 UI Preact

Điểm tích cực:
- Auth gate rõ ràng ở root app.
- Main app và navigation tách thành component riêng.
- Các feature quan trọng có section/page riêng, dễ mở rộng theo module.

Rủi ro:
- API calling style chưa đồng nhất (có nội dung gọi qua API wrapper, có nội dung gọi `chrome.runtime.sendMessage` trực tiếp trong component) -> tăng độ kết dính và khó mock test.
- Navigation đang hardcode metadata page trong component -> dễ phát sinh debt khi số page tăng.

## 5) Điểm mạnh của hệ thống

1. Phù hợp tốt với MV3 architecture  
   Design event-driven, listener sync registration, và startup pattern khá đúng chuẩn.

2. Phân tách layer khá rõ  
   UI, background, shared contracts, service modules được tổ chức theo vai trò.

3. Orchestrator/service pattern tốt cho nghiệp vụ phức tạp  
   Đặc biệt ở stock research, quy trình có step, có telemetry, có retry, có validation.

4. Test coverage đã có nhiều tầng  
   Có unit/integration/e2e (dù e2e mới đang mức smoke cho một số luồng).

5. Khả năng mở rộng provider  
   Có abstraction cho LLM provider routing/factory, tạo nên điểm tương đối linh hoạt.

## 6) Điểm yếu và rủi ro

1. Contract sprawl trong messaging  
   `messageSchema` lớn và có dấu hiệu drift (legacy + hiện tại), dễ gây mismatch giữa UI/background khi thay đổi nhanh.

2. Monolithic registration và dấu hiệu nợ kỹ thuật  
   Một số file tập trung quá nhiều concern, có commented legacy imports, cho thấy quá trình migration chưa "đẹp" hoàn toàn.

3. Chưa đồng nhất abstraction API phía UI  
   Cấu trúc call background chưa thống nhất sẽ làm giảm khả năng tái sử dụng và testability.

4. Rủi ro quan sát và dữ liệu  
   Một số trường hợp persistence fail nhưng pipeline vẫn tiếp tục; nếu không có cảnh báo/metric tốt sẽ khó phát hiện lỗi data integrity.

5. E2E chưa bao phủ full critical path  
   Các luồng tích hợp phức tạp với external dependency vẫn có nguy cơ regression.

## 7) Đánh giá tổng thể

Hệ thống có nền tảng kiến trúc tốt ở lớp runtime/background và cách tổ chức pipeline nghiệp vụ phức tạp.  
Nợ kỹ thuật hiện tại tập trung chủ yếu ở việc phình to contract messaging, sự không đồng nhất API layer phía UI, và dấu hiệu drift sau nhiều đợt thay đổi.

Nói ngắn gọn:
- Nền tảng: mạnh.
- Kỷ luật contract/module boundary: cần được siết chặt hơn.
- Mức độ sẵn sàng scale feature: khá, nếu ưu tiên giảm debt ở messaging và API boundary.

## 8) Đề xuất cải tiến theo ưu tiên

### Ưu tiên cao (ngắn hạn)
- Tách `messageSchema` theo domain (auth, portfolio, stock-research, settings, ...) và đặt rule versioning contract.
- Chuẩn hóa một gateway API duy nhất cho UI -> background (không gọi sendMessage trực tiếp trong component).
- Bổ sung monitoring cho persistence non-fatal (log structure + metric + cảnh báo threshold).

### Ưu tiên trung hạn
- Refactor handler registration theo module group, giảm kích thước file trung tâm.
- Trích xuất metadata navigation/page config ra file config riêng.
- Bổ sung contract tests giữa UI message requests và background handlers.

### Ưu tiên dài hạn
- Xây "architecture fitness checks" (lint rule/convention test) để ngăn drift.
- Mở rộng e2e cho critical user journeys, đặc biệt luồng stock research với mock external boundary có kiểm soát.

## 9) Kết luận

Codebase hiện tại có hướng đi đúng và có nhiều thành phần đã được thiết kế chặt, đặc biệt ở background orchestration.  
Giá trị lớn nhất trong giai đoạn tiếp theo là "làm gọn và chuẩn hóa": contract messaging, API boundary, và observability cho persistence. Nếu làm tốt 3 hướng này, hệ thống sẽ dễ bảo trì hơn và scale feature an toàn hơn.

