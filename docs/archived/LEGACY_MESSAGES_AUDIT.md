# Legacy Message Format Audit - January 18, 2026

## Summary
Found **13 locations** using legacy `{ action: '...' }` format instead of proper message schema.

## Critical Issues

### ❌ Missing Handlers (NO backend support)
These actions have NO handlers in background - **BROKEN FUNCTIONALITY**:

1. **`get_result`** - Used in:
   - `src/ui/results.js` (line 54, 80)
   - `src/ui/errors.js` (line 259)
   
2. **`get_errors`** - Used in:
   - `src/ui/errors.js` (line 167)
   
3. **`clear_errors`** - Used in:
   - `src/ui/errors.js` (line 203)
   
4. **`run_retrospective`** - Used in:
   - `src/ui/errors.js` (line 236)
   
5. **`get_chat_history`** - Used in:
   - `src/ui/history.js` (line 75)
   
6. **`clear_chat_history`** - Used in:
   - `src/ui/history.js` (line 122)

7. **`prompt_sent`** (from content script) - Used in:
   - `src/content.js` (line 303)

### ⚠️ Has Handlers but Wrong Format
These have backend handlers but UI sends wrong format:

1. **`send_prompt`** - Used in:
   - `src/ui/results.js` (line 25)
   - `src/ui/settings.js` (line 86)
   - `src/ui/sync.js` (line 483)
   - ✅ **FIXED** in `src/ui/portfolio.js` (already migrated)
   
   **Handler exists**: `MESSAGE_TYPES.SEND_PROMPT` in `src/background/handlers/prompt.js`

2. **`ensure_chatgpt_open`** - Used in:
   - `src/ui/index.js` (line 127)
   
   **Handler exists**: `MESSAGE_TYPES.ENSURE_CHATGPT_OPEN` in `src/background/handlers/prompt.js`

## Available Message Types (in messageSchema.js)

### Existing handlers:
- ✅ `SEND_PROMPT` - has handler
- ✅ `ENSURE_CHATGPT_OPEN` - has handler
- ✅ `FIREBASE_SYNC`, `FIREBASE_RESTORE`, `FIREBASE_LIST_BACKUPS` - have handlers
- ✅ `STATE_GET`, `STATE_SET` - have handlers
- ✅ `CHATGPT_SEND_INPUT`, `CHATGPT_GET_OUTPUT` - have handlers
- ✅ `PORTFOLIO_ADD` - has handler (stub)

### Missing handlers (need to implement):
- ❌ No equivalent for `get_result`
- ❌ No equivalent for `get_errors`
- ❌ No equivalent for `clear_errors`
- ❌ No equivalent for `run_retrospective`
- ❌ No equivalent for `get_chat_history`
- ❌ No equivalent for `clear_chat_history`

## Action Plan

### Phase 1: Fix UI → Background (migrate to proper schema)
Fix these files to use proper message format:

1. **src/ui/results.js** (3 places)
   - Migrate `send_prompt` → `MESSAGE_TYPES.SEND_PROMPT`
   - Need handler for `get_result` OR use `CHATGPT_GET_OUTPUT`

2. **src/ui/settings.js** (1 place)
   - Migrate `send_prompt` → `MESSAGE_TYPES.SEND_PROMPT`

3. **src/ui/sync.js** (1 place)
   - Migrate `send_prompt` → `MESSAGE_TYPES.SEND_PROMPT`

4. **src/ui/index.js** (1 place)
   - Migrate `ensure_chatgpt_open` → `MESSAGE_TYPES.ENSURE_CHATGPT_OPEN`

5. **src/ui/errors.js** (4 places)
   - Need handlers OR migrate to existing types

6. **src/ui/history.js** (2 places)
   - Need handlers OR use `STATE_GET`/`STATE_SET`

### Phase 2: Create Missing Handlers
Need to implement these handlers if functionality is required:

1. **Result polling** - might already exist via `CHATGPT_GET_OUTPUT`
2. **Error management** - create handlers if needed
3. **History management** - might use storage directly

### Phase 3: Content Script Messages
Content script sending notifications - determine if these need handlers or can be ignored.

## Risk Assessment

**HIGH RISK** - Broken features:
- Error management UI (errors.js)
- Chat history UI (history.js)
- Result polling in errors.js

**MEDIUM RISK** - Works but wrong format:
- results.js, settings.js, sync.js, index.js

**LOW RISK** - Already fixed:
- portfolio.js ✅

## Recommendation

1. **IMMEDIATE**: Fix high-frequency UI calls (results.js, settings.js, index.js, sync.js)
2. **SHORT TERM**: Implement missing handlers or remove dead UI features
3. **LONG TERM**: Audit all chrome.runtime.sendMessage calls regularly
