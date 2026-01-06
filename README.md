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

## License

Không xác định
