# Supabase Setup Guide

## 🚨 Vấn đề: "Invalid API key"

Nếu bạn thấy lỗi này, có nghĩa Supabase credentials trong file `.env` không hợp lệ.

### Nguyên nhân phổ biến:

1. ❌ **ANON_KEY quá ngắn** - Placeholder giả thay vì key thật
2. ❌ **URL sai format** - Không phải `https://your-project.supabase.co`
3. ❌ **Copy sai key** - Thiếu ký tự hoặc copy nhầm key khác

---

## ✅ Cách lấy Supabase Credentials ĐÚNG

### Bước 1: Truy cập Supabase Dashboard

1. Vào https://app.supabase.com/
2. Đăng nhập với GitHub account
3. Chọn project của bạn (hoặc tạo project mới)

### Bước 2: Lấy API Keys

1. Vào **Settings** (⚙️) trong sidebar trái
2. Chọn **API** section
3. Bạn sẽ thấy:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon public key**: Một JWT token DÀI (~200-300 ký tự)

### Bước 3: Kiểm tra Key hợp lệ

✅ **ĐÚNG** - Anon key thật:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncWZ4a2xsZWVrbml1dWpvaGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODk1MzQ3MjYsImV4cCI6MjAwNTExMDcyNn0.abcdef1234567890abcdef1234567890abcdef1234567890
```
- Độ dài: 200-300 ký tự
- Bắt đầu: `eyJ...`
- Có 2 dấu chấm (`.`) chia thành 3 phần (JWT format)

❌ **SAI** - Placeholder giả:
```
sb_anon_uB062_uBZE4hZll6xDu1XA_Nd8GUHiX
```
- Độ dài: < 100 ký tự
- Không phải JWT format
- Đây là giá trị demo/placeholder

### Bước 4: Cập nhật file .env

```bash
# File: .env
VITE_SUPABASE_URL=https://ugqfxklleekniuujohcm.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncWZ4a2xsZWVrbml1dWpvaGNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODk1MzQ3MjYsImV4cCI6MjAwNTExMDcyNn0.abcdef1234567890abcdef1234567890abcdef1234567890
```

**⚠️ LƯU Ý:**
- Không có khoảng trắng trước/sau `=`
- Key phải trên 1 dòng (không xuống dòng)
- Không có dấu ngoặc kép

### Bước 5: Rebuild Extension

```bash
npm run build
```

### Bước 6: Reload Extension trong Chrome

1. Vào `chrome://extensions`
2. Click nút **Reload** (🔄) ở extension
3. Mở side panel lại

---

## 🔍 Validation Checks

Extension sẽ tự động kiểm tra:

✅ **URL format**: Phải là `https://*.supabase.co`  
✅ **Key length**: Anon key phải > 100 ký tự  
✅ **Placeholder detection**: Không chứa "your-project" hoặc "your-anon-key"

Nếu validation fail, bạn sẽ thấy error cụ thể trong console.

---

## 🐛 Debug

### Kiểm tra .env được load:

```bash
# Trong terminal
cat .env
```

### Kiểm tra trong extension console:

1. `chrome://extensions` → **Inspect views: Service worker**
2. Console sẽ hiện:
```
[Supabase] Supabase configuration validated url="https://...", anonKeyLength=243
```

### Các lỗi phổ biến:

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| "Invalid API key" | ANON_KEY sai | Copy lại key từ Supabase Dashboard |
| "Invalid URL format" | URL không đúng `.supabase.co` | Kiểm tra lại Project URL |
| "Too short" | Key < 100 chars | Đang dùng placeholder, lấy key thật |
| "Auth session missing" | Chưa login | Bình thường, cần login vào extension |

---

## 📚 Thông tin thêm

- **Supabase Docs**: https://supabase.com/docs
- **API Settings**: https://app.supabase.com/project/_/settings/api
- **Security**: Anon key an toàn để dùng client-side (có Row Level Security)

---

## ❓ FAQ

**Q: Anon key có bị lộ không?**  
A: Không sao! Anon key được thiết kế để dùng public. RLS (Row Level Security) bảo vệ data.

**Q: Có cần Service Role key không?**  
A: Không. Extension chỉ cần Anon key + URL.

**Q: Key hết hạn không?**  
A: Không. Anon key không expire. Nhưng có thể regenerate nếu cần.

---

**Status**: ✅ Updated January 24, 2026
