# MV3 Architecture Refactoring - Implementation Guide

## 🎯 Mục tiêu: Production-Ready MV3 Extension Architecture

Refactoring này triển khai **best practices** cho Chrome Extension Manifest V3, tuân thủ các nguyên tắc:
- Event-driven design
- Separation of concerns
- Testable architecture
- Maintainable codebase

---

## 📁 New Architecture Structure

```
src/
├── shared/                    # Pure logic, no Chrome APIs
│   ├── messageSchema.js       # ✅ Message types + validation
│   └── types.js               # Type definitions
│
├── platform/                  # Chrome API adapters (I/O layer)
│   ├── storage.js             # ✅ Wraps chrome.storage.*
│   ├── messaging.js           # ✅ Wraps chrome.runtime.sendMessage
│   └── tabs.js                # ✅ Wraps chrome.tabs.*
│
├── background/                # Service Worker runtime
│   ├── index.js               # ✅ Entry point (top-level listeners)
│   ├── messageRouter.js       # ✅ Central message dispatcher
│   └── handlers/              # Message handlers by feature
│       ├── index.js           # ✅ Handler registration
│       ├── chatgpt.js         # ✅ ChatGPT operations
│       ├── state.js           # ✅ State management
│       ├── portfolio.js       # ✅ Portfolio feature
│       ├── contextMenu.js     # TODO
│       └── alarms.js          # TODO
│
├── content/                   # Content script runtime
│   └── index.js               # TODO: Refactor from src/content.js
│
├── ui/                        # Extension UI pages
│   ├── index.js               # Existing
│   └── ...                    # Other UI modules
│
├── features/                  # Business logic by feature (future)
│   └── ...                    # TODO: Extract from handlers
│
├── logger.js                  # ✅ Structured logging
├── types.js                   # ✅ Error codes + response types
├── chatgptSession.js          # ✅ Refactored with types
└── firebaseService.js         # ✅ Separated I/O layer
```

---

## ✅ Completed Components

### 1. **Message Schema** (`shared/messageSchema.js`)
**Purpose:** Standardized communication protocol

**Features:**
- Schema version (v1) for future compatibility
- Type-safe message types (MESSAGE_TYPES)
- Correlation IDs for request tracing
- Helper functions: `createMessage()`, `createResponse()`, `createErrorResponse()`
- Validation: `isValidMessage()`

**Usage:**
```javascript
import { createMessage, MESSAGE_TYPES } from './shared/messageSchema.js';

const msg = createMessage(MESSAGE_TYPES.CHATGPT_SEND_INPUT, {
  prompt: 'Hello',
  options: { createNewChat: true }
});
```

---

### 2. **Platform Adapters** (`platform/*`)

#### **storage.js**
Wraps `chrome.storage.*` with clean interface:
```javascript
import { storageGet, storageSet } from './platform/storage.js';

const result = await storageGet(['portfolio']);
if (result.success) {
  console.log(result.data.portfolio);
}
```

**Benefits:**
- Easy to mock in tests
- Consistent error handling
- Structured logging
- Swap storage backend without changing business logic

#### **messaging.js**
Wraps `chrome.runtime.sendMessage` with schema validation:
```javascript
import { sendToBackground } from './platform/messaging.js';

const response = await sendToBackground(message);
```

**Critical Features:**
- Validates messages before sending
- Top-level listener registration (MV3 requirement)
- Long-lived connections support

#### **tabs.js**
Wraps `chrome.tabs.*`:
```javascript
import { queryTabs, createTab } from './platform/tabs.js';

const result = await queryTabs({ url: 'https://chatgpt.com/*' });
```

---

### 3. **Message Router** (`background/messageRouter.js`)

**Purpose:** Central dispatcher (Command Pattern)

**Architecture:**
```
Message arrives → Router → Handler (by type) → Response
```

**Key Functions:**
- `registerHandler(type, handler)` - Register message handlers
- `route(message, sender)` - Dispatch to handler
- Built-in PING handler for health checks

**Usage:**
```javascript
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';

registerHandler(MESSAGE_TYPES.MY_ACTION, async (message, sender) => {
  // Handle message
  return createResponse(message, MESSAGE_TYPES.MY_RESPONSE, { data });
});
```

---

### 4. **Background Entry Point** (`background/index.js`)

**MV3 CRITICAL Design:**

