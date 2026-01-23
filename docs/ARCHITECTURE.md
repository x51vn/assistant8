# Kiến trúc Hệ thống - ChatGPT Assistant Extension

> **Version**: 2.0 (MV3)  
> **Last Updated**: Tháng 1 năm 2026

## Tổng quan

ChatGPT Assistant là Chrome Extension Manifest V3 được thiết kế theo kiến trúc **event-driven, message-based** với sự phân tách rõ ràng giữa các concerns. **Background service worker** hoạt động như **middleware layer**, orchestrate tất cả operations giữa UI và Supabase - không lưu data locally.

### Nguyên tắc thiết kế cốt lõi

1. **Service Worker Event-Driven**: Background không persistent → thiết kế cho short-lived execution
2. **Message-Based Communication**: UI ↔ Background cho TẤT CẢ operations; Background ↔ Supabase
3. **Cloud-First Storage**: Supabase làm primary storage backend; background là middleware, không lưu local
4. **Modular Handlers**: Mỗi feature = 1 handler module, tự đăng ký message types
5. **Minimal Permissions**: Chỉ yêu cầu permissions thực sự cần thiết

---

## Kiến trúc Components

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   Side Panel UI     │
          │  (src/ui/*.js)      │
          └──────────┬──────────┘
                     │ chrome.runtime.sendMessage
                     │
          ┌──────────▼──────────────────────────────────┐
          │   Background Service Worker (MV3)           │
          │   src/background/index.js                   │
          │                                             │
          │   ┌─────────────────────────────────┐      │
          │   │   Message Router                │      │
          │   │   (messageRouter.js)            │      │
          │   └──────────┬──────────────────────┘      │
          │              │                              │
          │   ┌──────────▼──────────────────────────┐  │
          │   │   Handlers (Auto-registered)       │  │
          │   │   - chatgpt.js                     │  │
          │   │   - portfolio.js                   │  │
          │   │   - history.js                     │  │
          │   │   - errors.js                      │  │
          │   │   - supabase.js                    │  │
          │   │   - prompt.js                      │  │
          │   │   - alarms.js                      │  │
          │   │   - contextMenu.js                 │  │
          │   └────────────────────────────────────┘  │
          └──────────┬────────────────┬────────────────┘
                     │                │
                     │                │ chrome.tabs.sendMessage
                     │                │
          ┌──────────▼──────────┐    │
          │     Supabase        │    │
          │  - PostgreSQL DB    │    │
          │  - Realtime         │    │
          │  - Auth             │    │
          └─────────────────────┘    │
                                     │
                          ┌──────────▼──────────────────┐
                          │   Content Script            │
                          │   src/content.js            │
                          │   (runs on chatgpt.com)     │
                          │                             │
                          │   - DOM automation          │
                          │   - Insert prompts          │
                          │   - Extract responses       │
                          └──────────┬──────────────────┘
                                     │
                          ┌──────────▼──────────────────┐
                          │   ChatGPT Web UI            │
                          │   (chatgpt.com)             │
                          └─────────────────────────────┘

External Integrations:
┌────────────────────┐         ┌──────────────────────┐
│  Supabase          │         │  SSI iBoard API      │
│  - PostgreSQL      │◄────────┤  - Market Data       │
│  - Auth            │         │  - Stock Prices      │
│  - Realtime        │         └──────────────────────┘
└────────────────────┘
```

---

## Components Chi tiết

### 1. Background Service Worker

**File**: `src/background/index.js`

**Trách nhiệm**:
- Đăng ký tất cả event listeners tại **top-level** (đồng bộ, không async)
- **Middleware orchestrator**: nhận messages từ UI, gọi Supabase, trả về kết quả
- Route messages đến appropriate handlers
- Quản lý lifecycle events (install, startup, alarms)
- Không lưu state - mọi operation là stateless call đến Supabase

**Ràng buộc MV3**:
```javascript
// ✅ ĐÚNG: Đăng ký listener đồng bộ tại top-level
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // async response
});

// ❌ SAI: Đăng ký listener trong async function
async function init() {
  await someAsyncOp();
  chrome.runtime.onMessage.addListener(...); // Có thể không hoạt động!
}
```

**Static Imports Only**:
```javascript
// ✅ ĐÚNG
import * as contextMenuModule from './handlers/contextMenu.js';

// ❌ SAI (Vite inject document.* code → fail trong SW)
const module = await import('./handlers/contextMenu.js');
```

### 2. Message Router

**File**: `src/background/messageRouter.js`

**Pattern**: Command Pattern with auto-registration

```javascript
const handlers = new Map();

export function registerHandler(messageType, handler) {
  handlers.set(messageType, handler);
}

export async function route(message, sender) {
  const handler = handlers.get(message.type);
  if (handler) return await handler(message, sender);
  return createErrorResponse(message, 'UNKNOWN_MESSAGE_TYPE', `No handler for ${message.type}`);
}
```

### 3. Handlers

**Location**: `src/background/handlers/*.js`

**Convention**:
- Mỗi handler = 1 file, < 100 dòng
- Tự đăng ký message types qua `registerHandler()`
- Import tất cả handlers trong `index.js` → auto-register

**Example** (`chatgpt.js`):
```javascript
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse } from '../../shared/messageSchema.js';

registerHandler(MESSAGE_TYPES.CHATGPT_SEND_INPUT, async (message, sender) => {
  // Handler logic
  return createResponse(message, MESSAGE_TYPES.CHATGPT_INPUT_SENT, { success: true });
});
```

**Registered Handlers**:
| Handler | Message Types (Request → Response) | Purpose |
|---------|-------------------------------------|----------|
| `chatgpt.js` | `CHATGPT_SEND_INPUT` → `CHATGPT_INPUT_SENT`<br>`CHATGPT_GET_OUTPUT` → `CHATGPT_OUTPUT_READY` | ChatGPT DOM automation |
| `prompts.js` | `PROMPT_GET_ALL` → `PROMPT_DATA`<br>`PROMPT_GET_BY_ID` → `PROMPT_ITEM`<br>`PROMPT_ADD` → `PROMPT_ADDED`<br>`PROMPT_UPDATE` → `PROMPT_UPDATED`<br>`PROMPT_DELETE` → `PROMPT_DELETED`<br>`PROMPT_SEARCH` → `PROMPT_SEARCH_RESULTS` | User prompt templates CRUD |
| `categories.js` | `CATEGORY_GET_ALL` → `CATEGORY_DATA`<br>`CATEGORY_ADD` → `CATEGORY_ADDED`<br>`CATEGORY_UPDATE` → `CATEGORY_UPDATED`<br>`CATEGORY_DELETE` → `CATEGORY_DELETED` | Categories/Tags management |
| `portfolio.js` | `PORTFOLIO_GET` → `PORTFOLIO_DATA`<br>`PORTFOLIO_ADD` → `PORTFOLIO_ADDED`<br>`PORTFOLIO_UPDATE` → `PORTFOLIO_UPDATED`<br>`PORTFOLIO_REMOVE` → `PORTFOLIO_REMOVED`<br>`PORTFOLIO_UPDATE_PRICES` → `PORTFOLIO_PRICES_UPDATED` | Portfolio CRUD + SSI price updates |
| `history.js` | `HISTORY_GET_ALL` → `HISTORY_DATA`<br>`HISTORY_GET_BY_ID` → `HISTORY_ITEM`<br>`HISTORY_ADD` → `HISTORY_ADDED`<br>`HISTORY_CLEAR` → `HISTORY_CLEARED` | Chat history CRUD |
| `errors.js` | `ERROR_GET_ALL` → `ERROR_DATA`<br>`ERROR_ADD` → `ERROR_ADDED`<br>`ERROR_UPDATE` → `ERROR_UPDATED`<br>`ERROR_DELETE` → `ERROR_DELETED` | Error tracking CRUD |
| `supabase.js` | `SUPABASE_AUTH_LOGIN` → `SUPABASE_AUTH_SUCCESS`<br>`SUPABASE_AUTH_LOGOUT` → `SUPABASE_AUTH_LOGGED_OUT`<br>`SUPABASE_AUTH_CHECK` → `SUPABASE_AUTH_STATUS` | Authentication orchestration |
| `prompt.js` | `SEND_PROMPT` → `PROMPT_SENT`<br>`ENSURE_CHATGPT_OPEN` → `CHATGPT_TAB_READY` | High-level prompt flow |
| `alarms.js` | (Chrome alarms API) | Periodic: price updates (5min), cleanup (daily) |
| `contextMenu.js` | (Chrome context menus) | Right-click: "Send to ChatGPT" |

### 4. Content Script

**File**: `src/content.js`

**Trách nhiệm**:
- DOM automation trên `chatgpt.com`
- Nhập prompt vào ChatGPT editor
- Nhấn nút "Send"
- Trích xuất response từ assistant messages
- Phản hồi messages từ background

**Challenges**:
- ChatGPT selectors thay đổi thường xuyên → **nhiều fallback selectors**
- Prompt dài → **insert theo chunks** để tránh paste issues
- Phát hiện khi ChatGPT đang generate → **polling với stable check**

**Key Functions**:
```javascript
// Tìm editor với fallbacks
function findEditor() {
  return document.querySelector('#prompt-textarea.ProseMirror[contenteditable="true"]') ||
         document.querySelector('#prompt-textarea[contenteditable="true"]') ||
         document.querySelector('textarea') ||
         document.querySelector('[contenteditable="true"]');
}

// Insert prompt theo chunks (tránh lỗi paste)
async function inputAndSendPrompt(prompt, options) {
  const chunkSize = 200;
  const chunks = [];
  for (let i = 0; i < prompt.length; i += chunkSize) {
    chunks.push(prompt.substring(i, i + chunkSize));
  }
  
  for (const chunk of chunks) {
    document.execCommand('insertText', false, chunk);
    await sleep(50);
  }
  
  // Find and click send button
  const sendBtn = findSendButton();
  if (sendBtn) sendBtn.click();
}

// Đợi response ổn định
async function waitForStableAssistantResponse({ timeoutMs, stableMs }) {
  // Poll cho đến khi content không thay đổi trong stableMs
  // ...
}
```

### 5. UI (Side Panel)

**Location**: `src/ui/*.js`

**Architecture**: Modular, mỗi tab = 1 module

**Modules**:
- `index.js`: Entry point, tab navigation
- `prompts.js`: Prompt templates library UI, gọi background handlers
- `categories.js`: Categories/Tags management UI, gọi background handlers
- `portfolio.js`, `portfolioPL.js`: Portfolio UI, gọi background handlers
- `history.js`: Chat history UI, gọi background handlers
- `errors.js`: Error tracking UI, gọi background handlers
- `english.js`: English learning UI
- `results.js`: Display ChatGPT responses
- `settings.js`: User settings UI, gọi background handlers

**Communication Pattern**:
```javascript
// UI → Background → Supabase (for all operations)
const response = await chrome.runtime.sendMessage({
  v: MESSAGE_VERSION,
  type: MESSAGE_TYPES.PORTFOLIO_ADD,
  correlationId: generateCorrelationId(),
  data: { symbol: 'VNM', quantity: 100, avgPrice: 85000 }
});

// Background handler orchestrates Supabase
// src/background/handlers/portfolio.js
import { supabaseWithRetry } from '../../utils/supabaseRetry.js';
import { requireAuth } from '../../utils/auth.js';

registerHandler(MESSAGE_TYPES.PORTFOLIO_ADD, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { symbol, quantity, avgPrice } = message.data;
    
    // Validate input
    if (!symbol || quantity <= 0 || avgPrice <= 0) {
      return createErrorResponse(
        message,
        'INVALID_INPUT',
        'Thông tin không hợp lệ'
      );
    }
    
    // Call Supabase with retry
    const data = await supabaseWithRetry(async () => {
      const result = await supabase
        .from('portfolio')
        .insert({
          user_id: userId,
          symbol: symbol.toUpperCase(),
          quantity,
          avg_price: avgPrice
        })
        .select()
        .single();
      
      if (result.error) throw result.error;
      return result.data;
    });
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_ADDED, data);
  } catch (error) {
    if (error.errorCode) return error; // Already formatted by requireAuth
    
    return createErrorResponse(
      message,
      'PORTFOLIO_ADD_ERROR',
      'Không thể thêm cổ phiếu. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

// Note: Realtime updates được handle bởi UI Realtime subscriptions,
// KHÔNG phải background broadcast
```

---

## Message Flow

### Example: Send Prompt to ChatGPT

```
┌─────┐                  ┌──────────┐                ┌─────────┐              ┌─────────┐
│ UI  │                  │Background│                │ Content │              │ChatGPT  │
└──┬──┘                  └────┬─────┘                └────┬────┘              └────┬────┘
   │                          │                           │                        │
   │ SEND_PROMPT              │                           │                        │
   ├─────────────────────────►│                           │                        │
   │                          │                           │                        │
   │                          │ CHATGPT_SEND_INPUT        │                        │
   │                          ├──────────────────────────►│                        │
   │                          │                           │                        │
   │                          │                           │ inputAndSendPrompt()   │
   │                          │                           ├───────────────────────►│
   │                          │                           │                        │
   │                          │ CHATGPT_INPUT_SENT        │                        │
   │                          │◄──────────────────────────┤                        │
   │ PROMPT_SENT              │                           │                        │
   │◄─────────────────────────┤                           │                        │
   │                          │                           │                        │
   │                          │ CHATGPT_GET_OUTPUT        │                        │
   │                          ├──────────────────────────►│                        │
   │                          │                           │ waitForStableResponse()│
   │                          │                           ├───────────────────────►│
   │                          │                           │                        │
   │                          │ CHATGPT_OUTPUT_READY      │ getLatestMessage()     │
   │                          │◄──────────────────────────┤◄───────────────────────┤
   │                          │                           │                        │
   │                          │ Save to Supabase          │                        │
   │                          │ (chat_history table)      │                        │
   │                          │                           │                        │
   │ Display result           │                           │                        │
   │◄─────────────────────────┤                           │                        │
   │                          │                           │                        │
```

### Message Schema

**Base Structure** (`src/shared/messageSchema.js`):
```javascript
{
  v: 1,                      // Schema version
  type: 'CHATGPT_SEND_INPUT', // Message type
  correlationId: 'uuid',      // Trace request/response
  timestamp: 1234567890,      // When created
  data: { /* payload */ }     // Message-specific data
}
```

**Response**:
```javascript
{
  v: 1,
  type: 'CHATGPT_INPUT_SENT',
  correlationId: 'uuid',      // Same as request
  inResponseTo: 'CHATGPT_SEND_INPUT',
  timestamp: 1234567891,
  data: { success: true, chatId: 'c123' }
}
```

**Error Response**:
```javascript
{
  v: 1,
  type: 'ERROR',
  correlationId: 'uuid',
  errorCode: 'TIMEOUT',
  errorMessage: 'ChatGPT did not respond',
  details: { /* additional info */ }
}
```

---

## Storage Strategy

### Supabase PostgreSQL

**Architecture**: Cloud-first, không sử dụng local storage

**Database Schema**:

```sql
-- Users table (managed by Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt Templates
CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_favorite BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories/Tags
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT, -- hex color code
  icon TEXT, -- emoji or icon name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_category_per_user UNIQUE(user_id, name)
);

