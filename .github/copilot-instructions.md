# ChatGPT Assistant - Hướng dẫn cho AI Coding Agent

## Mục tiêu Dự án

**ChatGPT Assistant** là Chrome MV3 extension tương tác với ChatGPT với 3 lĩnh vực chính:

1. **📈 Quản lý Portfolio Chứng khoán**: 
   - Theo dõi cổ phiếu yêu thích trên Supabase
   - SSI iBoard API integration
   - Auto-update prices mỗi 5 phút (market hours)
   - P&L tracking và portfolio analysis

2. **📚 Lưu lịch sử Chat & Phân tích**: 
   - Chat history với ChatGPT (lưu Supabase)
   - Error retrospective tracking (lưu Supabase)
   - Performance analytics
   - Link transactions với responses

3. **🌐 Bổ trợ tiện ích**:
   - English learning module
   - Settings management (Supabase-backed)
   - User authentication (Supabase Auth)

## Kiến trúc Hệ thống

### Big Picture

```
UI (Side Panel) 
  ↕ chrome.runtime.sendMessage
Background Service Worker (Middleware)
  ↕ Supabase JS Client
Supabase Cloud (PostgreSQL + Auth + Realtime)
```

**Key Points**:
- **Background = Middleware**: UI → Background → Supabase (không lưu data locally)
- **Stateless**: SW có thể terminate → mọi operation là independent Supabase call
- **User-based**: Login required, tất cả data có `user_id` + RLS policies
- **Auth Token**: Chỉ lưu Supabase session token trong `chrome.storage.local` (via adapter)

### Entry Points

- **Background SW**: `src/background/index.js` (listeners đăng ký top-level, đồng bộ)
- **Message Router**: `src/background/messageRouter.js` (Command Pattern)
- **Handlers**: `src/background/handlers/*.js` 
  - ✅ ACTIVE: `chatgpt.js`, `portfolio.js`, `chatHistory.js`, `errorTracking.js`, `supabaseAuth.js`, `settings.js`, `alarms.js`, `contextMenu.js`, `prompt.js`, `content.js`
  - ❌ REMOVED: `prompts.js`, `categories.js` (UI removed), `state.js`, `health.js`, `migration.js`, `telemetry.js`, `history.js` (superseded by chatHistory)
- **Content Script**: `src/content.js` (ChatGPT DOM automation)
- **UI**: `src/ui/*.js` (portfolio, history, errors, settings, results, english, navigation, pages, dom, status)
  - ❌ REMOVED: `backup.js` (obsolete - data in Supabase), `prompts.js`, `categories.js` (features removed)
- **Message Schema**: `src/shared/messageSchema.js` (Message types for all operations)

### Database (Supabase PostgreSQL)

**⚠️ YÊU CẦU**: TẤT CẢ dữ liệu người dùng phải lưu trên Supabase, KHÔNG lưu locally.

**Tables với user_id** (all user data must be stored here):
- `portfolio` - Stock holdings (symbol, quantity, avg_price, current_price) ✅ ACTIVE
- `chat_history` - ChatGPT conversations (prompt, response, chat_id, chat_url) ✅ ACTIVE
- `errors` - Error tracking (title, description, severity, type, resolved) ✅ ACTIVE
- `settings` - User settings (JSONB config) ✅ ACTIVE
- `prompts` - User prompt templates (stored for future migration) - UI REMOVED GPT-031
- `categories` - Categories/Tags (stored for future migration) - UI REMOVED GPT-031
- `runs` - Execution tracking

**RLS Policies**: `auth.uid() = user_id` trên tất cả tables - Enforces user isolation at database level

### Ràng buộc MV3 Quan trọng

1. **Service Worker Lifecycle**:
   - SW có thể terminate bất kỳ lúc nào → KHÔNG dùng in-memory state
   - Listeners đăng ký **đồng bộ tại top-level** trong `src/background/index.js`
   - Tránh `import()` (dynamic) - Vite inject code không tương thích SW

2. **Supabase trong Service Worker**:
   ```javascript
   // ❌ localStorage không hoạt động trong SW
   // ✅ Dùng chromeStorageAdapter
   const chromeStorageAdapter = {
     getItem: async (key) => (await chrome.storage.local.get([key]))[key],
     setItem: async (key, value) => chrome.storage.local.set({ [key]: value }),
     removeItem: async (key) => chrome.storage.local.remove([key])
   };
   
   const supabase = createClient(url, key, {
     auth: { storage: chromeStorageAdapter }
   });
   ```

3. **Realtime Subscriptions**:
   - ❌ KHÔNG init trong Service Worker (WebSocket unstable)
   - ✅ Init trong UI (side panel) - persistent context
   - Alternative: Polling pattern nếu side panel đóng

### Giao tiếp & State

**UI → Background → Supabase**:
```javascript
// UI
const response = await chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.PORTFOLIO_GET,
  correlationId: generateCorrelationId(),
  timestamp: Date.now()
});

// ⚠️ CRITICAL: Response uses spread operator
// createResponse spreads payload directly, NOT nested in .data
// ✅ CORRECT: response.items (direct property)
// ❌ WRONG: response.data?.items (doesn't exist!)
const items = response.items || []; // Direct access

// Background Handler
registerHandler(MESSAGE_TYPES.PORTFOLIO_GET, async (message) => {
  const userId = await requireAuth(message);
  const items = await supabaseWithRetry(async () => {
    const result = await supabase
      .from('portfolio')
      .select('*')
      .eq('user_id', userId);
    if (result.error) throw result.error;
    return result.data;
  });
  // Payload spreads directly into response
  return createResponse(message, MESSAGE_TYPES.PORTFOLIO_DATA, {
    success: true,
    items // ← Becomes response.items, NOT response.data.items
  });
});
```

