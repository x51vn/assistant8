# Content Script Not Ready - Troubleshooting Guide

## 🔴 Lỗi: "Content script not ready after max retries"

### **Mô tả vấn đề**

Extension không thể kết nối với content script chạy trên tab ChatGPT. Điều này khiến:
- ❌ Không thể nhập prompt vào ChatGPT
- ❌ Không thể lấy response từ ChatGPT  
- ❌ `chat_id` bị NULL → lỗi database (đã fix)

### **Nguyên nhân phổ biến**

1. **Extension chưa được reload sau khi build**
   - Build mới nhưng Chrome vẫn dùng code cũ
   
2. **Tab ChatGPT mở trước khi extension load**
   - Content script không được inject vào tabs đã tồn tại trước

3. **Content script bị lỗi JavaScript**
   - Syntax error hoặc runtime error trong `content.js`

4. **Manifest.json không match URL**
   - Pattern `https://chatgpt.com/*` không match URL thực tế

5. **ChatGPT redirect sang domain khác**
   - Ví dụ: `chatbot-ui.com` (đã được detect và redirect lại)

---

## ✅ **Giải pháp**

### **Bước 1: Rebuild extension**

```bash
cd /home/beou/IdeaProjects/chatgpt-assistant
npm run build
```

### **Bước 2: Reload extension trong Chrome**

```
1. Vào chrome://extensions
2. Tìm "ChatGPT Assistant"  
3. Bấm nút Reload (⟳)
```

### **Bước 3: Đóng và mở lại tab ChatGPT**

```
1. Đóng TẤT CẢ tabs chatgpt.com
2. Mở tab mới: https://chatgpt.com/
3. Đợi page load xong (spinner biến mất)
4. Thử gửi prompt lại
```

### **Bước 4: Kiểm tra console**

**Console của tab ChatGPT** (F12 trên tab chatgpt.com):
```javascript
// Nên thấy log này:
[ChatGPT Assistant] content script loaded at 2026-01-24T...
[ChatGPT Assistant] Location: https://chatgpt.com/
[ChatGPT Assistant] content script ready

// Test content script:
chrome.runtime.sendMessage({ action: 'ping' }, console.log);
// Nên return: { pong: true, status: 'ok', ready: true }
```

**Console của Service Worker** (chrome://extensions → Inspect Service Worker):
```javascript
// Nên thấy logs debug chi tiết
[ChatGPTSession] waitForContentScript - Tab exists tabId=..., url=..., status=complete
[ChatGPTSession] Content script ready tabId=..., attempt=1
```

---

## 🔧 **Advanced Troubleshooting**

### **Kiểm tra manifest.json**

```bash
cat dist/manifest.json | grep -A 5 content_scripts
```

Expected output:
```json
"content_scripts": [
  {
    "matches": ["https://chatgpt.com/*"],
    "js": ["content.js"],
    "all_frames": false
  }
]
```

### **Kiểm tra content.js được build**

```bash
ls -lh dist/content.js
# Nên thấy file ~40-50 KB
```

### **Inject content script thủ công (debug)**

```javascript
// Trong Service Worker console:
chrome.tabs.query({ url: 'https://chatgpt.com/*' }, async (tabs) => {
  const tabId = tabs[0]?.id;
  if (tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    console.log('Content script injected manually');
  }
});
```

---

## 📊 **Database Fix (đã implement)**

### **Migration 002: Allow NULL chat_id**

```sql
-- File: supabase/migrations/002_fix_chat_id_nullable.sql

ALTER TABLE public.chat_history 
  ALTER COLUMN chat_id DROP NOT NULL;

-- Allow multiple NULL chat_ids per user
CREATE UNIQUE INDEX unique_chat_per_user_non_null 
  ON public.chat_history (user_id, chat_id) 
  WHERE chat_id IS NOT NULL;
```

**Lý do:**
- Content script not ready → không có `chat_id`
- Vẫn muốn lưu prompt (để không mất data)
- Có thể update `chat_id` sau khi user refresh

**Apply migration:**
```bash
cd supabase
supabase db push
```

---

## 🎯 **UI Behavior (đã fix)**

### **Before fix:**
```javascript
// Luôn cố gắng lưu history → database error nếu chat_id NULL
await chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.HISTORY_ADD,
  data: { chat_id: null, ... } // ❌ Error!
});
```

### **After fix:**
```javascript
// Chỉ lưu khi có chatId hoặc chatUrl
if (response.chatId || response.chatUrl) {
  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.HISTORY_ADD,
    data: { 
      chat_id: response.chatId || null, // ✅ NULL allowed
      ... 
    }
  });
} else {
  console.warn('Skipping history save - content script not ready');
}
```

---

## 📝 **Monitoring & Logging**

### **Handler logs (Background)**

```javascript
// src/background/handlers/chatHistory.js

if (!chat_id) {
  logger.warn('Adding history without chat_id (content script may not be ready)', {
    hasUrl: !!chat_url,
    troubleshooting: 'This usually means content script was not ready'
  });
}
```

### **Content script logs**

```javascript
// src/content.js

console.log('[ChatGPT Assistant] content script loaded at', new Date().toISOString());
console.log('[ChatGPT Assistant] Location:', location.href);
```

### **Session logs**

```javascript
// src/chatgptSession.js

logger.error('Content script not ready after max retries', { 
  tabId, 
  maxRetries,
  troubleshooting: {
    possibleCauses: [...],
    solutions: [...]
  }
});
```

---

## 🔄 **Automated Recovery (đã implement)**

### **Auto-reload tab nếu content script không ready**

```javascript
// src/chatgptSession.js - ensureChatGPTTab()

if (!contentScriptReady && createIfNeeded) {
  logger.warn('Content script not ready, reloading tab');
  await chrome.tabs.reload(chatTab.id);
  
  // Wait for reload
  await waitForTabComplete(chatTab.id, 30000);
  await sleep(2000); // Wait for React
  
  // Retry ping
  const readyAfterReload = await waitForContentScript(chatTab.id);
  if (readyAfterReload) {
    return { tabId: chatTab.id, isNew: false };
  }
}
```

---

## ✅ **Verification Checklist**

Sau khi apply fixes, verify:

- [ ] Migration 002 đã apply vào Supabase
- [ ] Extension rebuild (`npm run build`)
- [ ] Extension reload trong Chrome
- [ ] Tab ChatGPT đóng và mở lại
- [ ] Content script log xuất hiện trong console
- [ ] Ping test trả về `{ pong: true }`
- [ ] Gửi prompt thành công
- [ ] History được lưu (có thể NULL chat_id)
- [ ] Không còn error `NOT NULL constraint violation`

---

## 📞 **Support**

Nếu vẫn còn lỗi:

1. **Export logs:**
   ```javascript
   // Tab ChatGPT console
   console.save = function(data, filename){
     const blob = new Blob([JSON.stringify(data)], {type: 'text/json'});
     const a = document.createElement('a');
     a.download = filename;
     a.href = window.URL.createObjectURL(blob);
     a.click();
   };
   
   console.save(window.performance.getEntries(), 'debug-logs.json');
   ```

2. **Check versions:**
   - Chrome version: `chrome://version`
   - Extension version: `dist/manifest.json` → `"version"`
   - Supabase migration: `select version from supabase_migrations.schema_migrations order by version desc limit 1;`

3. **Test content script isolation:**
   ```bash
   # Build với source maps
   npm run build -- --sourcemap
   ```

---

**Last Updated:** January 24, 2026  
**Status:** ✅ Fixed - Migration applied, handlers updated, UI improved