-- Chat History
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  chat_url TEXT,
  prompt TEXT NOT NULL,
  response TEXT,
  prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL, -- Link to template if used
  timestamp BIGINT NOT NULL,
  run_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_chat_per_user UNIQUE(user_id, chat_id)
);

-- Portfolio
CREATE TABLE portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  avg_price DECIMAL(15, 2) NOT NULL,
  current_price DECIMAL(15, 2),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_symbol_per_user UNIQUE(user_id, symbol)
);

-- Errors (Retrospective)
CREATE TABLE errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('critical', 'high', 'warning', 'info')),
  type TEXT CHECK (type IN ('general', 'prompt', 'response', 'connection', 'timeout')),
  timestamp BIGINT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Runs
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  status TEXT,
  metadata JSONB,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_prompts_user ON prompts(user_id);
CREATE INDEX idx_prompts_category ON prompts(category_id);
CREATE INDEX idx_prompts_favorite ON prompts(user_id, is_favorite);
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_chat_history_user_timestamp ON chat_history(user_id, timestamp DESC);
CREATE INDEX idx_chat_history_prompt ON chat_history(prompt_id);
CREATE INDEX idx_portfolio_user ON portfolio(user_id);
CREATE INDEX idx_errors_user_timestamp ON errors(user_id, timestamp DESC);
CREATE INDEX idx_runs_user_timestamp ON runs(user_id, timestamp DESC);
```

**Row Level Security (RLS)**:
```sql
-- Enable RLS on all tables
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own prompts" ON prompts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prompts" ON prompts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prompts" ON prompts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prompts" ON prompts
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own chat_history" ON chat_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat_history" ON chat_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat_history" ON chat_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat_history" ON chat_history
  FOR DELETE USING (auth.uid() = user_id);

