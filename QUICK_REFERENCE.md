# 📖 QUICK REFERENCE GUIDE
## Response Structure & Consistency Patterns

---

## ✅ RESPONSE STRUCTURE CHEAT SHEET

### Handler Pattern (createResponse spreads at TOP-LEVEL)

```javascript
// ✅ CORRECT: Import and use createResponse
import { createResponse, MESSAGE_TYPES } from '../../shared/messageSchema.js';

registerHandler(MESSAGE_TYPES.SEND_PROMPT, async (message) => {
  try {
    // ... do work ...
    return createResponse(message, MESSAGE_TYPES.PROMPT_SENT, {
      chatId,           // ← Spreads to top-level
      chatUrl,          // ← Spreads to top-level
      success: true
    });
  } catch (error) {
    return createErrorResponse(message, 'ERROR_CODE', 'Vietnamese message');
  }
});
```

### Response Object Structure

```javascript
// Result of the above handler:
{
  v: 1,
  type: 'PROMPT_SENT',
  correlationId: 'uuid',
  timestamp: 1234567890,
  
  // ✅ SPREADED properties (top-level)
  chatId: 'c123',         // ← Direct access: response.chatId
  chatUrl: 'https://...',  // ← Direct access: response.chatUrl
  success: true           // ← Direct access: response.success
  
  // ❌ NOT nested in response.payload or response.data
}
```

### UI Access Pattern

```javascript
// ✅ CORRECT - Direct property access
const response = await chrome.runtime.sendMessage({...});

const chatId = response.chatId;        // ✅ Works
const chatUrl = response.chatUrl;      // ✅ Works
const success = response.success;      // ✅ Works

// ❌ WRONG - These don't exist
const chatId = response.payload?.chatId;    // ❌ undefined
const config = response.data?.config;       // ❌ undefined

// 🟡 FALLBACK (for backward compatibility)
const output = response?.output || response?.payload?.output;  // Fallback if needed
```

---

## 📋 CONSISTENCY CHECKLIST

When creating new features, verify:

### Response Handling
- [ ] Handler uses `createResponse(msg, type, { fields... })`
- [ ] UI accesses fields directly: `response.fieldName`
- [ ] Not accessing `response.payload` or `response.data`
- [ ] Error responses use `createErrorResponse()`

### Chat Session Creation
- [ ] SEND_PROMPT has `createNewChat: true`
- [ ] UI passes `createNewChat: true` when sending prompts
- [ ] Default handler logic: `!== false` (so undefined = true)

### Authentication
- [ ] Handler calls `await requireAuth(message)` first
- [ ] Returns `createErrorResponse()` if not authenticated
- [ ] Never queries database before auth check

### Error Handling
- [ ] Wrap Supabase calls in `supabaseWithRetry()`
- [ ] Catch errors and map to Vietnamese messages
- [ ] Return `createErrorResponse()` with proper error code

### Timestamps
- [ ] BIGINT columns: Use `Date.now()` (milliseconds)
- [ ] TIMESTAMPTZ columns: Use `new Date().toISOString()` (ISO string)
- [ ] Never send raw Date objects to database

### Message Types
- [ ] Define both request and response message types
- [ ] Response type = REQUEST_TYPE + "_" + RESPONSE_SUFFIX
- [ ] Add to MESSAGE_TYPES in messageSchema.js

---

## 🔍 DEBUGGING RESPONSE ISSUES

### Problem: Data not showing in UI

```javascript
// ❌ Wrong diagnosis: Handler not returning data
// ✅ Correct: Check if UI is accessing wrong property

// Handler returns:
return createResponse(msg, 'RESULT', { output: 'hello' });

// Result:
{ type: 'RESULT', output: 'hello' }

// UI code:
// ❌ WRONG: Looking for response.data.output
console.log(response.data?.output);  // undefined!

// ✅ CORRECT: Direct access
console.log(response.output);  // 'hello'
```

### Debug Pattern

```javascript
// Add this to UI to see actual response structure
const response = await chrome.runtime.sendMessage({...});
console.log('Full response:', response);
console.log('Keys:', Object.keys(response));
console.log('Direct access - output:', response.output);
console.log('Wrong access - payload:', response.payload);
```

---

## 📊 COMMON PATTERNS

### Pattern 1: Simple CRUD Handler

```javascript
registerHandler(MESSAGE_TYPES.ITEM_GET, async (message) => {
  const userId = await requireAuth(message);
  
  const data = await supabaseWithRetry(async () => {
    const result = await supabase
      .from('items')
      .select('*')
      .eq('user_id', userId);
    
    if (result.error) throw result.error;
    return result.data;
  });
  
  // ✅ Spreads items at top-level
  return createResponse(message, MESSAGE_TYPES.ITEM_DATA, {
    items: data,
    timestamp: Date.now()
  });
});
```

