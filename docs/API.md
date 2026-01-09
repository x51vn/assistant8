# API Documentation

Tài liệu kỹ thuật cho các developer muốn mở rộng extension.

---

## Message API

Extension sử dụng Chrome Runtime Messaging API để giao tiếp giữa các thành phần.

### 1. Gửi Prompt từ Popup tới Background

**Từ**: `popup.js`  
**Đến**: `background.js`

```javascript
chrome.runtime.sendMessage({
  action: 'send_prompt',
  prompt: 'Hãy giải thích AI là gì'
}, (response) => {
  console.log('Prompt đã gửi:', response.status);
});
```

**Response:**
```json
{
  "status": "ok"
}
```

---

### 2. Lấy Kết Quả từ ChatGPT

**Từ**: `popup.js`  
**Đến**: `background.js` → `content.js`

```javascript
chrome.runtime.sendMessage({
  action: 'get_result'
}, (response) => {
  console.log('Kết quả:', response.result);
});
```

**Response:**
```json
{
  "result": "AI là trí tuệ nhân tạo..."
}
```

---

### 3. Đảm Bảo ChatGPT Mở

**Từ**: `popup.js`  
**Đến**: `background.js`

```javascript
chrome.runtime.sendMessage({
  action: 'ensure_chatgpt_open'
}, (response) => {
  console.log('ChatGPT status:', response.status);
});
```

**Response:**
```json
{
  "status": "ok"
}
```

---

## Content Script API

### 1. Nhập và Gửi Prompt

**Yêu cầu:**
```javascript
{
  "action": "input_prompt",
  "prompt": "Prompt cần gửi"
}
```

**Phản hồi:**
```javascript
{
  "status": "sent" // hoặc "failed"
}
```

**Cách hoạt động:**
1. Tìm input field (textarea hoặc contenteditable div)
2. Focus vào input
3. Set value = prompt
4. Trigger input/change events
5. Tìm nút gửi (send button)
6. Click nút gửi

---

### 2. Lấy Kết Quả

**Yêu cầu:**
```javascript
{
  "action": "get_result"
}
```

**Phản hồi:**
```javascript
{
  "result": "Nội dung kết quả từ ChatGPT"
}
```

**Cách hoạt động:**
1. Tìm tất cả messages: `[data-message-author-role]`
2. Lặp từ cuối lên đầu
3. Tìm tin nhắn có `role="assistant"`
4. Return `textContent`

---

## Storage API

Extension sử dụng Chrome Storage Local để lưu cài đặt.

### Lưu Cài Đặt

```javascript
const settings = {
  prompt: "Hãy giải thích AI",
  autoRun: true,
  interval: 5
};

await chrome.storage.local.set(settings);
```

### Lấy Cài Đặt

```javascript
const result = await chrome.storage.local.get(['prompt', 'autoRun', 'interval']);
console.log(result.prompt);     // string
console.log(result.autoRun);    // boolean
console.log(result.interval);   // number
```

### Xóa Tất Cả Cài Đặt

```javascript
await chrome.storage.local.clear();
```

---

## Alarms API

Extension sử dụng Chrome Alarms để chạy task định kỳ.

### Tạo Alarm

```javascript
chrome.alarms.create('checkChatGPT', {
  periodInMinutes: 5  // Chạy mỗi 5 phút
});
```

### Xóa Alarm

```javascript
chrome.alarms.clear('autoRunPrompt');
```

### Listening to Alarms

```javascript
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkChatGPT') {
    console.log('Alarm triggered!');
    ensureChatGPTOpen();
  }
});
```

---

## Tabs API

### Truy Vấn Tabs

```javascript
// Tìm tab ChatGPT
const tabs = await chrome.tabs.query({
  url: "https://chatgpt.com/*"
});

if (tabs.length > 0) {
  console.log('ChatGPT tab found:', tabs[0].id);
}
```

### Tạo Tab Mới

```javascript
const newTab = await chrome.tabs.create({
  url: "https://chatgpt.com",
  active: false  // Không focus
});

console.log('New tab created:', newTab.id);
```

---

## Scripting API

