# Extension Configuration Examples

Dưới đây là những ví dụ cấu hình cho những mục đích khác nhau:

## Ví dụ 1: Tóm tắt Tin Tức

**Prompt:**
```
Hãy tóm tắt 3 tin tức công nghệ mới nhất theo cách ngắn gọn và dễ hiểu
```

**Cài đặt:**
- Chạy tự động: ✓ Có
- Khoảng thời gian: 30 phút

---

## Ví dụ 2: Giải Thích Khái Niệm

**Prompt:**
```
Giải thích khái niệm "Machine Learning" với 5 điểm chính
```

**Cài đặt:**
- Chạy tự động: ✗ Không
- Dùng "Chạy ngay" để xem kết quả

---

## Ví dụ 3: Tạo Code

**Prompt:**
```
Viết một function Python để tính tổng của một list số
```

**Cài đặt:**
- Chạy tự động: ✓ Có
- Khoảng thời gian: 15 phút

---

## Ví dụ 4: Brainstorm Ý Tưởng

**Prompt:**
```
Đưa ra 3 ý tưởng sáng tạo để cải thiện ứng dụng mobile
```

**Cài đặt:**
- Chạy tự động: ✗ Không
- Chạy thủ công khi cần

---

## Ví dụ 5: Dịch Văn Bản

**Prompt:**
```
Dịch câu này sang Tiếng Anh: "Xin chào, tôi là một lập trình viên"
```

**Cài đặt:**
- Chạy tự động: ✗ Không
- Lấy kết quả ngay lập tức

---

## Prompt Pattern Tốt Nhất

### Pattern 1: Yêu Cầu Rõ Ràng
```
[Hành động] + [Chủ đề] + [Format]

"Tóm tắt + Machine Learning + 3 điểm chính"
```

### Pattern 2: Yêu Cầu Có Ví Dụ
```
"Giải thích Regular Expression bằng ví dụ code"
```

### Pattern 3: Yêu Cầu Cấu Trúc
```
"Liệt kê 5 bước để học Python từ cơ bản đến nâng cao"
```

---

## Tips Tối Ưu Performance

### Cho Prompt Ngắn (< 10 từ)
- **Thời gian chờ**: 3-5 giây
- **Độ chính xác**: Cao
- **Ví dụ**: "Hãy viết code FizzBuzz"

### Cho Prompt Trung Bình (10-30 từ)
- **Thời gian chờ**: 5-10 giây
- **Độ chính xác**: Cao
- **Ví dụ**: "Giải thích sự khác biệt giữa var, let, const trong JavaScript"

### Cho Prompt Dài (> 30 từ)
- **Thời gian chờ**: 10-20 giây
- **Độ chính xác**: Trung bình
- **Ví dụ**: "Hãy tạo một kế hoạch học tập 3 tháng để trở thành Full-Stack Developer"

---

## Những Prompt Không Nên Dùng

```
❌ "Gì chứ?"              → Quá mơ hồ
❌ ""                     → Trống
❌ "..."                  → Không có nội dung
❌ "Mọi thứ"              → Quá rộng
❌ "Hahaha"               → Không phải câu hỏi
❌ "Tôi muốn..."          → Thiếu chi tiết
```

---

## Scheduling Best Practices

| Loại Prompt | Interval Tối Ưu | Ghi Chú |
|------------|-----------------|--------|
| Tóm tắt tin tức | 30 phút | Có thể chạy thường xuyên |
| Giải thích khái niệm | 5 phút | Dùng cho test |
| Tạo code | 15 phút | Chạy thủ công tốt hơn |
| Brainstorm | 10 phút | Nên chạy thủ công |
| Dịch thuật | 1 phút | Nhanh, có thể tự động |

---

## Ứng Dụng Thực Tế

### Use Case 1: Học Tập
- Prompt: "Giải thích bài học ngày hôm nay"
- Interval: Hàng ngày, 8 giờ sáng
- Lợi ích: Ôn tập kiến thức

### Use Case 2: Phát Triển Code
- Prompt: "Review code và gợi ý cải thiện"
- Interval: Chạy thủ công
- Lợi ích: Feedback nhanh

### Use Case 3: Content Creation
- Prompt: "Viết một bài blog về [chủ đề]"
- Interval: 2-3 lần/tuần
- Lợi ích: Tạo content tự động

### Use Case 4: Nghiên Cứu
- Prompt: "Tóm tắt các bài báo khoa học về [chủ đề]"
- Interval: Hàng tuần
- Lợi ích: Cập nhật thông tin

---

## Advanced Tips

### Tip 1: Chaining Prompts
Nếu kết quả của prompt này cần input cho prompt tiếp theo:
1. Chạy prompt 1, lấy kết quả
2. Chỉnh sửa prompt 2 dựa vào kết quả 1
3. Chạy prompt 2

### Tip 2: Template Prompts
Tạo các template prompt để tái sử dụng:
- Template: "Giải thích {topic} bằng {format}"
- Chỉ cần thay đổi {topic} và {format}

### Tip 3: Multi-Step Automation
Nếu muốn tự động hóa nhiều bước:
1. Tạo nhiều prompt khác nhau
2. Chạy lần lượt từng prompt
3. Lưu kết quả mỗi lần

---

Hãy thử các ví dụ trên và điều chỉnh theo nhu cầu! 🎯
