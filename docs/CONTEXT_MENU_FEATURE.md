# Context Menu Feature - Tính năng phân tích nội dung từ Context Menu

## Tổng quan
Đã thêm tính năng context menu cho phép người dùng phân tích nội dung bài viết/bài báo trực tiếp từ bất kỳ trang web nào.

## Các thay đổi đã thực hiện

### 1. manifest.json
- Thêm permission `contextMenus` để tạo menu chuột phải

### 2. background.js
- Khởi tạo context menu item "ChatGPT Assistant - Phân tích" khi extension được cài đặt/khởi động
- Xử lý sự kiện click context menu:
  - Trích xuất nội dung từ text được chọn hoặc toàn bộ trang
  - Áp dụng prompt đã cấu hình với placeholder `{CONTENT}`
  - Gửi prompt tới ChatGPT tự động

**Các function chính:**
- `extractPageContent()`: Trích xuất nội dung từ các thẻ HTML phổ biến (article, main, .content, etc.)
- `sendPromptToChatGPT()`: Mở/focus tab ChatGPT và gửi prompt
- `findChatGPTTab()`: Tìm tab ChatGPT đang mở

### 3. sidepanel.html
- Thêm textarea input mới trong trang Settings:
  - **5. Prompt phân tích từ Context Menu**
  - Cho phép người dùng tùy chỉnh prompt phân tích
  - Sử dụng placeholder `{CONTENT}` để chèn nội dung

### 4. settings.js
- Thêm constant `CONTEXT_MENU_PROMPT_KEY`
- Thêm `contextMenuPromptInput` vào DOM elements
- Load và lưu context menu prompt cùng với các settings khác
- Default prompt: `"Hãy phân tích nội dung sau:\n\n{CONTENT}"`

### 5. index.js
- Thêm `contextMenuPromptInput: byId('contextMenuPromptInput')` vào DOM initialization

## Cách sử dụng

### Cấu hình Prompt
1. Mở extension (click icon hoặc mở side panel)
2. Vào tab **Settings** (⚙️)
3. Tìm mục **5. Prompt phân tích từ Context Menu**
4. Nhập prompt tùy chỉnh, sử dụng `{CONTENT}` để đại diện cho nội dung
5. Ví dụ prompt:
   ```
   Hãy phân tích bài viết sau và đưa ra:
   1. Tóm tắt ngắn gọn
   2. Các điểm chính
   3. Ý kiến đánh giá
   
   Nội dung:
   {CONTENT}
   ```
6. Click **Lưu cấu hình**

### Sử dụng Context Menu
1. Truy cập bất kỳ trang web nào (bài báo, blog, Facebook, etc.)
2. Có 2 cách:
   - **Cách 1**: Bôi đen (select) đoạn văn bản muốn phân tích
   - **Cách 2**: Không chọn gì (extension sẽ tự động trích xuất nội dung chính)
3. Click chuột phải → chọn **"ChatGPT Assistant - Phân tích"**
4. Extension sẽ:
   - Tự động mở/focus tab ChatGPT
   - Điền prompt đã cấu hình với nội dung
   - Gửi prompt tự động để ChatGPT phân tích

## Kỹ thuật trích xuất nội dung

Extension thông minh trích xuất nội dung theo thứ tự ưu tiên:

1. **Text được chọn**: Nếu người dùng bôi đen text → sử dụng ngay
2. **Phần tử article**: Tìm các thẻ HTML chứa nội dung chính:
   - `<article>`
   - `[role="article"]`
   - `.post-content`, `.article-content`, `.entry-content`
   - `<main>`, `[role="main"]`
3. **Body fallback**: Nếu không tìm thấy → lấy toàn bộ body text

**Giới hạn nội dung**: Tối đa 10,000 ký tự để tránh quá tải ChatGPT

## Lưu ý
- Context menu hoạt động trên **tất cả các trang web**
- Nội dung quá dài sẽ được cắt ngắn và thêm thông báo "[... nội dung đã được cắt ngắn ...]"
- Prompt sẽ tự động gửi đến ChatGPT (không cần review)
- Nếu ChatGPT chưa đăng nhập, người dùng cần đăng nhập trước

## Troubleshooting
- **Menu không hiện**: Reload extension hoặc restart browser
- **Không gửi được prompt**: Kiểm tra xem ChatGPT có đang hoạt động không
- **Nội dung trống**: Thử bôi đen text rồi dùng context menu