### Gửi Message tới Tab

```javascript
await chrome.tabs.sendMessage(tabId, {
  action: "input_prompt",
  prompt: "Your prompt here"
});
```

---

## State Diagram

```
┌─────────────────────────────────────────────────────┐
│           Extension Load                             │
└────────────────────┬────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────┐
│  background.js (Service Worker)                     │
│  - Khởi tạo alarms                                  │
│  - Lắng nghe messages                               │
│  - Quản lý ChatGPT tab                              │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ↓           ↓           ↓
      user      popup.js    content.js
      clicks    (UI)        (ChatGPT tab)
        │         │            │
        └─────────┴────────────┘
              │
              ↓
      Message Exchange
        (runtime.sendMessage)
              │
    ┌─────────┼─────────┐
    │         │         │
    ↓         ↓         ↓
 action   prompt    result
 type                 │
    │         │       ↓
    └─────────┴─────storage
              (chrome.storage)
```

---

## Manifest v3 Permissions

```json
{
  "permissions": [
    "storage",      // Chrome Storage API
    "tabs",         // Chrome Tabs API
    "scripting"     // Chrome Scripting API
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*"
  ]
}
```

---

## DOM Selectors

### ChatGPT Input Field
```javascript
document.querySelector('textarea')
// or
document.querySelector('[contenteditable="true"]')
```

### Send Button
```javascript
Array.from(document.querySelectorAll('button')).find(btn => {
  const ariaLabel = btn.getAttribute('aria-label');
  return ariaLabel && (
    ariaLabel.toLowerCase().includes('send') ||
    ariaLabel.toLowerCase().includes('gửi')
  );
});
```

### Messages
```javascript
document.querySelectorAll('[data-message-author-role]');
```

---

## Error Handling

### Try-Catch Pattern

```javascript
try {
  const response = await chrome.tabs.sendMessage(tabId, message);
  console.log('Success:', response);
} catch (error) {
  console.error('Error sending message:', error);
  // Tab might not exist or content script not loaded
}
```

### Async Response Pattern

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "async_task") {
    someAsyncFunction().then(result => {
      sendResponse({ data: result });
    });
    return true;  // Keep message channel open
  }
});
```

---

## Testing

### Test Content Script Loading

Mở Console trên ChatGPT tab:
```javascript
console.log("If this shows, content script is loaded");
```

### Test Message Sending

Mở Console trên Extension Popup:
```javascript
chrome.runtime.sendMessage({
  action: 'get_result'
}, (response) => {
  console.log('Response:', response);
});
```

### Test Storage

```javascript
chrome.storage.local.get(null, (items) => {
  console.log('All stored items:', items);
});
```

---

## Performance Considerations

1. **Service Worker Lifecycle**
   - Tắt tự động sau 5 phút không hoạt động
   - Sử dụng `chrome.alarms` cho task định kỳ

2. **Content Script Execution**
   - Chạy trong context của trang
   - Có thể bị chặn bởi CSP
   - Nên sử dụng selectors cụ thể

3. **Storage**
   - Giới hạn ~10MB cho extension
   - Dùng `chrome.storage` thay vì localStorage

4. **Message Passing**
   - Không gửi message quá thường xuyên
   - Dùng `return true` cho async responses

---

## Migration Guide

Nếu muốn update extension từ MV2 sang MV3:

| MV2 | MV3 |
|-----|-----|
| `background` page | `service_worker` |
| `xmlhttprequest` | `fetch` API |
| `chrome.webRequest` | `chrome.declarativeNetRequest` |
| `activeTab` permission | Not needed |
| `tabs` permission | Required |

---

## Debugging

### Enable Logging

Thêm vào `background.js`:
```javascript
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[ChatGPT Extension]', ...args);
}
```

### View Extension Logs

1. `chrome://extensions/` → Details → "Inspect views" → service_worker
2. Xem Console của popup: `background.js` logs

### View Content Script Logs

1. Mở ChatGPT tab
2. F12 → Console
3. Xem logs từ content script

---

Đối với các câu hỏi thêm, xem folder `chatgpt-extension` hoặc review code files trực tiếp.