-- Repeat for other tables...
```

**Service Layer** (`src/supabaseService.js`):
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Chat History Operations
export async function addChatHistory(chatData) {
  const { data, error } = await supabase
    .from('chat_history')
    .insert({
      user_id: (await supabase.auth.getUser()).data.user.id,
      ...chatData
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getChatHistory(limit = 100) {
  const { data, error } = await supabase
    .from('chat_history')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data;
}

// Portfolio Operations
export async function addToPortfolio(symbol, quantity, avgPrice) {
  const { data, error } = await supabase
    .from('portfolio')
    .upsert({
      user_id: (await supabase.auth.getUser()).data.user.id,
      symbol,
      quantity,
      avg_price: avgPrice,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,symbol' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getPortfolio() {
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .order('symbol');
  
  if (error) throw error;
  return data;
}

// Error Tracking
export async function addError(errorData) {
  const { data, error } = await supabase
    .from('errors')
    .insert({
      user_id: (await supabase.auth.getUser()).data.user.id,
      ...errorData
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
```

**Realtime Subscriptions**:
```javascript
// Listen to portfolio changes
const portfolioChannel = supabase
  .channel('portfolio_changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'portfolio',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('Portfolio updated:', payload);
      // Update UI
    }
  )
  .subscribe();
```

