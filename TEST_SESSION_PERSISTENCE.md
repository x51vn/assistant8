# Test Session Persistence Fix - Hướng dẫn Chi Tiết

> **Fix**: Thêm `restoreSessionOnServiceWorkerStart()` vào `src/background/index.js`  
> **Nguyên nhân**: Session token không được restore khi Service Worker reload  
> **Status**: ✅ Code đã được fix và build thành công  

---

## 🔧 Chi tiết Fix

### Vấn đề Gốc
- Khi User login → Token được lưu vào `chrome.storage.local` via `chromeStorageAdapter`
- **NHƯNG** khi Service Worker reload (extension reload hoặc browser restart) → Token không được tự động restore
- UI gọi `checkAuthStatus()` → Backend handler `SUPABASE_AUTH_CHECK` chạy → Supabase không tìm thấy session
- Kết quả: **User phải login lại**

### Giải Pháp
Thêm automatic session restoration vào 2 vị trí:

#### 1. **Khi Service Worker Start/Reload**
```javascript
// src/background/index.js (line 50)
logger.info('Service Worker loaded - attempting to restore session...');
restoreSessionOnServiceWorkerStart().catch(error => {
  logger.error('Failed to restore session on SW start', { error: error.message });
});
```

**Lợi ích**:
- Restore session ngay khi extension reload
- User không phải wait cho UI load
- Token validation xảy ra trước UI check

#### 2. **Khi Browser Start**
```javascript
// src/background/index.js onStartup() (line 198)
await restoreSessionOnStartup();
```

**Lợi ích**:
- Restore session khi browser restart
- Ensure session không mất qua browser lifecycle

#### 3. **Hàm Restoration**
```javascript
async function restoreSessionOnServiceWorkerStart() {
  try {
    // Force Supabase to read session from chrome.storage.local
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (session && session.user) {
      logger.info('✅ Auth session restored', { 
        userId: session.user.id,
        email: session.user.email
      });
      
      // Broadcast to UI
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
        data: {
          authenticated: true,
          event: 'SESSION_RESTORED',
          user: { ... }
        }
      });
    }
  } catch (error) {
    logger.error('Session restoration failed', { error: error.message });
  }
}
```

---

## 🧪 Test Chi Tiết

### Bước 1: Build Extension

```bash
cd /home/beou/IdeaProjects/chatgpt-assistant
npm run build
```

✅ Output:
```
✓ built in 1.18s
dist/background.js   232.78 kB │ gzip: 61.62 kB
```

---

### Bước 2: Load Extension vào Chrome

1. Mở Chrome
2. Đi tới `chrome://extensions`
3. **Disable** ChatGPT Assistant nếu đang enable
4. Click **"Load unpacked"**
5. Select folder `dist/`
6. ✅ Extension loaded

---

### Bước 3: Test Login Flow

#### Test 3A: Đăng nhập lần đầu

```
1. Click extension icon (ChatGPT Assistant)
2. Side panel mở
3. Thấy login screen
4. Enter email: test@example.com
5. Enter password: (your password)
6. Click "Đăng nhập"
7. ✅ EXPECT: Main UI appears (Portfolio, History, etc.)
```

---

### Bước 4: Verify Token Saved

Ngay sau login, chạy script này trong DevTools Console (F12):

```javascript
chrome.storage.local.get(null, (items) => {
  console.log('=== CHECKING TOKEN ===');
  
  const tokenKeys = Object.keys(items).filter(k => k.includes('auth-token'));
  
  if (tokenKeys.length === 0) {
    console.error('❌ NO TOKEN FOUND!');
    return;
  }
  
  console.log('✅ Token found:', tokenKeys[0]);
  
  tokenKeys.forEach(key => {
    const token = JSON.parse(items[key]);
    console.log('User:', token.user.email);
    console.log('Expires:', new Date(token.expires_at * 1000).toLocaleString());
  });
});
```

✅ **Expected Output**:
```
=== CHECKING TOKEN ===
✅ Token found: sb-abcdefgh-auth-token
User: test@example.com
Expires: Jan 24, 2026, 11:00:00 PM
```

---

### Bước 5: Reload Extension

**Method A: Via chrome://extensions**
1. Go to `chrome://extensions`
2. Find ChatGPT Assistant
3. Click **"Reload"** button (circular arrow)
4. Wait 2-3 seconds

**Method B: Via DevTools**
1. F12 → Open DevTools
2. Go to `chrome://extensions` in NEW tab
3. Click Reload

---

### Bước 6: Verify Session Persistence

**Immediately after reload**:

1. ✅ **Check Service Worker Logs**:
   - `chrome://extensions` → ChatGPT Assistant → Click **"Inspect Service Worker"**
   - Console should show:
     ```
     Service Worker loaded - attempting to restore session...
     ✅ Auth session restored
     User: test@example.com
     ```