✅ **All listeners registered SYNCHRONOUSLY at top-level**
```javascript
// ✅ CORRECT - Top-level, synchronous
const unsubscribe = onMessage(handler);

chrome.runtime.onInstalled.addListener(handler);
chrome.alarms.onAlarm.addListener(handler);
```

❌ **WRONG - Async init before listeners**
```javascript
// ❌ WRONG - Listeners may miss events!
async function init() {
  await someAsyncSetup();
  chrome.runtime.onMessage.addListener(handler); // TOO LATE!
}
init();
```

**Event Handlers:**
- `onMessage` - Routes ALL messages through router
- `onInstalled` - First-time setup + updates
- `onStartup` - Browser start
- `onClicked` - Extension icon
- `contextMenus.onClicked` - Context menu
- `onAlarm` - Periodic tasks

---

### 5. **Feature Handlers** (`background/handlers/*`)

**Pattern:** Each feature has its own handler file

**Example - ChatGPT Handler:**
```javascript
// handlers/chatgpt.js
registerHandler(MESSAGE_TYPES.CHATGPT_SEND_INPUT, async (message) => {
  const tabResult = await ChatGPTSession.ensureChatGPTTab();
  const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, prompt);
  return createResponse(message, MESSAGE_TYPES.CHATGPT_INPUT_SENT, { data: sendResult.data });
});
```

**Completed Handlers:**
- ✅ `chatgpt.js` - CHATGPT_SEND_INPUT, CHATGPT_GET_OUTPUT
- ✅ `state.js` - STATE_GET, STATE_SET (uses storage adapter)
- ✅ `portfolio.js` - Placeholder

---

## 🔄 Migration Path

### Phase 1: ✅ Foundation (COMPLETED)
- [x] Message schema
- [x] Platform adapters
- [x] Message router
- [x] Background entry point structure
- [x] Sample handlers

### Phase 2: 🔄 Handler Migration (IN PROGRESS)
**Goal:** Move logic from old `background.js` to new handlers

**Steps:**
1. Identify all `chrome.runtime.onMessage` handlers in old code
2. Create handler files for each feature:
   - `handlers/prompt.js` - Prompt operations
   - `handlers/firebase.js` - Firebase sync (use firebaseService.js)
   - `handlers/contextMenu.js` - Context menu actions
   - `handlers/alarms.js` - Periodic tasks
3. Register each handler with router
4. Test thoroughly

**Example Migration:**
```javascript
// OLD (in background.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'send_prompt') {
    // ... logic ...
    sendResponse({ status: 'ok' });
  }
});

// NEW (in handlers/prompt.js)
registerHandler(MESSAGE_TYPES.PROMPT_SEND, async (message, sender) => {
  // ... same logic using platform adapters ...
  return createResponse(message, MESSAGE_TYPES.PROMPT_SENT, { data });
});
```

### Phase 3: Content Script Refactor
**Goal:** Move `src/content.js` to `src/content/index.js` with message schema

**Changes:**
1. Use message schema for all communication
2. Register handlers for content-side operations
3. Remove direct `chrome.runtime.sendMessage` calls, use platform adapter

### Phase 4: UI Layer Update
**Goal:** Update UI to use message schema

**Changes:**
1. Replace direct `chrome.runtime.sendMessage` with platform adapter
2. Use standard message types
3. Handle responses consistently

### Phase 5: Feature Extraction
**Goal:** Move business logic from handlers to `features/`

**Structure:**
```
features/
├── portfolio/
│   ├── portfolio.service.js    # Pure logic
│   ├── portfolio.types.js      # Types
│   └── portfolio.selectors.js  # Data selectors
└── prompts/
    └── ...
```

**Benefits:**
- Business logic independent of Chrome APIs
- Easily testable (no mocking needed)
- Reusable across different runtimes

---

## 🧪 Testing Strategy

### Unit Tests (High Priority)
**Target:** `shared/`, `features/`, business logic in `chatgptSession.js`

```javascript
// Example: Test message schema
import { createMessage, isValidMessage, MESSAGE_TYPES } from './messageSchema.js';

test('createMessage generates valid message', () => {
  const msg = createMessage(MESSAGE_TYPES.PING);
  expect(isValidMessage(msg)).toBe(true);
  expect(msg.v).toBe(1);
  expect(msg.type).toBe('PING');
});
```

