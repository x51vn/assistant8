# ChatGPT Assistant Extension

## Build (Vite)

Project now includes a Vite build pipeline to bundle scripts and output a clean MV3 extension folder in `dist/`.

- Install deps: `npm install`
- Build: `npm run build`
- Load in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `chatgpt-extension/dist` folder.

### Source structure

- `src/` contains build inputs (JS entrypoints + UI modules).
- Root files (`manifest.json`, `sidepanel.html`, `popup.html`, `styles.css`, `images/`) are treated as static extension assets and are copied into `dist/` during build.

### Docs

- Additional documentation lives in `docs/`.

Một Chrome extension tự động hóa việc mở ChatGPT và xử lý prompt.

## Tính năng

1. **Mở ChatGPT định kỳ** - Tự động mở tab ChatGPT mỗi 5 phút nếu chưa mở
2. **Gửi Prompt tự động** - Gửi prompt được cấu hình tới ChatGPT
3. **Hiển thị Kết quả** - Nhận và hiển thị kết quả từ ChatGPT
4. **Cấu hình linh hoạt** - Lưu prompt và cài đặt

## Cấu trúc Project

```
chatgpt-extension/
├── dist/               # Extension folder để “Load unpacked”
├── src/                # Source (Vite inputs)
├── manifest.json       # Static asset (copied into dist/)
├── popup.html          # Static asset (copied into dist/)
├── sidepanel.html      # Static asset (copied into dist/)
├── styles.css          # Static asset (copied into dist/)
├── images/             # Static assets (copied into dist/)
├── docs/               # Tài liệu bổ sung
└── README.md           # Overview
```

## Cài đặt

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật "Developer mode" (góc trên bên phải)
3. Nhấn "Load unpacked"
4. Chọn thư mục `chatgpt-extension/dist`

## Hướng dẫn sử dụng

### Trang Cấu hình (Settings)
1. Nhấp vào tab "Cấu hình" trong popup
2. Nhập prompt mà bạn muốn gửi tới ChatGPT
3. (Tùy chọn) Bật "Chạy tự động" để tự động gửi prompt theo khoảng thời gian
4. Nhấn "Lưu cấu hình"

### Trang Kết quả (Results)
1. Nhấp vào tab "Kết quả" 
2. Nhấn "Chạy ngay" để gửi prompt tới ChatGPT
3. Kết quả sẽ được hiển thị sau vài giây
4. Nhấn "Làm mới" để lấy kết quả mới nhất

## Cách hoạt động

### Background Service Worker
- Kiểm tra mỗi 5 phút xem tab ChatGPT có mở không
- Nếu chưa mở, sẽ mở tab mới
- Xử lý các yêu cầu từ popup và content script

### Content Script
- Tìm input field trên trang ChatGPT
- Nhập prompt và gửi
- Lấy kết quả từ tin nhắn gần nhất của assistant

### Popup / Sidepanel UI
- Giao diện người dùng với 2 tab: Kết quả và Cấu hình
- Lưu cài đặt vào Chrome Storage
- Gửi request tới background để xử lý

## Lưu ý quan trọng

1. **Cần đăng nhập ChatGPT** - Extension chỉ hoạt động nếu bạn đã đăng nhập
2. **Cần mở ChatGPT** - Extension sẽ tự động mở ChatGPT lần đầu, sau đó chỉ cần để tab này mở
3. **Chờ kết quả** - Có thể mất 5-10 giây để ChatGPT xử lý và trả về kết quả
4. **Lựa chọn prompt hợp lý** - Nên dùng prompt ngắn và rõ ràng

## Troubleshooting

### Không lấy được kết quả
- Kiểm tra xem ChatGPT tab có mở không
- Kiểm tra Console (F12) xem có lỗi gì
- Đảm bảo bạn đã đăng nhập vào ChatGPT

### Prompt không được gửi
- Kiểm tra permission trong manifest
- Thử reload extension (Ctrl+R)
- Đảm bảo prompt không trống

### Extension không mở ChatGPT
- Kiểm tra xem URL có đúng là chatgpt.com không
- Thử disable rồi enable extension

## Phát triển

Để sửa đổi extension:
1. Chỉnh sửa các file
2. Quay lại `chrome://extensions/`
3. Nhấn nút Reload cho extension

## Build, Commit & Push (Production Ready)

### Cài đặt Git (Lần đầu tiên)
```bash
# Fix line ending warnings (Windows/Linux compatibility)
git config core.autocrlf true
```

**Lý do:** Tự động chuyển CRLF → LF khi commit, tránh warning và conflict.

### Bước 1: Build Extension
```bash
npm run build
```

**Kết quả:** 
- Tạo `dist/` folder chứa extension bundled (JS + static assets)
- **Sourcemap DISABLED** (không sinh `.map` files, giảm kích thước)
- File output: `ui.js`, `background.js`, `content.js` (~5-10KB mỗi file)

### Bước 2: Kiểm tra thay đổi
```bash
git status
```

**Kết quả:** Xem danh sách files đã thay đổi (staging area + working tree).

### Bước 3: Thêm các file vào staging
```bash
# Cách 1: Thêm chỉ source code + docs (RECOMMENDED)
git add src/ README.md vite.config.js .gitignore package*.json

# Cách 2: Thêm tất cả (nếu cần update dist/)
git add .

# Kiểm tra lại
git diff --cached --stat
```

**Ghi chú:**
- `src/` chứa source code (luôn commit)
- `dist/` là build output (chỉ commit nếu không có CI/CD)
- `.gitignore` bỏ qua `*.map` files (sourcemap)

### Bước 4: Commit thay đổi
```bash
git commit -m "Chủ đề: Tóm tắt thay đổi < 50 ký tự

- Điểm chi tiết 1
- Điểm chi tiết 2
- Điểm chi tiết 3"
```

**Ví dụ thực tế:**
```bash
git commit -m "Fix: Message listener response handling

- Add safeSendResponse pattern to prevent channel closing
- Wrap getChatMeta() safely in get_result handler
- Notify background on prompt_failed timeout
- Add debug logging to sendToTabRobust retry
- Handle unknown actions with error responses"
```

### Bước 5: Push code lên remote
```bash
# Đẩy branch hiện tại
git push origin side-panel

# Kiểm tra log (5 commit gần nhất)
git log --oneline -5
```

### Quy trình đầy đủ (một lần)
```bash
npm run build
git add src/ README.md vite.config.js .gitignore
git status                                        # Review trước
git commit -m "Feature: Brief description"
git push origin side-panel
```

### Kiểm tra kết quả
```bash
# Xem lịch sử commit
git log --oneline

# Xem chi tiết commit cuối cùng
git show

# Kiểm tra branch status
git status

# Xem diff so với remote
git diff origin/side-panel
```

### Troubleshooting

**Q: "fatal: refusing to merge unrelated histories"**
```bash
git pull origin side-panel --allow-unrelated-histories
```

**Q: "CRLF will be replaced by LF"**
```bash
# Đã được fix bằng: git config core.autocrlf true
# Không cần lo lắng
```

**Q: Quên commit message format?**
```bash
# Sửa commit cuối cùng
git commit --amend -m "New message"
git push origin side-panel --force-with-lease
```

## License

Không xác định