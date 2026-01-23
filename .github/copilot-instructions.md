# ChatGPT Assistant - Hướng dẫn cho AI Coding Agent

## Mục tiêu Dự án

**ChatGPT Assistant** là Chrome MV3 extension quản lý prompts, categories, chat history với 3 lĩnh vực:

1. **📋 Quản lý Prompts & Categories**: 
   - Library prompt templates có categories/tags
   - Favorites, usage tracking
   - Tất cả data theo user (login required)

2. **📈 Quản lý Portfolio Chứng khoán**: 
   - Theo dõi cổ phiếu yêu thích
   - SSI iBoard API integration
   - Auto-update prices mỗi 5 phút (market hours)

3. **📚 Lưu lịch sử Chat & Phân tích**: 
   - Chat history với ChatGPT
   - Link prompt template với responses
   - Error retrospective tracking

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
- **Handlers**: `src/background/handlers/*.js` (prompts, categories, portfolio, history, errors, supabase auth, chatgpt, prompt orchestration, alarms, contextMenu)
- **Content Script**: `src/content.js` (ChatGPT DOM automation)
- **UI**: `src/ui/*` (prompts, categories, portfolio, history, errors, settings, results)
- **Message Schema**: `src/shared/messageSchema.js` (65+ MESSAGE_TYPES)

### Database (Supabase PostgreSQL)

**Tables với user_id**:
- `prompts` - User prompt templates (title, content, category_id, is_favorite, usage_count)
- `categories` - Categories/Tags (name, color, icon)
- `chat_history` - ChatGPT conversations (prompt, response, prompt_id, chat_id, chat_url)
- `portfolio` - Stock holdings (symbol, quantity, avg_price, current_price)
- `errors` - Error tracking (title, description, severity, type, resolved)
- `settings` - User settings (JSONB config)
- `runs` - Execution tracking

**RLS Policies**: `auth.uid() = user_id` trên tất cả tables

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
  type: MESSAGE_TYPES.PROMPT_ADD,
  correlationId: generateCorrelationId(),
  data: { title: 'My Prompt', content: '...' }
});

// Background Handler
registerHandler(MESSAGE_TYPES.PROMPT_ADD, async (message) => {
  const userId = await requireAuth(message);
  const data = await supabaseWithRetry(async () => {
    const result = await supabase
      .from('prompts')
      .insert({ user_id: userId, ...message.data })
      .select()
      .single();
    if (result.error) throw result.error;
    return result.data;
  });
  return createResponse(message, MESSAGE_TYPES.PROMPT_ADDED, data);
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

**Background Handlers** (`src/background/handlers/*.js`):
- Stateless - mỗi handler là independent function
- Dùng `requireAuth()` để get user_id
- Wrap Supabase calls với `supabaseWithRetry()`
- Return `createResponse()` hoặc `createErrorResponse()`

**Content Script** (`src/content.js`):
- Selectors dễ vỡ → nhiều fallbacks
- Prompt dài → insert theo chunks (200 chars)
- Poll cho stable response (không thay đổi trong 2s)

**UI Modules** (`src/ui/*.js`):
- Gọi background qua `chrome.runtime.sendMessage()`
- Handle errors với user-friendly messages
- Realtime subscriptions trong UI (not background)
- Update UI optimistically, revert on error

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

❌ Lưu data vào `chrome.storage.local` (chỉ dùng cho auth token)  
❌ Dùng `localStorage` trong Service Worker (không available)  
❌ Init Realtime subscriptions trong Background (WebSocket unstable)  
❌ Giữ state in-memory trong handlers (SW có thể terminate)  
❌ Đăng ký listeners trong async function (phải top-level sync)  
❌ Dynamic imports trong background (Vite inject incompatible code)

### Best Practices

✅ Handlers stateless, call Supabase mỗi request  
✅ Retry transient errors (network, 5xx)  
✅ Map technical errors → user-friendly Vietnamese messages  
✅ Use `requireAuth()` trước mỗi Supabase operation  
✅ Batch operations (stock prices, migrations)  
✅ Alarms cho periodic tasks (price updates mỗi 5min market hours)  
✅ RLS policies enforce user isolation  
✅ Correlation IDs cho request tracing

## References

- [Full Architecture](../docs/ARCHITECTURE.md) - Chi tiết patterns, error handling, schemas
- [Storage Explanation](../docs/STORAGE_EXPLAINED.md) - chrome.storage.local vs localStorage
- [Architecture Review](../docs/ARCHITECTURE_REVIEW.md) - Validation và recommendations
- [Chrome MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