**Retry Pattern with Exponential Backoff**:
```javascript
async function supabaseWithRetry(operation, operationName, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      if (error.code === 'PGRST116') throw error; // Not found, không retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

---

## Key Patterns & Best Practices

### 1. Handler Registration Pattern

**Auto-registration via import**:
```javascript
// src/background/handlers/index.js
import './chatgpt.js';
import './portfolio.js';
import './history.js';
// ... all handlers auto-register on import

// src/background/index.js
import './handlers/index.js'; // Loads all handlers
```

### 2. Response Helpers

```javascript
// Success
return createResponse(originalMessage, MESSAGE_TYPES.PORTFOLIO_ADDED, {
  success: true,
  data: { id: 'p123' }
});

// Error
return createErrorResponse(originalMessage, 'INVALID_INPUT', 'Symbol is required');
```

### 3. Timeout Safety

```javascript
function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// Usage
await withTimeout(
  chrome.tabs.sendMessage(tabId, message),
  5000,
  'sendMessage'
);
```

### 4. Structured Logging

```javascript
// src/logger.js
const logger = createLogger('Portfolio');

logger.info('Stock added', { symbol: 'VNM', quantity: 100 });
// Output: [Portfolio] Stock added symbol=VNM, quantity=100
```

### 5. Correlation ID Tracing

```javascript
const correlationId = generateCorrelationId();

// Request
chrome.runtime.sendMessage({ 
  type: 'CHATGPT_SEND_INPUT', 
  correlationId, 
  data: {...} 
});

// Response (same correlationId)
return createResponse(originalMessage, 'CHATGPT_INPUT_SENT', {...});
```

### 6. Supabase Middleware Pattern

**Background orchestrates tất cả Supabase operations**:

```javascript
// src/background/handlers/portfolio.js
import { supabase } from '../../supabaseService.js';
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';

// GET: Fetch portfolio
registerHandler(MESSAGE_TYPES.PORTFOLIO_GET, async (message) => {
  try {
    const { data, error } = await supabase
      .from('portfolio')
      .select('*')
      .order('symbol');
    
    if (error) throw error;
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_DATA, { items: data });
  } catch (error) {
    return createErrorResponse(message, 'PORTFOLIO_FETCH_ERROR', error.message);
  }
});

// ADD: Insert new item
registerHandler(MESSAGE_TYPES.PORTFOLIO_ADD, async (message) => {
  try {
    const { symbol, quantity, avgPrice } = message.data;
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    const { data, error } = await supabase
      .from('portfolio')
      .insert({ user_id: userId, symbol, quantity, avg_price: avgPrice })
      .select()
      .single();
    
    if (error) throw error;
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_ADDED, data);
  } catch (error) {
    return createErrorResponse(message, 'PORTFOLIO_ADD_ERROR', error.message);
  }
});

// UPDATE: Modify existing item
registerHandler(MESSAGE_TYPES.PORTFOLIO_UPDATE, async (message) => {
  try {
    const { id, updates } = message.data;
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    const { data, error } = await supabase
      .from('portfolio')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId) // Security: chỉ update own data
      .select()
      .single();
    
    if (error) throw error;
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_UPDATED, data);
  } catch (error) {
    return createErrorResponse(message, 'PORTFOLIO_UPDATE_ERROR', error.message);
  }
});

// DELETE: Remove item
registerHandler(MESSAGE_TYPES.PORTFOLIO_REMOVE, async (message) => {
  try {
    const { id } = message.data;
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    const { error } = await supabase
      .from('portfolio')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) throw error;
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_REMOVED, { id });
  } catch (error) {
    return createErrorResponse(message, 'PORTFOLIO_REMOVE_ERROR', error.message);
  }
});
```

**Note về Realtime**: Realtime subscriptions KHÔNG được init trong Service Worker. 
Xem section "Realtime Subscriptions (UI Only)" trong External Integrations.

**Helper: Get Current User với Caching**:
```javascript
// src/background/utils/auth.js
import { supabase } from '../../supabaseConfig.js';

