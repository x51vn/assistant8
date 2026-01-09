# Hướng dẫn Sử dụng - ChatGPT Extension v2.0

## 🎯 Tổng quan

Extension giúp bạn:
- ✅ Tự động gửi prompt tới ChatGPT
- 📝 Lưu lịch sử chat để xem lại
- 🐛 Theo dõi và quản lý lỗi
- ⚙️ Tự động chạy định kỳ

## 🚀 Bắt đầu nhanh

### Cài đặt
1. Build: `npm run build`
2. Load extension từ thư mục `dist`
3. Click vào icon extension

### Sử dụng cơ bản
1. Vào tab **Cấu hình**, nhập prompt
2. Nhấn **Lưu cấu hình**
3. Quay lại tab **Kết quả**, nhấn **Chạy ngay**
4. Đợi kết quả hiển thị

## 📚 Chi tiết các Tab

### 1. Tab Kết quả
**Mục đích**: Chạy prompt và xem kết quả ngay lập tức

**Các nút**:
- **Chạy ngay**: Gửi prompt đến ChatGPT
- **Làm mới**: Cập nhật kết quả mới nhất

**Lưu ý**:
- Kết quả được cache, load rất nhanh
- Mỗi lần chạy sẽ tự động lưu vào lịch sử

### 2. Tab Lịch sử
**Mục đích**: Xem lại các chat đã thực hiện

**Tính năng**:
- Hiển thị 100 chat gần nhất
- Mỗi item hiển thị:
  - Thời gian (VD: "5 phút trước")
  - Chat ID (để tham chiếu)
  - Prompt đã gửi
  - Response nhận được (rút gọn)

**Thao tác**:
- Click vào bất kỳ item nào để xem chi tiết đầy đủ
- Nút 🔄 để làm mới danh sách

### 3. Tab Lỗi
**Mục đích**: Quản lý danh sách lỗi đã gặp

**Thêm lỗi mới**:
1. Nhấn **+ Thêm lỗi**
2. Điền thông tin:
   - **Tiêu đề**: Tóm tắt lỗi (bắt buộc)
   - **Mô tả**: Chi tiết lỗi
   - **Loại**: Chung/Prompt/Response/Kết nối/Timeout
   - **Mức độ**: Thấp/Trung bình/Cao/Nghiêm trọng
3. Nhấn **Lưu**

**Sửa lỗi**:
1. Nhấn nút ✏️ trên lỗi cần sửa
2. Cập nhật thông tin
3. Nhấn **Lưu**

**Xóa lỗi**:
1. Nhấn nút 🗑️ trên lỗi cần xóa
2. Xác nhận xóa

**Màu sắc**:
- 🟢 Xanh: Mức độ thấp
- 🟡 Vàng: Mức độ trung bình
- 🟠 Cam: Mức độ cao
- 🔴 Đỏ: Mức độ nghiêm trọng

### 4. Tab Cấu hình
**Mục đích**: Thiết lập prompt và chế độ tự động

**Các trường**:
- **Prompt**: Nội dung gửi tới ChatGPT
- **Chạy tự động**: Bật/tắt chế độ tự động
- **Khoảng thời gian**: Số phút giữa các lần chạy tự động

**Các nút**:
- **Lưu cấu hình**: Lưu tất cả thiết lập
- **Gửi ngay**: Gửi prompt ngay lập tức
- **Reset**: Xóa prompt và tắt tự động

## 💡 Tips & Tricks

### Giảm Lag
- ✅ Kết quả được cache tự động
- ✅ Chat-ID được lưu để fetch nhanh
- ✅ Không cần làm mới liên tục

### Theo dõi Lỗi hiệu quả
1. **Ghi nhận ngay**: Thêm lỗi ngay khi gặp
2. **Mô tả rõ ràng**: Ghi đầy đủ ngữ cảnh
3. **Phân loại đúng**: Chọn đúng loại và mức độ
4. **Review định kỳ**: Xem lại và cập nhật

### Sử dụng Lịch sử
- Tìm lại chat cũ bằng Chat ID
- So sánh response giữa các lần chạy
- Phân tích pattern lỗi từ lịch sử

### Tối ưu hóa Prompt
1. Chạy thử với prompt mới
2. Xem kết quả trong tab Kết quả
3. Nếu có lỗi, ghi nhận vào tab Lỗi
4. Cải thiện prompt dựa trên feedback
5. Lặp lại cho đến khi đạt kết quả tốt

## 🔧 Xử lý Sự cố

### Không thấy kết quả?
1. Kiểm tra ChatGPT đã mở chưa
2. Nhấn nút **Làm mới**
3. Xem tab Lỗi có lỗi mới không
4. Thử chạy lại prompt

### Lịch sử trống?
- Cần chạy prompt ít nhất 1 lần
- Lịch sử chỉ lưu chat có kết quả thành công

### Modal không đóng?
- Nhấn nút X hoặc **Hủy**
- Click vào vùng tối phía ngoài modal

### Extension không load?
1. Kiểm tra `chrome://extensions`
2. Refresh extension
3. Reload lại page ChatGPT

## 📊 Giới hạn

- **Chat History**: Tối đa 100 entries
- **Error List**: Tối đa 50 entries
- **Run History**: Tối đa 50 entries
- **Auto-run interval**: Tối thiểu 1 phút

Các giới hạn này giúp tiết kiệm storage và giữ performance tốt.

## 🆘 Support

Nếu gặp vấn đề:
1. Kiểm tra console: `F12 > Console`
2. Ghi nhận lỗi vào tab **Lỗi**
3. Tham khảo [UPDATE_v2.0.md](UPDATE_v2.0.md) để biết chi tiết kỹ thuật
