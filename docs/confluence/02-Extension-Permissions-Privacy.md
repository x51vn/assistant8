# Permissions, Privacy & Web Store Compliance

Tài liệu này mô tả **đúng hành vi thực tế** của extension: thu thập gì, vì sao, lưu ở đâu, chia sẻ thế nào.

## 1) Permissions (manifest.json)

File: `src/extension/manifest.json`

- `storage`
  - Dùng để lưu **Supabase auth session token** qua adapter (service worker không có `localStorage`).
  - Không dùng để lưu business data (portfolio/history/errors/assets/settings đều ở Supabase Postgres).

- `tabs`
  - Tìm và quản lý tab `https://chatgpt.com/*` khi gửi prompt/lấy response.

- `scripting`
  - Inject/excute script (content extraction cho context menu trên trang hiện tại) và đảm bảo content script chạy.

- `alarms`
  - Chạy job định kỳ (vd: cập nhật giá cổ phiếu 5 phút/lần trong giờ thị trường).

- `sidePanel`
  - Hiển thị UI ở side panel (`sidepanel-preact.html`).

- `contextMenus`
  - Thêm menu “ChatGPT Assistant - Phân tích” khi right-click.

- `activeTab`
  - Cho phép chạy content extraction trên **tab hiện tại** khi user chủ động bấm context menu.

## 2) Host permissions

- `https://chatgpt.com/*`
  - Inject content script để tự động nhập prompt và đọc response.

- `https://iboard-query.ssi.com.vn/*`, `https://iboard.ssi.com.vn/*`
  - Fetch giá cổ phiếu từ SSI.

- `https://bgapidatafeed.vps.com.vn/*`
  - Market data provider (VPS).

- `https://*.supabase.co/*`
  - Supabase Auth + Postgres REST.

## 3) Dữ liệu được xử lý

### 3.1 Dữ liệu người dùng nhập trong UI
- Portfolio holdings (symbol, quantity, avg_price, current_price, notes)
- Assets (type, name, value/quantity/unit, notes…)
- Settings config (JSONB, gồm prompt templates và flags)
- Error tracking (title, description, severity, type, resolved/resolution_notes)
- English module (topic + prompt gắn với chat_id)

**Lưu trữ**: Supabase Postgres tables (RLS theo `auth.uid() = user_id`).

### 3.2 Dữ liệu từ ChatGPT tab
- Khi user chạy một chức năng cần ChatGPT:
  - Extension **điền prompt** vào editor ChatGPT.
  - Extension **đọc response text** để hiển thị trong UI và (tuỳ workflow) lưu vào `chat_history`.

**Lưu trữ**:
- Nếu workflow có lưu lịch sử: prompt/response/chat_id/chat_url được lưu ở Supabase `chat_history`.
- Nếu chỉ gửi prompt (vd context menu) mà không có flow lưu: nội dung không bị tự động lưu, trừ khi user thực hiện thao tác lưu trong UI.

### 3.3 Dữ liệu từ trang web khi dùng context menu
- Nếu user chọn text: dùng `info.selectionText`.
- Nếu không chọn text: chạy hàm extract nội dung trang (đặc biệt có logic cho Facebook) để tạo prompt phân tích.

**Sử dụng**: Nội dung được chèn vào template `{CONTENT}` và gửi sang ChatGPT.

**Lưu trữ**: không có persistence riêng; chỉ trở thành một phần của prompt ChatGPT (có thể bị lưu bởi ChatGPT theo chính sách của OpenAI).

### 3.4 Telemetry kỹ thuật
- Content script có thể gửi `TELEMETRY_REPORT` chứa thống kê selector match + phiên bản UI ChatGPT (để debug selector).
- Hiện không có handler xử lý/persist telemetry trong background (nếu không có receiver → message bị catch và log).

## 4) Chia sẻ dữ liệu

- Extension gửi dữ liệu tới:
  - Supabase (backend của sản phẩm) để lưu dữ liệu người dùng.
  - OpenAI ChatGPT (thông qua việc user sử dụng trang `chatgpt.com`) khi user chạy các prompt.
  - Market data providers (SSI/VPS) để lấy giá.

- Extension **không** bán/chia sẻ dữ liệu người dùng cho bên thứ 3 ngoài các endpoint cần thiết ở trên.

## 5) Thời gian lưu trữ & quyền kiểm soát

- Dữ liệu lưu trong Supabase tuân theo chính sách của dự án.
- User có thể:
  - Xoá items (portfolio/assets/errors/english/history) thông qua UI (tuỳ module).
  - Đăng xuất để kết thúc session.

## 6) External resources trong UI

- Side panel HTML có load Font Awesome CSS từ CDN:
  - `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css`

Nếu cần compliance nghiêm ngặt, cân nhắc bundle icon CSS locally để tránh phụ thuộc remote resource.
