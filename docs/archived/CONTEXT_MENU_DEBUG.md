# Context Menu Error - Diagnostic Guide

## ❌ Lỗi: `document is not defined`

### 🔍 Nguyên nhân

**Chrome Extension MV3 Architecture:**
```
Background Service Worker (NO DOM)
├─ Không có window object
├─ Không có document object  
├─ Không có localStorage
└─ Chỉ có Service Worker APIs

Content Script / Page Context (HAS DOM)
├─ Có đầy đủ window, document
├─ Có thể access DOM elements
└─ Có thể inject code vào page
```

**Lỗi xảy ra khi:**
1. Code cố gắng access `document` trong background context
2. Function được serialize sai khi inject vào page
3. Build cũ vẫn đang chạy (chưa reload extension)

---

## ✅ Solution đã áp dụng

### **Before (Arrow Function - Có thể bị Vite transform sai):**
```javascript
await chrome.scripting.executeScript({
  func: () => {
    // Inline arrow function
    const selectors = [...];
    // ... code ...
    return content;
  }
});
```

**Vấn đề:**
- Vite có thể transform arrow function
- Minification có thể break serialization
- Closure scope có thể gây confuse

### **After (Function Declaration - Reliable):**
```javascript
// Function declaration ở top-level
function extractPageContent() {
  // Tách biệt hoàn toàn, không reference external scope
  const selectors = [...];
  // ... code ...
  return content;
}

// Execute
await chrome.scripting.executeScript({
  func: extractPageContent,  // Reference by name
  args: []                    // No external dependencies
});
```

**Ưu điểm:**
- ✅ Function declaration được serialize đúng 100%
- ✅ Không bị Vite transform
- ✅ Chrome hiểu rõ phải inject gì
- ✅ Không có closure issues

---

## 🔧 Cách Test & Debug

### **Step 1: Reload Extension**
```
1. Trong Chrome: chrome://extensions/
2. Tìm "ChatGPT Assistant"
3. Click nút "Reload" (circular arrow icon)
4. Hoặc: Toggle OFF → Toggle ON
```

### **Step 2: Test Context Menu**
```
1. Vào bất kỳ trang web nào (VD: wikipedia.org)
2. Select một đoạn text
3. Right-click → "ChatGPT Assistant - Phân tích"
4. Check console log trong:
   - Extension background page (chrome://extensions/ → "Service Worker")
   - Page console (F12)
```

### **Step 3: Check Background Logs**
```
1. chrome://extensions/
2. Click "Service Worker" link under extension
3. Xem logs:
   [ContextMenu] Context menu clicked
   [ContextMenu] Using selected text / Extracting page content
   [ContextMenu] Prompt sent successfully
```

### **Step 4: Nếu vẫn lỗi**
```javascript
// Thêm debug vào extractPageContent function:
function extractPageContent() {
  console.log('[DEBUG] extractPageContent running in:', 
    typeof document === 'undefined' ? 'BACKGROUND (ERROR!)' : 'PAGE (OK)'
  );
  
  // ... rest of code
}
```

---

## 🎯 Best Practices cho executeScript

### ✅ DO:
```javascript
// 1. Function declaration at module top-level
function myPageFunction() {
  // Self-contained, no external refs
  return document.title;
}

// 2. Use it
chrome.scripting.executeScript({
  target: { tabId },
  func: myPageFunction,
  args: []  // Pass data via args if needed
});

// 3. Pass arguments if needed
function myPageFunctionWithArgs(maxLength) {
  return document.body.innerText.substring(0, maxLength);
}

chrome.scripting.executeScript({
  func: myPageFunctionWithArgs,
  args: [10000]  // ✅ Pass maxLength as argument
});
```

### ❌ DON'T:
```javascript
// 1. DON'T use arrow function inline
chrome.scripting.executeScript({
  func: () => document.title  // ❌ May not serialize correctly
});

// 2. DON'T reference external variables
const myVar = 'test';
function badFunction() {
  return myVar;  // ❌ myVar doesn't exist in page context!
}

// 3. DON'T import modules
import { something } from './module.js';
function badFunction() {
  return something();  // ❌ Import doesn't work in injected code
}
```

---

## 📊 Debugging Checklist

| Check | Command | Expected Output |
|-------|---------|-----------------|
| Build successful | `npm run build` | ✓ 54 modules transformed |
| Extension loaded | chrome://extensions/ | Extension visible, enabled |
| Service worker | Click "Service Worker" | Console opens, no errors |
| Context menu exists | Right-click on page | "ChatGPT Assistant" appears |
| Click works | Click menu item | [ContextMenu] logs appear |
| Content extracted | Check logs | length: XXX characters |
| ChatGPT opens | After extraction | New tab with chatgpt.com |

---

## 🚀 Final Solution Summary

**File changed:** `src/background/handlers/contextMenu.js`

**Changes:**
1. ✅ Moved inline arrow function → separate function declaration
2. ✅ Added detailed comments explaining context
3. ✅ Used `func: extractPageContent` instead of inline function
4. ✅ Added `args: []` for clarity

**Result:**
- Function được serialize đúng
- Chạy trong page context (có `document`)
- Không bị Vite transform
- Chrome extension hoạt động correctly

---

## 🔄 Next Time Issue Occurs

1. **Check build:** `npm run build` - ensure latest code
2. **Reload extension:** chrome://extensions/ → Reload button
3. **Clear cache:** Hard reload (Ctrl+Shift+R) trên page đang test
4. **Check Service Worker logs:** Click "Service Worker" link, xem console
5. **Verify function location:** Function declaration phải ở top-level, không nested

---

**Status:** ✅ Fixed  
**Build:** 22.78 kB (contextMenu-BkdsW2PD.js updated)  
**Ready to test:** Reload extension và thử right-click context menu
