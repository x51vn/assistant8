# HƯỚNG DẪN CÀI ĐẶT VÀ SỬ DỤNG

## BƯỚC 1: CÀI ĐẶT EXTENSION

### Cách 1: Load từ folder (Phát triển)
1. Mở Chrome
2. Vào địa chỉ: `chrome://extensions/`
3. Bật "Developer mode" (công tắc ở góc phải trên)
4. Nhấn "Load unpacked"
5. Chọn thư mục `d:\dtx8\chatgpt-extension`
6. Extension sẽ được thêm vào Chrome

### Kiểm tra cài đặt thành công
- Bạn sẽ thấy "ChatGPT Assistant" trong danh sách extensions
- Icon sẽ xuất hiện ở thanh công cụ Chrome

---

## BƯỚC 2: CẤU HÌNH EXTENSION

### Mở Popup Extension
- Nhấp vào icon extension ở thanh công cụ
- Hoặc dùng phím tắt (nếu có)

### Tab "Cấu hình" (Settings)
1. **Nhập Prompt**: Viết câu lệnh/prompt muốn gửi tới ChatGPT
   - Ví dụ: "Hãy tóm tắt AI là gì"
   - Ví dụ: "Giải thích blockchain"

2. **Chạy Tự động**: 
   - Bật nếu muốn tự động gửi prompt định kỳ
   - Tắt nếu chỉ chạy thủ công

3. **Khoảng thời gian**: 
   - Mặc định 5 phút
   - Có thể thay đổi (tính theo phút)

4. **Nút Lưu cấu hình**: 
   - Nhấn để lưu cài đặt

---

## BƯỚC 3: CHẠY EXTENSION

### Phương pháp 1: Chạy Thủ công
1. Mở popup extension
2. Chuyển sang tab "Kết quả"
3. Nhấn nút "Chạy ngay"
4. Chờ 5-10 giây để ChatGPT xử lý
5. Kết quả sẽ hiển thị

### Phương pháp 2: Chạy Tự động
1. Đi tới tab "Cấu hình"
2. Bật "Chạy tự động"
3. Đặt khoảng thời gian (mặc định 5 phút)
4. Nhấn "Lưu cấu hình"
5. Extension sẽ tự động gửi prompt theo định kỳ

---

## BƯỚC 4: XEM KẾT QUẢ

### Tab "Kết quả"
- **Hộp hiển thị**: Chiếm phần lớn popup
- **Kết quả từ ChatGPT**: Tự động cập nhật sau khi chạy
- **Nút Làm mới**: Lấy kết quả mới nhất từ ChatGPT

---

## TROUBLESHOOTING (Khắc phục lỗi)

### Vấn đề 1: "Không thể lấy kết quả"
**Nguyên nhân**: ChatGPT không mở hoặc extension không kết nối được
**Cách khắc phục**:
1. Đảm bảo ChatGPT tab vẫn mở
2. Reload extension (F5 hoặc Ctrl+R)
3. Kiểm tra Console: F12 > Console tab
4. Reload lại chatgpt.com

### Vấn đề 2: Prompt không được gửi
**Nguyên nhân**: Prompt trống hoặc ChatGPT chưa tải xong
**Cách khắc phục**:
1. Kiểm tra prompt có nội dung không
2. Đợi ChatGPT tải hoàn toàn (thấy input field)
3. Thử lại sau 3-5 giây

### Vấn đề 3: Extension không mở ChatGPT
**Nguyên nhân**: Permission bị từ chối hoặc URL sai
**Cách khắc phục**:
1. Kiểm tra chrome://extensions > ChatGPT Assistant > Details
2. Đảm bảo "Allow access to site" cho chatgpt.com
3. Reload extension

### Vấn đề 4: Kết quả không chính xác
**Nguyên nhân**: ChatGPT chưa trả lời xong
**Cách khắc phục**:
1. Nhấn "Làm mới" sau 10-15 giây
2. Kiểm tra xem ChatGPT có đang typing không
3. Chạy lại với prompt khác

---

## TIPS VÀ MẸOŁ

### Tips 1: Viết Prompt Tốt
- **Ngắn gọn**: 1-2 câu thôi
- **Rõ ràng**: Chỉ rõ bạn muốn gì
- **Cụ thể**: Đừng để quá mờ mịt
- **Ví dụ**:
  - ❌ "Nói về mọi thứ"
  - ✅ "Giải thích Machine Learning là gì?"

