# MV3 Architecture Migration Status

**Last Updated:** 2026-01-15  
**Build:** ✅ Successful (background.js: 12.37 kB, gzip: 4.05 kB)

---

## ✅ Phase 1: Foundation (COMPLETE)

### Core Infrastructure
- [x] **Message Schema** (`shared/messageSchema.js`)
  - MESSAGE_VERSION = 1
  - MESSAGE_TYPES enum (15 types)
  - createMessage(), createResponse(), isValidMessage()
  - Correlation IDs for tracing
  
- [x] **Platform Adapters**
  - `platform/storage.js` - chrome.storage.* wrapper (~150 lines)
  - `platform/messaging.js` - chrome.runtime.sendMessage with validation (~200 lines)
  - `platform/tabs.js` - chrome.tabs.* operations (~250 lines)
  
- [x] **Message Router** (`background/messageRouter.js`)
  - Command Pattern dispatcher
  - Handler registry (Map)
  - Built-in PING handler
  - Router stats tracking
  
- [x] **Background Entry Point** (`background/index.js`)
  - ✅ Top-level synchronous listener registration (MV3 CRITICAL)
  - ✅ onMessage → messageRouter
  - ✅ onInstalled → onInstall()
  - ✅ onStartup → onStartup()
  - ✅ action.onClicked → open side panel
  - ✅ contextMenus.onClicked (handler TODO)
  - ✅ alarms.onAlarm (handler TODO)
  
- [x] **Sample Handlers**
  - `background/handlers/chatgpt.js` - CHATGPT_SEND_INPUT, CHATGPT_GET_OUTPUT
  - `background/handlers/state.js` - STATE_GET, STATE_SET
  - `background/handlers/portfolio.js` - Placeholder (NOT_IMPLEMENTED)
  
- [x] **Supporting Infrastructure**
  - `types.js` - JSDoc typedefs, ERROR_CODES, ApiResponse helpers
  - `logger.js` - Structured logging with correlation IDs
  - `firebaseService.js` - Firebase I/O abstraction (~400 lines)

### Build Configuration
- [x] Updated `vite.config.js` → `src/background/index.js` entry point
- [x] Build successful (no errors)
- [x] Background bundle optimized (12.37 kB vs old 34.58 kB = 65% reduction)

### Documentation
- [x] MV3_ARCHITECTURE_GUIDE.md (~400 lines)
- [x] MV3_QUICK_START.md
- [x] This status file

---

## 🔄 Phase 2: Handler Migration (IN PROGRESS)

### From `src/background.js` (1558 lines) → Feature Handlers

#### ✅ Completed Handlers
- [x] **Message routing** - Delegated to messageRouter.js
- [x] **ChatGPT session** - handlers/chatgpt.js uses chatgptSession.js
- [x] **State/Storage** - handlers/state.js uses platform/storage.js
- [x] **Context menu creation** - In background/index.js createContextMenus()
- [x] **Alarm setup** - In background/index.js setupAlarms()

#### 🚧 Handlers Needing Migration

**Priority 1: Core Features (User-Facing)**
- [ ] **Context Menu Click Handler** → `handlers/contextMenu.js`
  - Extract selected text / page content
  - Use platform/tabs.js for content script injection
  - Send to ChatGPT with context menu prompt
  - Current: Commented out in background/index.js L93
  
- [ ] **Alarm Handlers** → `handlers/alarms.js`
  - CHECK alarm (5 min) - portfolio price updates
  - AUTORUN alarm (configurable) - auto-evaluation
  - POLL alarm (dynamic) - ChatGPT response polling
  - Current: Commented out in background/index.js L103

**Priority 2: Integration Features**
- [ ] **Firebase Handlers** → `handlers/firebase.js`
  - FIREBASE_SYNC - syncToFirebase()
  - FIREBASE_RESTORE - restoreFromFirebase()
  - FIREBASE_LIST_BACKUPS - listBackups()
  - Use firebaseService.js (already separated)
  - Current: In old background.js L1178-1290

**Priority 3: Portfolio Features**
- [ ] **Portfolio Price Update** → `handlers/portfolio.js`
  - PORTFOLIO_UPDATE_PRICES action
  - Use market-data providers
  - Current: Placeholder only

**Priority 4: Settings/Prompt Features**
- [ ] **Prompt Send** → `handlers/prompt.js`
  - SEND_PROMPT action
  - sendPrompt() business logic
  - Current: In old background.js L680-815

**Priority 5: Utility Actions**
- [ ] **Clear Storage** → `handlers/state.js` (add to existing)
- [ ] **Fill Prompt** → May be content script responsibility

### Migration Checklist Template
For each handler, follow this process:

