# Debug: Tại sao phải login lại mỗi lần reload extension?

> **Vấn đề**: Mỗi lần reload extension, bạn phải đăng nhập lại  
> **Nguyên nhân**: Session token không được persist trong chrome.storage.local  
> **Date**: January 24, 2026

---

## 🔍 Các bước để tìm nguyên nhân

### Bước 1: Kiểm tra Session Token trong Storage

1. **Mở Side Panel** (extension của bạn)
2. **F12 → Console**
3. **Copy và paste code sau vào Console**:

```javascript
chrome.storage.local.get(null, (items) => {
  console.log('=== STORAGE INSPECTION ===');
  console.log('All items:', items);
  
  const tokenKeys = Object.keys(items).filter(k => k.includes('auth-token'));
  console.log('Auth token keys:', tokenKeys);
  
  if (tokenKeys.length === 0) {
    console.error('❌ NO TOKEN IN STORAGE!');
  } else {
    tokenKeys.forEach(key => {
      const token = JSON.parse(items[key]);
      console.log('✅ Token found:', key);
      console.log('  User:', token.user?.email);
      console.log('  Expires:', new Date(token.expires_at * 1000).toLocaleString());
    });
  }
});
```

4. **Kết quả mong đợi**:
   - ✅ **CÓ token**: Key như `sb-abcdefgh-auth-token` với user info
   - ❌ **KHÔNG có token**: Đây là vấn đề - token không được lưu

---

### Bước 2: Test Flow Hoàn Chỉnh

#### Test A: Login và kiểm tra storage

1. **Đăng nhập** vào extension
2. **Ngay sau khi login**, chạy code ở Bước 1
3. **Kết quả**:
   - ✅ Có token → Tiếp tục Test B
   - ❌ Không có token → **VẤN ĐỀ: chromeStorageAdapter không hoạt động**

#### Test B: Reload extension và kiểm tra

1. **Đi đến** `chrome://extensions`
2. **Click "Reload"** trên ChatGPT Assistant
3. **Mở lại Side Panel**
4. **Chạy code ở Bước 1 lại**
5. **Kết quả**:
   - ✅ Vẫn có token, vẫn đăng nhập → **HOẠT ĐỘNG ĐÚNG**
   - ❌ Không có token, phải login lại → **VẤN ĐỀ: Token bị xóa**

---

## 🐛 Các nguyên nhân có thể

### Nguyên nhân 1: chromeStorageAdapter không được sử dụng

**Triệu chứng**: Token không bao giờ được lưu vào chrome.storage.local

**Kiểm tra**:
```bash
# Kiểm tra config
grep -A5 "auth: {" src/supabaseConfig.js
```

**Mong đợi thấy**:
```javascript
auth: {
  storage: chromeStorageAdapter, // ← QUAN TRỌNG
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
  flowType: 'implicit',
}
```

**Fix**: Đã được implement ở line 147 trong `src/supabaseConfig.js` ✅

---

### Nguyên nhân 2: chromeStorageAdapter có bug

**Triệu chứng**: Token được lưu nhưng không đọc được lại

**Kiểm tra**: Xem Service Worker logs

```bash
# 1. Đi đến chrome://extensions
# 2. Click "Inspect Service Worker" trên extension
# 3. Xem Console cho errors như:
#    - "chromeStorageAdapter.setItem error"
#    - "chromeStorageAdapter.getItem error"
```

**Fix**: Kiểm tra implementation trong `src/supabaseConfig.js` lines 65-129

---

### Nguyên nhân 3: Extension ở chế độ "unpacked"

**Triệu chứng**: Token persist qua reload extension nhưng KHÔNG persist qua restart Chrome

**Giải thích**: Chrome có bug - `chrome.storage.local` trong unpacked extension có thể bị clear khi restart Chrome

**Fix**: 
- Test với packed extension (`.crx` file)
- Hoặc chấp nhận là dev environment behavior

---

### Nguyên nhân 4: Supabase getUser() fails silently

**Triệu chứng**: Token có trong storage nhưng auth check trả về "not authenticated"

**Kiểm tra**: Service Worker logs

```javascript
// Trong Service Worker console
// Look for:
"Handling SUPABASE_AUTH_CHECK"
"Auth check: authenticated" // ✅ Good
// hoặc
"Auth check: no user" // ❌ Problem
```

**Fix**: Check handler trong `src/background/handlers/supabaseAuth.js` line 254-323

---

## 🔧 Giải pháp khẩn cấp

### Solution 1: Thêm logging để debug

Thêm logging vào `chromeStorageAdapter.setItem()`:

```javascript
async setItem(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    logger.debug(`chromeStorageAdapter.setItem: ${key}`);
    
    // ✅ THÊM: Verify ngay sau khi set
    const verify = await chrome.storage.local.get([key]);
    if (verify[key]) {
      logger.info(`✅ Token saved successfully: ${key}`);
    } else {
      logger.error(`❌ Token NOT saved: ${key}`);
    }
  } catch (error) {
    logger.error('chromeStorageAdapter.setItem error', { key, error: error.message });
    throw error;
  }
}
```

---

### Solution 2: Thêm getSession() fallback

Thêm vào `SUPABASE_AUTH_CHECK` handler:

```javascript
// Try getUser() first
let result = await supabase.auth.getUser();

if (result.error || !result.data.user) {
  // Fallback: Try getSession()
  logger.warn('getUser() failed, trying getSession()');
  const sessionResult = await supabase.auth.getSession();
  
  if (sessionResult.data.session) {
    result = { data: { user: sessionResult.data.session.user } };
  }
}
```

---

### Solution 3: Manual session restoration

Thêm vào `src/background/index.js` startup:

```javascript
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Extension startup - checking auth session');
  
  // Force Supabase to restore session from storage
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    logger.info('✅ Session restored on startup', { 
      userId: session.user.id,
      email: session.user.email 
    });
  } else {
    logger.warn('⚠️ No session found on startup');
  }
});
```

---

## 📝 Quick Test Script

Copy file `debug-auth-session.js` vào Console để chạy:

```bash
# 1. Đăng nhập vào extension
# 2. F12 → Console (trong Side Panel)
# 3. Copy toàn bộ nội dung file debug-auth-session.js
# 4. Paste vào Console và Enter
# 5. Xem output để tìm vấn đề
```

---

## ✅ Checklist để verify fix

- [ ] 1. Login vào extension
- [ ] 2. Chạy debug script → Thấy token trong storage
- [ ] 3. Reload extension (chrome://extensions)
- [ ] 4. Chạy debug script lại → Vẫn thấy token
- [ ] 5. Mở Side Panel → Không phải login lại ✅

---

## 🎯 Next Steps

1. **Run debug script** để xác định vấn đề cụ thể
2. **Check Service Worker logs** (`chrome://extensions` → Inspect Service Worker)
3. **Report kết quả** để tôi có thể fix đúng nguyên nhân

---

## 📚 Related Files

- `src/supabaseConfig.js` - chromeStorageAdapter config (line 147)
- `src/background/handlers/supabaseAuth.js` - Auth handlers (line 254)
- `src/ui/auth.js` - checkAuthStatus() (line 20)
- `src/ui/index.js` - Session restoration on init (line 20)
- `debug-auth-session.js` - Debug script

---

**END OF DOCUMENT**