export async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('User not authenticated');
  }
  
  return user.id;
}

export async function requireAuth(message) {
  try {
    const userId = await getCurrentUserId();
    return userId;
  } catch (error) {
    throw createErrorResponse(
      message,
      'AUTH_REQUIRED',
      'Vui lòng đăng nhập để tiếp tục',
      { technicalError: error.message }
    );
  }
}
```

---

## External Integrations

### Supabase

**Purpose**: Primary database, authentication, và realtime backend. **Background service worker** orchestrates tất cả Supabase operations như middleware.

**Services**:
- **PostgreSQL**: Primary data store cho tất cả application data
- **Auth**: Email/password, OAuth, magic links (managed by background)
- **Realtime**: WebSocket subscriptions (background subscribes, broadcasts đến UI)
- **Storage**: (Future) File uploads cho attachments
- **Edge Functions**: (Future) Serverless functions cho complex operations

**Config với Service Worker Adapter** (`src/supabaseConfig.js`):
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom storage adapter cho Service Worker (không có localStorage)
const chromeStorageAdapter = {
  getItem: async (key) => {
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  },
  setItem: async (key, value) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key) => {
    await chrome.storage.local.remove([key]);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false // Service Worker không có URL
  }
});

// Note: Realtime subscriptions KHÔNG được init trong Service Worker
// Xem UI Realtime Pattern bên dưới
```

**Authentication Flow** (Background Handler):
```javascript
// src/background/handlers/supabase.js
import { supabase } from '../../supabaseConfig.js';
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';

// Login
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN, async (message) => {
  try {
    const { email, password } = message.data;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    // Broadcast auth state to all UI instances
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
      data: { user: data.user, session: data.session }
    });
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_SUCCESS, {
      user: data.user
    });
  } catch (error) {
    return createErrorResponse(message, 'AUTH_LOGIN_ERROR', error.message);
  }
});

// Logout
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT, async (message) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
      data: { user: null, session: null }
    });
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_LOGGED_OUT);
  } catch (error) {
    return createErrorResponse(message, 'AUTH_LOGOUT_ERROR', error.message);
  }
});

// Check auth status
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_CHECK, async (message) => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) throw error;
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_STATUS, {
      authenticated: !!user,
      user
    });
  } catch (error) {
    // Token expired or invalid
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_STATUS, {
      authenticated: false,
      user: null
    });
  }
});

// Auto-refresh token listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_TOKEN_REFRESHED,
      data: { session }
    });
  }
  if (event === 'SIGNED_OUT') {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
      data: { user: null, session: null }
    });
  }
});
```

**UI Auth Pattern**:
```javascript
// src/ui/auth.js
async function login(email, password) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
      data: { email, password }
    });
    
    if (response.errorCode) {
      // Show user-friendly error
      if (response.errorCode === 'AUTH_LOGIN_ERROR') {
        showError('Email hoặc mật khẩu không đúng');
      }
      return;
    }
    
    // Login success
    window.location.reload(); // Refresh UI
  } catch (error) {
    showError('Không thể kết nối. Vui lòng thử lại.');
  }
}

// Listen for auth state changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
    if (message.data.user) {
      showAuthenticatedUI(message.data.user);
    } else {
      showLoginUI();
    }
  }
});
```

**Realtime Subscriptions (UI Only - NOT in Service Worker)**:

⚠️ **CRITICAL**: Realtime WebSocket connections KHÔNG hoạt động trong Service Worker vì:
- SW có thể terminate bất kỳ lúc nào
- WebSocket connections bị đóng khi SW sleep
- Supabase Realtime cần persistent connection

**Solution**: Realtime subscriptions trong UI (side panel):

```javascript
// src/ui/portfolio.js
import { createClient } from '@supabase/supabase-js';

// Create separate Supabase client cho UI (có localStorage)
const supabaseUI = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    },
    realtime: {
      params: { eventsPerSecond: 10 }
    }
  }
);

let portfolioChannel = null;

// Init realtime khi UI load
export async function initPortfolioRealtime() {
  // Get current user từ background
  const authStatus = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK
  });
  
  if (!authStatus.data.authenticated) return;
  
  const userId = authStatus.data.user.id;
  
  portfolioChannel = supabaseUI
    .channel('portfolio_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'portfolio',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          addPortfolioItemToUI(payload.new);
        } else if (payload.eventType === 'UPDATE') {
          updatePortfolioItemInUI(payload.new);
        } else if (payload.eventType === 'DELETE') {
          removePortfolioItemFromUI(payload.old.id);
        }
      }
    )
    .subscribe();
}

// Cleanup khi UI unload
window.addEventListener('beforeunload', () => {
  if (portfolioChannel) {
    supabaseUI.removeChannel(portfolioChannel);
  }
});

// Call on page load
initPortfolioRealtime();
```

**Alternative: Polling Pattern** (nếu không dùng Realtime):
```javascript
// Poll changes mỗi 10s
setInterval(async () => {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.PORTFOLIO_GET
  });
  updatePortfolioUI(response.data.items);
}, 10000);
```

**Edge Functions** (Future):
```javascript
// Call edge function for complex operations
const { data, error } = await supabase.functions.invoke('analyze-portfolio', {
  body: { symbols: ['VNM', 'VIC', 'VHM'] }
});
```

### SSI iBoard API

**Purpose**: Real-time stock prices cho portfolio evaluation

**Endpoints**:
- `https://iboard-query.ssi.com.vn/stock/price/{symbol}`
- `https://iboard.ssi.com.vn/...` (market data)