### Integration Tests (Medium Priority)
**Target:** Platform adapters (with mocked Chrome APIs)

```javascript
// Example: Test storage adapter
import { storageGet } from './platform/storage.js';

// Mock chrome.storage
global.chrome = {
  storage: {
    local: {
      get: jest.fn()
    }
  }
};

test('storageGet returns success response', async () => {
  chrome.storage.local.get.mockResolvedValue({ key: 'value' });
  const result = await storageGet(['key']);
  expect(result.success).toBe(true);
  expect(result.data.key).toBe('value');
});
```

### E2E Tests (Lower Priority)
**Target:** Full workflows with real Chrome extension APIs

---

## 🚨 Critical MV3 Rules (NEVER VIOLATE)

### 1. **Listener Registration**
✅ **DO:** Register synchronously at module top-level
```javascript
chrome.runtime.onMessage.addListener(handler); // At top level
```

❌ **DON'T:** Register after async operations
```javascript
async function init() {
  await something();
  chrome.runtime.onMessage.addListener(handler); // TOO LATE!
}
```

### 2. **State Persistence**
✅ **DO:** Store in chrome.storage
```javascript
await chrome.storage.local.set({ important: data });
```

❌ **DON'T:** Store in memory
```javascript
let importantData = {}; // WILL BE LOST when SW terminates!
```

### 3. **Short-Lived Execution**
✅ **DO:** Design for quick execution
```javascript
// Process message quickly, return
async function handler(msg) {
  const result = await quickOperation();
  return result;
}
```

❌ **DON'T:** Long-running operations in SW
```javascript
// Service Worker will be terminated!
setInterval(() => { ... }, 60000); // WRONG!
```

Use `chrome.alarms` instead for periodic tasks.

### 4. **Message Schema**
✅ **DO:** Always use schema
```javascript
const msg = createMessage(MESSAGE_TYPES.ACTION, { data });
```

❌ **DON'T:** Ad-hoc messages
```javascript
const msg = { action: 'do_something', stuff: 123 }; // NO SCHEMA!
```

---

## 📊 Performance Guidelines

### Message Handler Performance
- **Target:** <100ms for simple operations
- **Warning:** >1s operations (log warning)
- **Timeout:** Consider breaking into chunks if >5s

### Storage Operations
- **Batch reads/writes** when possible
- **Monitor size:** Check with `storageGetBytesInUse()`
- **Limit:** Local storage ~10MB, sync ~100KB

### Logging
- **Debug logs:** Disabled in production
- **Structured logs:** Include correlationId always
- **Error logs:** Include stack traces

---

## 🔐 Permission Review

**Current permissions (manifest.json):**
```json
{
  "permissions": [
    "storage",      // ✅ Required for persistence
    "tabs",         // ✅ Required for ChatGPT tab management
    "scripting",    // ✅ Required for content script injection
    "alarms",       // ✅ Required for periodic tasks
    "sidePanel",    // ✅ Required for side panel UI
    "identity",     // ✅ Required for Google Drive OAuth
    "contextMenus", // ✅ Required for right-click menu
    "activeTab"     // ✅ Required for context menu content access
  ]
}
```

**Review:** All permissions justified ✅

**Future:** Consider on-demand permission requests for:
- `host_permissions` for specific sites
- Additional API access as needed

---

## 📝 Next Steps

1. **Immediate (This Sprint):**
   - [ ] Complete handler migration from old background.js
   - [ ] Update vite.config.js to build from background/index.js
   - [ ] Test all message flows
   - [ ] Update content.js to use message schema

2. **Short-term (Next Sprint):**
   - [ ] Add unit tests for message schema
   - [ ] Add integration tests for platform adapters
   - [ ] Extract features from handlers
   - [ ] Documentation updates

3. **Long-term:**
   - [ ] TypeScript migration
   - [ ] Performance monitoring
   - [ ] Error tracking (Sentry)
   - [ ] A/B testing infrastructure

---

## 🎓 Learning Resources

- [Chrome Extension MV3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Message Passing Best Practices](https://developer.chrome.com/docs/extensions/mv3/messaging/)

---

**Created:** 2026-01-18  
**Author:** GitHub Copilot (Claude Sonnet 4.5)  
**Status:** Architecture Complete, Migration In Progress