### Pattern 2: UI Calling Handler

```javascript
async function loadItems() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: MESSAGE_VERSION,
      type: MESSAGE_TYPES.ITEM_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    
    if (response.errorCode) {
      showError(response.errorMessage);
      return;
    }
    
    // ✅ Direct access to spread properties
    const items = response.items || [];
    renderItems(items);
  } catch (error) {
    showError('Lỗi: Không thể tải dữ liệu');
  }
}
```

### Pattern 3: Error Response

```javascript
// Handler
if (!input) {
  return createErrorResponse(
    message,
    'INVALID_INPUT',
    'Vui lòng nhập thông tin',
    { field: 'input' }
  );
}

// UI
if (response.errorCode) {
  console.error(`[${response.errorCode}]`, response.errorMessage);
  if (response.details) console.log('Details:', response.details);
  showError(response.errorMessage);
}
```

---

## 🚨 COMMON MISTAKES

| ❌ Wrong | ✅ Right | Why |
|---------|----------|-----|
| `response.payload.chatId` | `response.chatId` | Spreads at top-level |
| `response.data.config` | `response.config` | No nested data wrapper |
| `Date.toString()` | `Date.now()` | BIGINT expects ms |
| `new Date()` | `new Date().toISOString()` | ISO for TIMESTAMPTZ |
| Async listener registration | Top-level sync | SW lifecycle requires sync |
| `localStorage` in SW | `chrome.storage.local` | No DOM in Service Worker |

---

## 📝 TEMPLATES

### Handler Template

```javascript
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabaseWithRetry } from '../../utils/supabaseRetry.js';
import { requireAuth } from '../../utils/auth.js';

registerHandler(MESSAGE_TYPES.YOUR_REQUEST, async (message) => {
  try {
    // 1. Check authentication
    const userId = await requireAuth(message);
    
    // 2. Validate input
    if (!message.data?.required) {
      return createErrorResponse(message, 'INVALID_INPUT', 'Thiếu thông tin bắt buộc');
    }
    
    // 3. Call Supabase with retry
    const data = await supabaseWithRetry(async () => {
      const result = await supabase
        .from('table_name')
        .select('*')
        .eq('user_id', userId);
      
      if (result.error) throw result.error;
      return result.data;
    });
    
    // 4. Return with spreaded properties ✅
    return createResponse(message, MESSAGE_TYPES.YOUR_RESPONSE, {
      items: data,
      success: true,
      timestamp: Date.now()
    });
  } catch (error) {
    return createErrorResponse(
      message,
      'OPERATION_ERROR',
      'Lỗi: Vui lòng thử lại',
      { technical: error.message }
    );
  }
});
```

### UI Template

```javascript
async function doAction() {
  try {
    // 1. Send message to background
    const response = await chrome.runtime.sendMessage({
      v: MESSAGE_VERSION,
      type: MESSAGE_TYPES.YOUR_REQUEST,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        // Your payload
      }
    });
    
    // 2. Check for errors
    if (response.errorCode) {
      showError(response.errorMessage);
      return;
    }
    
    // 3. Access spreaded properties directly ✅
    const items = response.items || [];
    const success = response.success;
    
    // 4. Update UI
    renderResults(items);
  } catch (error) {
    showError('Lỗi: Không thể kết nối');
  }
}
```

---

## 🔧 MAINTENANCE CHECKLIST

When modifying code:

- [ ] Response structures use spread pattern (top-level fields)
- [ ] All UI access uses direct property access
- [ ] Timestamps use `Date.now()` for BIGINT
- [ ] Timestamps use `.toISOString()` for TIMESTAMPTZ
- [ ] All handlers call `requireAuth()` first
- [ ] All Supabase calls wrapped in `supabaseWithRetry()`
- [ ] All errors return Vietnamese messages
- [ ] Chat creation uses `createNewChat: true`
- [ ] Build passes with 0 errors

---

## 📚 REFERENCES

- Full Architecture: `/docs/ARCHITECTURE.md`
- Storage Explanation: `/docs/STORAGE_EXPLAINED.md`
- Message Schema: `src/shared/messageSchema.js`
- Example Handler: `src/background/handlers/prompt.js`
- Example UI: `src/ui/results.js`

---

**Created**: January 24, 2026  
**Purpose**: Quick reference for maintaining consistency  
**Last Updated**: Comprehensive Review Phase