**Error Handling Pattern**:
```javascript
// Retry với exponential backoff
async function supabaseWithRetry(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.status >= 400 && error.status < 500) throw error; // Client error
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

// User-friendly error messages
if (error.message.includes('Failed to fetch')) {
  return createErrorResponse(msg, 'NETWORK_ERROR', 
    'Không có kết nối internet. Vui lòng kiểm tra mạng.');
} else if (error.status === 401) {
  return createErrorResponse(msg, 'AUTH_ERROR',
    'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
}
```

### Storage Strategy

- **Supabase PostgreSQL**: TẤT CẢ business data (prompts, categories, chat history, portfolio, errors, settings)
- **chrome.storage.local**: CHỈ Supabase auth token (qua adapter) + migration flag
- ❌ **KHÔNG DÙNG** `localStorage` (browser API - không hoạt động trong SW)
- ❌ **KHÔNG LƯU** business data locally

### Workflow Phổ Biến

**Build**:
- `npm run build` - Production build
- `npm run build:watch` - Watch mode

**Test**:
- `npm run test:unit` - Vitest
- `npm run test:e2e` - Playwright

**Debug**:
- Service Worker: `chrome://extensions` → Inspect Service Worker
- Content Script: F12 DevTools trên `chatgpt.com`
- Check Supabase: `supabase.from('prompts').select('*')` trong handler

### Khi Sửa Code

**🔴 QUAN TRỌNG: Lưu dữ liệu lên Supabase**
- ✅ TẤT CẢ business data phải lưu vào Supabase PostgreSQL
- ✅ Sử dụng các tables có `user_id` + RLS policies
- ✅ Gọi Supabase từ Background handler (middleware pattern)
- ❌ KHÔNG lưu data vào `chrome.storage.local` (chỉ dùng cho auth token)
- ❌ KHÔNG lưu data vào `localStorage` trong Service Worker

**Background Handlers** (`src/background/handlers/*.js`):
- Stateless - mỗi handler là independent function
- Dùng `requireAuth()` để get user_id từ Supabase session
- Wrap Supabase calls với `supabaseWithRetry()` (exponential backoff)
- Always call Supabase - KHÔNG lưu state in-memory
- Return `createResponse()` hoặc `createErrorResponse()`
- **⚠️ Field naming**: Support BOTH camelCase và snake_case trong updates:
  ```javascript
  // Example: PORTFOLIO_UPDATE handler
  if (updates.currentPrice !== undefined) updateData.current_price = Number(updates.currentPrice);
  if (updates.current_price !== undefined) updateData.current_price = Number(updates.current_price);
  ```

**Content Script** (`src/content.js`):
- Selectors dễ vỡ → nhiều fallbacks
- Prompt dài → insert theo chunks (200 chars)
- Poll cho stable response (không thay đổi trong 2s)

**UI Modules** (`src/ui/*.js`):
- Gọi background qua `chrome.runtime.sendMessage()` (UI → Background → Supabase)
- Handle errors với user-friendly Vietnamese messages
- Realtime subscriptions trong UI (not background) 
- Update UI optimistically, revert on error
- **Không được lưu business data locally - all via background handlers**
- **⚠️ CRITICAL Response Parsing**: `createResponse()` spreads payload directly
  ```javascript
  // ✅ CORRECT: Direct property access
  const items = response.items || [];
  const chatId = response.chatId;
  
  // ❌ WRONG: Nested data property doesn't exist
  const items = response.data?.items; // undefined!
  ```

### Permissions Cần Thiết

```json
{
  "permissions": [
    "storage",        // Supabase auth token
    "tabs",           // ChatGPT tab management
    "scripting",      // Content script injection
    "alarms",         // Periodic tasks
    "sidePanel",      // UI
    "contextMenus",   // Right-click
    "activeTab"       // URL reading
  ],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://*.supabase.co/*",
    "https://iboard-query.ssi.com.vn/*",
    "https://iboard.ssi.com.vn/*"
  ]
}
```

### Anti-Patterns (TRÁNH)

❌ **Lưu business data vào `chrome.storage.local`** (chỉ dùng cho auth token) → Use Supabase instead  
❌ **Lưu business data vào `localStorage`** (không hoạt động trong SW) → Use Supabase  
❌ Dùng `localStorage` trong Service Worker (không available)  
❌ Init Realtime subscriptions trong Background (WebSocket unstable)  
❌ Giữ state in-memory trong handlers (SW có thể terminate)  
❌ Đăng ký listeners trong async function (phải top-level sync)  
❌ Dynamic imports trong background (Vite inject incompatible code)
❌ **Lưu dữ liệu người dùng locally** - TẤT CẢ phải đi qua Supabase
❌ **Truy cập `response.data?.items`** - createResponse spreads payload directly, dùng `response.items`

### Best Practices

✅ Handlers stateless, call Supabase mỗi request  
✅ Retry transient errors (network, 5xx)  
✅ Map technical errors → user-friendly Vietnamese messages  
✅ Use `requireAuth()` trước mỗi Supabase operation  
✅ Batch operations (stock prices, migrations)  
✅ Alarms cho periodic tasks (price updates mỗi 5min market hours)  
✅ RLS policies enforce user isolation  
✅ Correlation IDs cho request tracing
✅ **Support both camelCase và snake_case** trong handler updates (field naming flexibility)
✅ **Direct property access** trong response parsing (`response.items` không phải `response.data.items`)

## References

- [Full Architecture](../docs/ARCHITECTURE.md) - Chi tiết patterns, error handling, schemas
- [Storage Explanation](../docs/STORAGE_EXPLAINED.md) - chrome.storage.local vs localStorage
- [Architecture Review](../docs/ARCHITECTURE_REVIEW.md) - Validation và recommendations
- [Chrome MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