**Integration Pattern với Alarms & Batch Updates**:

```javascript
// src/background/handlers/portfolio.js
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';

// Handler: Update tất cả stock prices (batch)
registerHandler(MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES, async (message) => {
  try {
    const userId = (await supabase.auth.getUser()).data.user.id;
    
    // 1. Get all portfolio items
    const { data: items, error: fetchError } = await supabase
      .from('portfolio')
      .select('id, symbol')
      .eq('user_id', userId);
    
    if (fetchError) throw fetchError;
    if (!items || items.length === 0) {
      return createResponse(message, MESSAGE_TYPES.PORTFOLIO_PRICES_UPDATED, {
        updated: 0
      });
    }
    
    // 2. Fetch prices từ SSI (batch request nếu API support)
    const symbols = items.map(i => i.symbol);
    const prices = await fetchStockPricesBatch(symbols);
    
    // 3. Batch update Supabase
    const updates = items.map(item => ({
      id: item.id,
      current_price: prices[item.symbol],
      updated_at: new Date().toISOString()
    }));
    
    const { error: updateError } = await supabase
      .from('portfolio')
      .upsert(updates);
    
    if (updateError) throw updateError;
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_PRICES_UPDATED, {
      updated: updates.length,
      prices
    });
  } catch (error) {
    return createErrorResponse(message, 'PRICE_UPDATE_ERROR', error.message);
  }
});

// Helper: Fetch multiple stock prices
async function fetchStockPricesBatch(symbols) {
  const prices = {};
  
  // Parallel fetch với limit (tránh rate limiting)
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(symbol => fetchSingleStockPrice(symbol))
    );
    
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        prices[batch[idx]] = result.value;
      } else {
        // Fallback: giữ giá cũ
        prices[batch[idx]] = null;
      }
    });
    
    // Delay giữa các batches (avoid rate limiting)
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return prices;
}

async function fetchSingleStockPrice(symbol) {
  const response = await fetch(
    `https://iboard-query.ssi.com.vn/stock/price/${symbol}`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.lastPrice;
}
```

**Alarms Setup** (automatic price updates):
```javascript
// src/background/handlers/alarms.js
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';

// Create alarms on extension install/update
chrome.runtime.onInstalled.addListener(async () => {
  // Price updates every 5 minutes during market hours
  chrome.alarms.create('updateStockPrices', {
    periodInMinutes: 5
  });
  
  // Cleanup old data daily at midnight
  chrome.alarms.create('dailyCleanup', {
    when: getNextMidnight(),
    periodInMinutes: 1440 // 24h
  });
});

// Alarm listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateStockPrices') {
    // Only update during market hours (9:00-15:00 VN time)
    const hour = new Date().getHours();
    if (hour >= 9 && hour < 15) {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES
      });
    }
  } else if (alarm.name === 'dailyCleanup') {
    // Cleanup old chat history (keep last 100)
    // Cleanup resolved errors (older than 30 days)
    // ... implementation
  }
});

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}
```

---

## Data Migration Strategy

### Migrate từ Local Storage sang Supabase

**First-time User Setup**:
```javascript
// src/background/handlers/migration.js
import { supabase } from '../../supabaseConfig.js';

registerHandler(MESSAGE_TYPES.MIGRATE_LOCAL_TO_SUPABASE, async (message) => {
  try {
    const userId = await requireAuth(message);
    
    // 1. Read old data từ chrome.storage.local
    const oldData = await chrome.storage.local.get([
      'portfolio',
      'chatHistory',
      'errorList',
      'settings'
    ]);
    
    // 2. Migrate portfolio
    if (oldData.portfolio && oldData.portfolio.length > 0) {
      const portfolioItems = oldData.portfolio.map(item => ({
        user_id: userId,
        symbol: item.symbol,
        quantity: item.quantity,
        avg_price: item.avgPrice || item.avg_price,
        current_price: item.currentPrice || item.current_price
      }));
      
      await supabase.from('portfolio').insert(portfolioItems);
    }
    
    // 3. Migrate chat history
    if (oldData.chatHistory && oldData.chatHistory.length > 0) {
      const historyItems = oldData.chatHistory.map(item => ({
        user_id: userId,
        chat_id: item.chatId,
        chat_url: item.chatUrl,
        prompt: item.prompt,
        response: item.response,
        timestamp: item.timestamp,
        run_id: item.runId
      }));
      
      await supabase.from('chat_history').insert(historyItems);
    }
    
    // 4. Migrate errors
    if (oldData.errorList && oldData.errorList.length > 0) {
      const errorItems = oldData.errorList.map(item => ({
        user_id: userId,
        title: item.title,
        description: item.description,
        severity: item.severity,
        type: item.type,
        timestamp: item.timestamp,
        resolved: item.resolved || false
      }));
      
      await supabase.from('errors').insert(errorItems);
    }
    
    // 5. Migrate settings
    if (oldData.settings) {
      await supabase.from('settings').upsert({
        user_id: userId,
        config: oldData.settings
      });
    }
    
    // 6. Clear old local storage (backup to file first)
    const backup = JSON.stringify(oldData);
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    chrome.downloads.download({
      url,
      filename: `chatgpt-assistant-backup-${Date.now()}.json`
    });
    
    // Clear after backup
    await chrome.storage.local.clear();
    
    return createResponse(message, MESSAGE_TYPES.MIGRATION_COMPLETE, {
      migrated: {
        portfolio: oldData.portfolio?.length || 0,
        chatHistory: oldData.chatHistory?.length || 0,
        errors: oldData.errorList?.length || 0
      }
    });
  } catch (error) {
    return createErrorResponse(
      message,
      'MIGRATION_ERROR',
      'Không thể chuyển dữ liệu. Dữ liệu cũ vẫn được giữ nguyên.',
      { technicalError: error.message }
    );
  }
});
```

**Check Migration Status on Startup**:
```javascript
// src/background/index.js
chrome.runtime.onStartup.addListener(async () => {
  const hasOldData = await chrome.storage.local.get(['portfolio', 'chatHistory']);
  
  if (hasOldData.portfolio || hasOldData.chatHistory) {
    // Có data cũ → show migration prompt
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.MIGRATION_AVAILABLE,
      data: {
        itemCount: (hasOldData.portfolio?.length || 0) + 
                   (hasOldData.chatHistory?.length || 0)
      }
    });
  }
});
```

---

## Build & Deployment

### Build Process

**Tool**: Vite 5.0

**Config**: `vite.config.js`

**Entry Points**:
```javascript
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: 'src/background/index.js',
        content: 'src/content.js',
        ui: 'src/ui/index.js'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js'
      }
    }
  }
});
```

**Output** (`dist/`):
- `background.js` (~513 KB) — Service Worker
- `content.js` (~13 KB) — Content script
- `ui.js` (~67 KB) — Side panel UI
- `manifest.json`, `sidepanel.html`, `images/`, `prompts/` (copied via plugin)

### Commands

```bash
# Development build
npm run build