2. ✅ **Open Side Panel** (extension icon):
   - Click ChatGPT Assistant icon
   - ✅ **EXPECT**: NO login screen
   - ✅ **EXPECT**: Main UI visible (Portfolio, History, etc.)
   - ✅ **EXPECT**: User still logged in

3. ✅ **Verify Token Still in Storage**:
   ```javascript
   chrome.storage.local.get(null, (items) => {
     const tokenKeys = Object.keys(items).filter(k => k.includes('auth-token'));
     console.log(tokenKeys.length > 0 ? '✅ TOKEN STILL SAVED' : '❌ TOKEN LOST');
   });
   ```

---

### Bước 7: Test Browser Restart

1. **Close Chrome completely**:
   - File → Exit Chrome (or Ctrl+Q)
   - Wait 5 seconds

2. **Reopen Chrome**:
   - Click Chrome icon
   - Wait for Chrome to fully load

3. **Click extension icon**:
   - ✅ **EXPECT**: User still logged in
   - ✅ **EXPECT**: NO login screen

---

### Bước 8: Test Service Worker Crash Simulation

1. Open DevTools: F12
2. Go to `chrome://extensions` in another tab
3. Click **"Inspect Service Worker"** on ChatGPT Assistant
4. In Service Worker console, close it (this simulates SW crash)
5. Back to Side Panel → Click any tab (triggers message to background)
6. Service Worker wakes up automatically
7. ✅ **EXPECT**: Data loads, no auth error

---

## 🔍 Debug Commands

### Check if restoration is working:

**In Service Worker Console**:
```bash
chrome://extensions → ChatGPT Assistant → Inspect Service Worker → Console
```

Look for log messages like:
```
Service Worker loaded - attempting to restore session...
✅ Auth session restored
  userId: user123
  email: test@example.com
```

### Check token format:

```javascript
chrome.storage.local.get(null, (items) => {
  const key = Object.keys(items).find(k => k.includes('auth-token'));
  if (key) {
    const token = JSON.parse(items[key]);
    console.log(JSON.stringify(token, null, 2));
  }
});
```

### Manually trigger getSession():

```javascript
// Run in Service Worker Console
await chrome.runtime.sendMessage({
  v: 1,
  type: 'SUPABASE_AUTH_CHECK',
  correlationId: 'debug-' + Date.now(),
  timestamp: Date.now()
});
```

---

## ✅ Expected Results

| Test | Expected | Actual |
|------|----------|--------|
| Login → Token saved | ✅ Token in storage | ? |
| Reload extension | ✅ Still logged in | ? |
| Reload again | ✅ Still logged in | ? |
| Restart Chrome | ✅ Still logged in | ? |
| SW crash → recover | ✅ Auto-restore | ? |

---

## 📋 Checklist Completion

Hãy report cho tôi kết quả:

- [ ] 1. **Build thành công**: `npm run build` exit code 0
- [ ] 2. **Extension loaded**: Vào `chrome://extensions` thấy ChatGPT Assistant
- [ ] 3. **Login successful**: Đăng nhập và thấy main UI
- [ ] 4. **Token saved**: Chạy storage script thấy token
- [ ] 5. **After reload**: Vẫn đăng nhập, KHÔNG phải login lại
- [ ] 6. **SW logs**: Thấy "✅ Auth session restored"
- [ ] 7. **Browser restart**: Still logged in
- [ ] 8. **SW recovery**: Data loads without errors

---

## 🆘 Troubleshooting

### Nếu vẫn phải login lại sau reload:

**Kiểm tra 1**: Hàm restoration có được gọi không?
```
1. chrome://extensions → Inspect Service Worker
2. Xem có log "Service Worker loaded - attempting to restore session..." không?
3. Nếu KHÔNG → Code không được load đúng, rebuild: npm run build
```

**Kiểm tra 2**: Token có được lưu không?
```
1. Sau login, chạy: chrome.storage.local.get(null, console.log)
2. Xem có key "sb-...auth-token" không?
3. Nếu KHÔNG → Supabase không dùng chromeStorageAdapter
```

**Kiểm tra 3**: getSession() trả về gì?
```
// Trong Service Worker console, run:
const { data, error } = await supabase.auth.getSession();
console.log('Session:', data);
console.log('Error:', error);
```

---

## 📝 Files Changed

- `src/background/index.js`:
  - Line 5: Added `import { MESSAGE_TYPES }`
  - Line 50: Added `restoreSessionOnServiceWorkerStart()` call
  - Line 198: Added `await restoreSessionOnStartup()` in onStartup()
  - Line 350+: Added full `restoreSessionOnServiceWorkerStart()` function
  - Line 200+: Added full `restoreSessionOnStartup()` function

---

## 🎯 Next Steps

1. ✅ Build: `npm run build`
2. ✅ Load extension in Chrome
3. ✅ Run tests above
4. ✅ Report results

Let's go! 🚀

