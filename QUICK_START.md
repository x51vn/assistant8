# QUICK START (Bắt đầu nhanh)

## 30 Giây để setup

### 1. Cài đặt Extension (2 phút)
```
1. Mở Chrome → chrome://extensions/
2. Bật "Developer mode" (góc phải)
3. "Load unpacked" → Chọn thư mục chatgpt-extension
4. DONE!
```

### 2. Cấu hình Prompt (1 phút)
```
1. Nhấp icon extension
2. Chuyển sang tab "Cấu hình"
3. Nhập prompt: "Hãy giải thích AI là gì"
4. Nhấn "Lưu cấu hình"
```

### 3. Chạy & Xem Kết quả (30 giây)
```
1. Chuyển sang tab "Kết quả"
2. Nhấn "Chạy ngay"
3. Chờ 10 giây
4. Kết quả sẽ hiển thị ✓
```

---

## Nhanh chóng Reference

| Hành động | Cách làm |
|-----------|---------|
| **Mở popup** | Nhấp icon extension ở thanh công cụ |
| **Lưu prompt** | Tab "Cấu hình" → Nhập → Nhấn "Lưu cấu hình" |
| **Chạy ngay** | Tab "Kết quả" → Nhấn "Chạy ngay" |
| **Làm mới kết quả** | Nhấn "Làm mới" |
| **Chạy tự động** | "Cấu hình" → Bật "Chạy tự động" → Lưu |
| **Reset** | Tab "Cấu hình" → Nhấn "Reset" |

---

## Những điều cần biết

✅ **Phải làm**:
- Giữ ChatGPT tab mở
- Đăng nhập ChatGPT
- Dùng prompt ngắn rõ ràng
- Chờ 5-10 giây cho kết quả

❌ **Không được làm**:
- Đóng tab ChatGPT
- Đổi prompt khi đang chạy
- Chạy quá nhanh (< 1 phút)
- Reload page ChatGPT

---

## Ví dụ Prompt Tốt

```
✓ "Hãy viết code Python để tính Fibonacci"
✓ "Tóm tắt Machine Learning là gì?"
✓ "Giải thích khác biệt giữa AI và Machine Learning"
✓ "Tạo một bài toán về Đại số tuyến tính"

✗ "Gì chứ?"
✗ "Mọi thứ"
✗ "..."
✗ (trống)
```

---

## Nếu Có Lỗi

| Lỗi | Giải pháp |
|-----|----------|
| "Không lấy được kết quả" | Kiểm tra ChatGPT tab mở, reload extension |
| "Prompt không gửi" | Kiểm tra prompt không trống, ChatGPT đã load |
| "Extension chưa hiện" | Reload chrome://extensions |
| "Kết quả sai" | Chờ thêm, ChatGPT đang xử lý |

---

## Tệp Quan Trọng

```
📄 manifest.json       ← Cấu hình chính
📄 background.js       ← Logic nền
📄 content.js          ← Tương tác ChatGPT
📄 popup.html/js       ← Giao diện người dùng
📄 styles.css          ← Styling
📁 images/             ← Icons
```

---

## Phím Tắt Hữu Ích

| Phím | Chức năng |
|------|----------|
| F12 | Mở DevTools (xem lỗi) |
| Ctrl+Shift+I | Kiểm tra element |
| chrome://extensions | Quản lý extension |
| chrome://storage | Xem saved data |

---

**Thêm chi tiết**: Xem file `INSTALL.md` hoặc `README.md` 📚