# Watch mode
npm run build:watch

# Unit tests
npm run test:unit

# E2E tests (Playwright)
npm run test:e2e
npm run test:e2e:ui      # Interactive mode
npm run test:e2e:headed  # Visible browser
```

### Load Extension

```bash
# 1. Build
npm run build

# 2. Chrome
chrome://extensions → Developer mode → Load unpacked → dist/
```

---

## Testing Strategy

### Unit Tests

**Tool**: Vitest

**Location**: `tests/unit/`

**Pattern**: Mock `chrome.*` APIs
```javascript
// tests/unit/messageRouter.test.js
global.chrome = {
  runtime: { sendMessage: vi.fn() },
  storage: { local: { get: vi.fn(), set: vi.fn() } }
};

import { route } from '../../src/background/messageRouter.js';

test('routes message to registered handler', async () => {
  const message = { type: 'PING', correlationId: '123' };
  const response = await route(message, {});
  expect(response.type).toBe('PONG');
});
```

### E2E Tests

**Tool**: Playwright

**Location**: `tests/e2e/`

**Pattern**: Load extension, navigate ChatGPT, verify flows
```javascript
// tests/e2e/extension-load.spec.js
test('loads extension and opens side panel', async ({ page, context }) => {
  // Load extension
  const extensionId = await loadExtension(context, './dist');
  
  // Navigate to side panel
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  
  // Verify UI
  await expect(page.locator('text=Portfolio')).toBeVisible();
});
```

---

## Security Considerations

### Permissions

**Minimal principle**: Chỉ yêu cầu permissions thực sự cần

**Current**:
- `storage`: Supabase auth token persistence trong Service Worker
- `tabs`: Mở/quản lý ChatGPT tabs
- `scripting`: Inject content script
- `alarms`: Periodic tasks (stock price updates, cleanup)
- `sidePanel`: Side panel UI
- `contextMenus`: Right-click actions
- `activeTab`: Đọc URL của tab hiện tại

### Host Permissions

- `https://chatgpt.com/*`: Content script + fetch
- `https://iboard-query.ssi.com.vn/*`: Market data API
- `https://iboard.ssi.com.vn/*`: Market data API
- `https://*.supabase.co/*`: Supabase backend API (database + auth + realtime)

### Data Protection

- **No PII logging**: Tránh log dữ liệu nhạy cảm
- **Supabase Auth**: Email/password, OAuth, magic links
- **Row Level Security**: Mỗi user chỉ truy cập được data của mình
- **HTTPS Only**: Tất cả connections encrypted với TLS
- **Secrets**: Supabase keys trong `.env` không commit vào git
- **Anon Key**: Public key với RLS protection, không expose service_role key

---

## Performance Optimization

### Service Worker Lifecycle

**Challenge**: SW có thể bị terminate bất kỳ lúc nào

**Solution (Middleware Pattern)**:
- Background là **stateless middleware**: nhận message → call Supabase → trả response
- Không lưu data locally - mọi request là independent call đến Supabase
- Supabase client trong background tự động cache auth token (persist in IndexedDB)
- Realtime subscriptions được re-establish khi SW wake up
- Handlers orchestrate Supabase operations, không giữ state giữa calls

### Content Script

**Challenge**: ChatGPT selectors fragile, DOM heavy

**Solution**:
- Nhiều fallback selectors
- Minimal DOM traversal
- Event delegation
- Debounce user interactions

### Database Performance

**Challenge**: Network latency cho mỗi Supabase query

**Solution**:
- Use indexes trên user_id và timestamp columns
- Limit queries với pagination (LIMIT + OFFSET)
- Cache frequently accessed data trong memory (short-lived)
- Batch operations khi có thể (bulk insert/update)
- Use Supabase Realtime thay vì polling

---

## Data Migration Strategy

### Migrate từ Local Storage sang Supabase

