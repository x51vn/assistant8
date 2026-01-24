# 🔄 Hướng dẫn Reload Extension

## Bước 1: Vào Chrome Extensions

1. Mở Chrome browser
2. Vào: `chrome://extensions`
3. Tìm extension **ChatGPT Assistant**

## Bước 2: Reload Extension

Có 2 cách:

### Cách 1: Click nút Reload (🔄)
- Tìm extension trong list
- Click nút **🔄 Reload** (ở góc phải)

### Cách 2: Toggle On/Off
- Tắt extension (toggle OFF)
- Đợi 2 giây
- Bật lại (toggle ON)

## Bước 3: Đóng tất cả Side Panel cũ

- Đóng tất cả các tab/window có side panel đang mở
- Đóng Chrome DevTools nếu đang mở

## Bước 4: Mở Side Panel mới

1. Click extension icon trên toolbar
2. Side panel sẽ mở với UI mới
3. Bạn sẽ thấy **Login form**

## Bước 5: Kiểm tra Console

### Service Worker Console:
1. `chrome://extensions`
2. Click **Inspect views: Service worker**
3. Xem log:

✅ **ĐÚNG** - Không còn lỗi "Invalid API key":
```
[Supabase] Supabase configuration validated url="...", anonKeyLength=205
[Background] Background service worker starting...
```

❌ **SAI** - Vẫn có "Invalid API key":
```
[App] supabase.auth.signInWithPassword failed ... "Invalid API key"
```

### Side Panel Console:
1. Mở side panel
2. Right-click trong panel → **Inspect**
3. Xem tab Console

✅ **ĐÚNG** - Thấy login form:
```
[Auth] Rendering login screen
```

❌ **SAI** - "Container not found":
```
[Categories] Container not found
[Prompts] Container not found
```

---

## 🎯 Nếu vẫn lỗi "Container not found"

Có thể do cache. Thử:

### Option 1: Hard Refresh
1. Mở side panel
2. Inspect (F12)
3. Right-click nút Reload
4. Chọn **Empty Cache and Hard Reload**

### Option 2: Clear Extension Storage
```javascript
// Trong Service Worker console
chrome.storage.local.clear().then(() => {
  console.log('Storage cleared');
});
```

### Option 3: Reinstall Extension
1. Xóa extension hoàn toàn
2. Load unpacked lại từ `dist/` folder

---

## ✅ Success Indicators

Sau khi reload, bạn sẽ thấy:

1. ✅ Service Worker console: "Supabase configuration validated"
2. ✅ Side panel hiển thị **Login form**
3. ✅ Không có lỗi "Invalid API key"
4. ✅ "Auth session missing" là OK (chưa login)

---

**Next**: Login với email/password Supabase để test!
