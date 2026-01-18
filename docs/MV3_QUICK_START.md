# MV3 Architecture - Quick Start

## 🚀 Đã Hoàn thành

### ✅ Core Infrastructure
- **Message Schema** (`shared/messageSchema.js`) - Protocol chuẩn cho tất cả communication
- **Platform Adapters** - Bọc Chrome APIs để dễ test & maintain
  - `platform/storage.js` - chrome.storage.*
  - `platform/messaging.js` - chrome.runtime.sendMessage
  - `platform/tabs.js` - chrome.tabs.*
- **Message Router** (`background/messageRouter.js`) - Central dispatcher
- **Background Entry** (`background/index.js`) - Top-level listeners (MV3 compliant)
- **Sample Handlers** - ChatGPT, State, Portfolio

## 📋 Cần Làm Tiếp

### Phase 2: Handler Migration (URGENT)
```
[ ] Migrate tất cả handlers từ src/background.js cũ
[ ] Update vite.config.js → point to background/index.js
[ ] Tạo handlers/contextMenu.js
[ ] Tạo handlers/alarms.js
[ ] Tạo handlers/firebase.js (use firebaseService.js)
[ ] Test đầy đủ tất cả message flows
```

### Phase 3: Content Script
```
[ ] Refactor src/content.js sử dụng message schema
[ ] Move to src/content/index.js
[ ] Remove direct chrome.runtime calls
```

### Phase 4: UI Layer
```
[ ] Update UI modules sử dụng platform/messaging.js
[ ] Replace chrome.runtime.sendMessage với sendToBackground()
```

## 🎯 Sử dụng ngay

### Gửi message từ UI/Content:
```javascript
import { sendToBackground } from './platform/messaging.js';
import { createMessage, MESSAGE_TYPES } from './shared/messageSchema.js';

// Gửi prompt
const msg = createMessage(MESSAGE_TYPES.CHATGPT_SEND_INPUT, {
  prompt: 'Analyze this...',
  options: { createNewChat: true }
});

const response = await sendToBackground(msg);
if (response.type === MESSAGE_TYPES.CHATGPT_INPUT_SENT) {
  console.log('Success!', response.data);
}
```

### Tạo handler mới trong background:
```javascript
// background/handlers/myFeature.js
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse } from '../../shared/messageSchema.js';

registerHandler(MESSAGE_TYPES.MY_ACTION, async (message, sender) => {
  // Your logic here
  const result = await doSomething(message.payload);
  
  return createResponse(message, MESSAGE_TYPES.MY_RESPONSE, {
    data: result
  });
});
```

### Sử dụng Platform Adapters:
```javascript
import { storageGet, storageSet } from './platform/storage.js';

// Get from storage
const result = await storageGet(['portfolio', 'settings']);
if (result.success) {
  console.log(result.data.portfolio);
}

// Set to storage
await storageSet({ portfolio: updatedData });
```

## 🚨 MV3 Rules - MUST FOLLOW

### ✅ DO:
1. Register listeners ở top-level, KHÔNG trong async function
2. Persist state trong chrome.storage, KHÔNG trong RAM
3. Sử dụng message schema CHO TẤT CẢ communication
4. Design cho short-lived execution (SW có thể terminate bất cứ lúc nào)

### ❌ DON'T:
1. KHÔNG register listeners sau async init
2. KHÔNG store important data trong memory
3. KHÔNG dùng ad-hoc message format
4. KHÔNG dùng setInterval/setTimeout dài hạn (dùng chrome.alarms)

## 📚 Docs

- **Full Guide:** [MV3_ARCHITECTURE_GUIDE.md](./MV3_ARCHITECTURE_GUIDE.md)
- **Refactoring Summary:** [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)
- **Context Menu Feature:** [CONTEXT_MENU_FEATURE.md](./CONTEXT_MENU_FEATURE.md)

## 🧪 Testing

```bash
# Build
npm run build

# TODO: Add tests
npm test
```

## 📞 Support

Khi gặp vấn đề:
1. Check correlation ID trong logs
2. Verify message schema với `isValidMessage()`
3. Check handler registration trong router stats
4. Review MV3_ARCHITECTURE_GUIDE.md

---

**Architecture:** Production-ready MV3  
**Status:** Foundation complete, migration in progress  
**Next:** Complete handler migration + testing