**First-time User Setup**:
```javascript
// src/background/handlers/migration.js
import { supabase } from '../../supabaseConfig.js';

registerHandler(MESSAGE_TYPES.MIGRATE_LOCAL_TO_SUPABASE, async (message) => {
  try {
    const userId = await requireAuth(message);
    
    // 1. Read old data từ chrome.storage.local
    const oldData = await chrome.storage.local.get([
      'portfolio',
      'chatHistory',
      'errorList',
      'settings'
    ]);
    
    // 2. Migrate portfolio
    if (oldData.portfolio && oldData.portfolio.length > 0) {
      const portfolioItems = oldData.portfolio.map(item => ({
        user_id: userId,
        symbol: item.symbol,
        quantity: item.quantity,
        avg_price: item.avgPrice || item.avg_price,
        current_price: item.currentPrice || item.current_price
      }));
      
      await supabase.from('portfolio').insert(portfolioItems);
    }
    
    // 3. Migrate chat history
    if (oldData.chatHistory && oldData.chatHistory.length > 0) {
      const historyItems = oldData.chatHistory.map(item => ({
        user_id: userId,
        chat_id: item.chatId,
        chat_url: item.chatUrl,
        prompt: item.prompt,
        response: item.response,
        timestamp: item.timestamp,
        run_id: item.runId
      }));
      
      await supabase.from('chat_history').insert(historyItems);
    }
    
    // 4. Migrate errors
    if (oldData.errorList && oldData.errorList.length > 0) {
      const errorItems = oldData.errorList.map(item => ({
        user_id: userId,
        title: item.title,
        description: item.description,
        severity: item.severity,
        type: item.type,
        timestamp: item.timestamp,
        resolved: item.resolved || false
      }));
      
      await supabase.from('errors').insert(errorItems);
    }
    
    // 5. Migrate settings
    if (oldData.settings) {
      await supabase.from('settings').upsert({
        user_id: userId,
        config: oldData.settings
      });
    }
    
    // 6. Clear old local storage (backup to file first)
    const backup = JSON.stringify(oldData);
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    chrome.downloads.download({
      url,
      filename: `chatgpt-assistant-backup-${Date.now()}.json`
    });
    
    // Clear after backup
    await chrome.storage.local.clear();
    
    return createResponse(message, MESSAGE_TYPES.MIGRATION_COMPLETE, {
      migrated: {
        portfolio: oldData.portfolio?.length || 0,
        chatHistory: oldData.chatHistory?.length || 0,
        errors: oldData.errorList?.length || 0
      }
    });
  } catch (error) {
    return createErrorResponse(
      message,
      'MIGRATION_ERROR',
      'Không thể chuyển dữ liệu. Dữ liệu cũ vẫn được giữ nguyên.',
      { technicalError: error.message }
    );
  }
});
```

**Check Migration Status on Startup**:
```javascript
// src/background/index.js
chrome.runtime.onStartup.addListener(async () => {
  const hasOldData = await chrome.storage.local.get(['portfolio', 'chatHistory']);
  
  if (hasOldData.portfolio || hasOldData.chatHistory) {
    // Có data cũ → show migration prompt
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.MIGRATION_AVAILABLE,
      data: {
        itemCount: (hasOldData.portfolio?.length || 0) + 
                   (hasOldData.chatHistory?.length || 0)
      }
    });
  }
});
```

---

## Future Enhancements

### Planned Features

1. **Advanced Portfolio Analytics**
   - Profit/Loss tracking
   - Historical performance charts
   - Diversification analysis

2. **English Learning Gamification**
   - Streak tracking
   - Achievement badges
   - Spaced repetition

3. **AI-Powered Retrospective**
   - Auto-suggest error patterns
   - Predict common mistakes
   - Learning recommendations

4. **Advanced Analytics**
   - Use Supabase Edge Functions cho complex queries
   - Historical trend analysis
   - AI-powered insights

5. **Collaboration Features**
   - Share portfolio analysis
   - Team chat history
   - Collaborative error retrospectives

### Technical Debt

- [ ] Add comprehensive E2E test coverage (currently ~30%)
- [ ] Implement retry logic cho tất cả Supabase calls
- [ ] Migrate to TypeScript (better type safety)
- [ ] Add optimistic UI updates với Supabase Realtime
- [ ] Improve error messages (user-friendly)
- [ ] Implement connection pooling cho Supabase queries
- [ ] Add query result caching layer

---

## Troubleshooting

### Common Issues

**1. Service Worker không hoạt động**
- **Cause**: Listener không đăng ký tại top-level
- **Fix**: Move listener registration outside async functions

**2. Content script không inject**
- **Cause**: Tab load incomplete hoặc URL không match
- **Fix**: Check manifest `matches`, wait for `tab.status === 'complete'`

**3. ChatGPT selector fail**
- **Cause**: ChatGPT UI update
- **Fix**: Update selectors trong `src/content.js` với fallbacks

**4. Supabase query fails**
- **Cause**: RLS policies chưa đúng hoặc user chưa authenticated
- **Fix**: Check RLS policies trong Supabase Dashboard, verify auth token

**5. Build size quá lớn**
- **Cause**: Vite bundle toàn bộ dependencies
- **Fix**: Check `rollupOptions.external`, minify output

### Debug Tips

```bash
# Service Worker logs
chrome://extensions → Details → Inspect views: Service worker

# Content script logs
F12 DevTools trên tab chatgpt.com

# Check Supabase data
# DevTools Console:
import { supabase } from './supabaseService.js';
const { data } = await supabase.from('portfolio').select('*');
console.log(data);

# Check auth status
const { data: { user } } = await supabase.auth.getUser();
console.log(user);

# Monitor Realtime connections
# Supabase Dashboard → Realtime Inspector

# Check message flow
# Add breakpoints trong messageRouter.js
```

---

## References

- [Chrome Extension MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Vite Documentation](https://vitejs.dev/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Playwright Testing](https://playwright.dev/)

---

**Maintainers**: AI Coding Team  
**Last Review**: Tháng 1 năm 2026  
**Status**: ✅ Production (v2.0)