```javascript
// 1. Create handler file
// handlers/myFeature.js

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('MyFeature');

// 2. Implement handler
registerHandler(MESSAGE_TYPES.MY_ACTION, async (message, sender) => {
  const correlationId = logger.startOperation('myOperation', message.correlationId);
  
  try {
    const result = await doMyWork(message.payload);
    
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.MY_RESPONSE, { result });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

// 3. Register in handlers/index.js
// import './myFeature.js';

// 4. Update background/index.js if needed (for event-driven triggers)

// 5. Test message flow
// - Send message from UI/Content
// - Verify handler receives it
// - Verify response format
```

---

## 📋 Phase 3: Content Script Refactor (TODO)

### Current State
- `src/content.js` (~200 lines)
- Direct chrome.runtime.sendMessage calls
- Legacy message format

### Migration Tasks
- [ ] Move to `src/content/index.js`
- [ ] Import messageSchema
- [ ] Replace chrome.runtime.sendMessage with sendToBackground()
- [ ] Standardize message types
- [ ] Add correlation ID support
- [ ] Test with background handlers

---

## 📋 Phase 4: UI Layer Refactor (TODO)

### Affected Files
- `src/ui/index.js` - Main UI logic
- `src/ui/*.js` - All UI modules (backup, history, portfolio, settings, etc.)

### Migration Tasks
- [ ] Import platform/messaging.js
- [ ] Replace chrome.runtime.sendMessage → sendToBackground()
- [ ] Use MESSAGE_TYPES constants
- [ ] Handle MESSAGE_TYPES responses
- [ ] Add error handling with ERROR_CODES
- [ ] Test all UI interactions

---

## 📋 Phase 5: Feature Extraction (FUTURE)

### Goal
Extract high-level features to `features/` directory

### Candidate Features
- [ ] ChatGPT Integration → `features/chatgpt/`
- [ ] Portfolio Management → `features/portfolio/`
- [ ] Firebase Sync → `features/firebase/`
- [ ] Market Data → Already in `market-data/`

### Benefits
- Clear feature boundaries
- Easier to add/remove features
- Better testability
- Clearer ownership

---

## 🧪 Testing Strategy

### Unit Tests (TODO)
```bash
# Test shared utilities
npm test -- shared/messageSchema.test.js
npm test -- logger.test.js
npm test -- types.test.js
```

### Integration Tests (TODO)
```bash
# Test platform adapters
npm test -- platform/storage.test.js
npm test -- platform/messaging.test.js
```

### E2E Tests (TODO)
```bash
# Test message flows
npm test -- e2e/chatgpt-flow.test.js
npm test -- e2e/context-menu.test.js
```

---

## 📊 Metrics

### Code Organization
- **Old background.js:** 1558 lines (monolithic)
- **New architecture:**
  - background/index.js: ~225 lines (entry point + lifecycle)
  - messageRouter.js: ~100 lines (dispatcher)
  - handlers/*: ~50-100 lines each (focused)
  - platform/*: ~150-250 lines each (adapters)
  - shared/messageSchema.js: ~200 lines (protocol)

### Bundle Size
- **Old:** 34.58 kB (gzip: 10.34 kB)
- **New:** 12.37 kB (gzip: 4.05 kB)
- **Savings:** 64% smaller

### Architecture Quality
- ✅ Top-level listener registration (MV3 compliant)
- ✅ Message schema with versioning
- ✅ Platform abstraction for testability
- ✅ Correlation IDs for tracing
- ✅ Structured logging
- ✅ Separation of concerns
- ✅ Type safety (JSDoc)
- 🔄 Test coverage (pending)

---

## 🚀 Next Actions

### Immediate (This Session)
1. ✅ ~~Update vite.config.js entry point~~
2. ✅ ~~Add alarm setup to onInstall/onStartup~~
3. ✅ ~~Verify build successful~~
4. [ ] Implement handlers/contextMenu.js
5. [ ] Implement handlers/alarms.js
6. [ ] Test context menu feature end-to-end

### Short-term (Next Session)
1. [ ] Implement handlers/firebase.js
2. [ ] Implement handlers/prompt.js
3. [ ] Complete handlers/portfolio.js
4. [ ] Update UI to use message schema
5. [ ] Add error handling throughout

### Long-term
1. [ ] Add unit tests
2. [ ] Add integration tests
3. [ ] Add E2E tests
4. [ ] Extract features to features/
5. [ ] Performance optimization
6. [ ] Documentation updates

---

## 🎯 Success Criteria

### Phase 2 Complete When:
- [ ] All old background.js handlers migrated
- [ ] Context menu works end-to-end
- [ ] Alarms work (CHECK, AUTORUN)
- [ ] Firebase sync works
- [ ] No functionality regression
- [ ] Build successful with no warnings

### Full Migration Complete When:
- [ ] All phases completed
- [ ] Test coverage >80%
- [ ] No usage of old background.js
- [ ] All components use message schema
- [ ] Documentation complete
- [ ] Performance benchmarks met

---

**Current Focus:** Implementing context menu and alarm handlers  
**Blocking Issues:** None  
**Confidence:** High (architecture proven, build successful)