### Tips 2: Quản Lý Thời Gian
- Nếu chạy định kỳ, không nên quá nhanh (< 1 phút)
- ChatGPT cần 5-10 giây để trả lời
- Thường thì 5-10 phút mỗi lần là hợp lý

### Tips 3: Đảm Bảo ChatGPT Đăng Nhập
- Extension chỉ hoạt động khi đã đăng nhập
- Đăng nhập một lần, giữ tab mở

### Tips 4: Kiểm Tra Quyền
- Nếu lỗi permission, vào chrome://extensions
- Chi tiết extension > Site access
- Chọn "Allow on this site"

---

## CẤU TRÚC CÓ CHỨC NĂNG

```
chatgpt-extension/
│
├── manifest.json          ← Cấu hình extension (Manifest v3)
│                           - Định nghĩa permission
│                           - Khai báo background worker
│                           - Khai báo content script
│
├── background.js          ← Service Worker (chạy nền)
│                           - Mở ChatGPT định kỳ (5 phút)
│                           - Xử lý message từ popup
│                           - Gửi prompt tới ChatGPT
│
├── content.js             ← Content Script (chạy trên ChatGPT)
│                           - Tìm input field ChatGPT
│                           - Nhập prompt
│                           - Lấy kết quả từ tin nhắn
│
├── popup.html             ← Giao diện popup
│                           - Tab "Kết quả"
│                           - Tab "Cấu hình"
│
├── popup.js               ← Logic popup
│                           - Xử lý button click
│                           - Lưu/lấy cài đặt
│                           - Hiển thị kết quả
│
├── styles.css             ← CSS styling
│                           - Beautiful gradient design
│                           - Responsive layout
│
├── images/
│   ├── icon-16.png        ← Icon nhỏ
│   ├── icon-48.png        ← Icon vừa
│   └── icon-128.png       ← Icon lớn
│
└── README.md              ← Tài liệu tech
```

---

## FLOW HOẠT ĐỘNG

```
START
  ↓
[Mở Extension Popup]
  ↓
┌─ TAB "CẤU HỌP" ─────────────────────────────────┐
│ 1. Nhập Prompt                                   │
│ 2. Tùy chọn chạy tự động                         │
│ 3. Nhấn "Lưu cấu hình"                           │
│    ↓ (Lưu vào Chrome Storage)                    │
└──────────────────────────────────────────────────┘
  ↓
┌─ TAB "KẾT QUẢ" ───────────────────────────────────┐
│ 1. Nhấn "Chạy ngay" hoặc tự động chạy           │
│    ↓                                              │
│ 2. Background gửi prompt tới ChatGPT tab        │
│    ↓                                              │
│ 3. Content Script nhập prompt vào input field  │
│    ↓                                              │
│ 4. Content Script nhấn "Send"                   │
│    ↓                                              │
│ 5. ChatGPT xử lý (5-10 giây)                    │
│    ↓                                              │
│ 6. Content Script đọc kết quả                   │
│    ↓                                              │
│ 7. Hiển thị kết quả trên popup                  │
└──────────────────────────────────────────────────┘
  ↓
END
```

---

## CẬP NHẬT & SỰA LỖI

### Reload Extension
- Vào chrome://extensions
- Tìm "ChatGPT Assistant"
- Nhấn nút ⟳ Reload

### Clear Storage (Xóa cấu hình)
- Vào tab "Cấu hình"
- Nhấn nút "Reset"

### Uninstall Extension
- chrome://extensions
- Tìm extension
- Nhấn nút 🗑️ Remove

---

## GHI CHÚ QUAN TRỌNG

⚠️ **CẢNH BÁO**:
- Extension cần ChatGPT tab luôn mở
- Nếu đóng tab, extension sẽ không hoạt động
- Cần đăng nhập ChatGPT
- Một số prompt có thể cần thêm thời gian xử lý

✅ **BEST PRACTICES**:
- Giữ ChatGPT tab ở ngoài (nhìn thấy được)
- Giữ prompt ngắn gọn
- Không đặt interval quá nhanh
- Kiểm tra kết quả trước khi sử dụng

---

Chúc bạn sử dụng Extension hiệu quả! 🚀
