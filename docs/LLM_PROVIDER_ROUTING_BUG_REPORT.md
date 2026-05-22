# Bug Report: LLM Provider Setting Ignored — Extension Luôn Dùng ChatGPT

## Tóm Tắt

Người dùng đã chọn **Gemini** (hoặc Claude) làm LLM provider trong Settings, nhưng tất cả các tính năng chat, writing, english learning vẫn tiếp tục gửi prompt **tới ChatGPT**. Cài đặt provider bị bỏ qua hoàn toàn.

---

## Nguyên Nhân Gốc Rễ (Root Cause)

Extension tồn tại **hai con đường song song** (dual path) để gửi prompt, nhưng hầu hết tính năng đang dùng con đường cũ — con đường này được hardcode thẳng vào ChatGPT và **không bao giờ đọc cài đặt `llm_provider`**.

```
┌─────────────────────────────────────────────────────────────────┐
│                  HAI ĐƯỜNG GỬI PROMPT                           │
├──────────────────────────┬──────────────────────────────────────┤
│  PATH 1: LEGACY (❌ BUG) │  PATH 2: MODERN (✅ CORRECT)        │
│  MESSAGE: SEND_PROMPT    │  MESSAGE: LLM_SEND_PROMPT            │
│  Handler: prompt.js      │  Handler: llmProvider.js             │
│  Đọc settings?: ❌ KHÔNG│  Đọc settings?: ✅ CÓ               │
│  Luôn dùng: ChatGPT      │  Dùng: LLMProviderFactory (đúng)    │
│                          │                                       │
│  Dùng bởi: writing,      │  Dùng bởi: Stock Research,           │
│  english, settings,      │  Watchlist Enrichment                │
│  portfolio, tea stock    │                                       │
└──────────────────────────┴──────────────────────────────────────┘
```

---

## Chi Tiết Từng Điểm Inconsistency

### 1. `SEND_PROMPT` Handler — Hardcode ChatGPT (Lỗi Chính)

**File**: `src/background/handlers/prompt.js`

```js
// ❌ HARDCODED: Luôn gọi ChatGPT bất kể cài đặt llm_provider là gì
registerHandler(MESSAGE_TYPES.SEND_PROMPT, async (message, sender) => {
  const result = await enqueue(async () => {
    // Hardcoded: chỉ tìm ChatGPT tab
    const tabResult = await ChatGPTSession.ensureChatGPTTab({ ... });
    // Hardcoded: chỉ gửi vào ChatGPT
    const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, prompt);
    ...
  });
});
```

**Hàm `getProviderConfig()` hoàn toàn không được gọi** trong handler này. Dù user đã chọn Gemini, handler này không hề biết.

---

### 2. `CHATGPT_SEND_INPUT` Handler — Tên Đã Nói Lên Tất Cả

**File**: `src/background/handlers/chatgpt.js`

```js
// ❌ HARDCODED: Cả tên message lẫn implementation đều gắn với ChatGPT
registerHandler(MESSAGE_TYPES.CHATGPT_SEND_INPUT, async (message, sender) => {
  const result = await enqueue(async () => {
    const tabResult = await ChatGPTSession.ensureChatGPTTab(options); // ChatGPT only
    await ChatGPTSession.sendInput(tabResult.tabId, prompt, mergedOptions); // ChatGPT only
  });
});
```

Handler này không có cơ chế để đọc hay sử dụng `llm_provider` setting.

---

### 3. Tất Cả UI Modules Dùng `SEND_PROMPT` — Không Ai Dùng `LLM_SEND_PROMPT`

| File | Hàm | Message Type Gửi | Provider Aware? |
|------|-----|-----------------|-----------------|
| `src/ui-preact/api/writingApi.js` | `sendWritingJob()` | `SEND_PROMPT` | ❌ |
| `src/ui-preact/api/writingApi.js` | `sendWritingJobWithFallback()` | `SEND_PROMPT` | ❌ |
| `src/ui-preact/api/writingApi.js` | `autoSelectTopic()` | `SEND_PROMPT` | ❌ |
| `src/ui-preact/api/englishApi.js` | `sendPromptToChatGPT()` | `SEND_PROMPT` | ❌ |
| `src/ui-preact/api/settingsApi.js` | `sendPromptNow()` | `SEND_PROMPT` | ❌ |
| `src/ui-preact/components/TeaStockModal.jsx` | submit handler | `SEND_PROMPT` | ❌ |
| `src/ui-preact/components/EvaluatePortfolioModal.jsx` | submit handler | `SEND_PROMPT` | ❌ |
| `src/ui-preact/components/PortfolioEvalModal.jsx` | `sendLegacyPrompt()` | `SEND_PROMPT` | ❌ |
| `src/ui-preact/pages/PortfolioPage.jsx` | send handler | `SEND_PROMPT` | ❌ |

**So sánh**: Stock Research và Watchlist Enrich dùng `STOCK_RESEARCH_RUN` / `WATCHLIST_AI_ENRICH` → các handler đó gọi `LLMProviderFactory.create()` → đọc đúng settings.

---

### 4. `llmProviderRouting.js` — Feature CHAT Được Định Nghĩa Nhưng Không Ai Dùng

**File**: `src/shared/llm/llmProviderRouting.js`

```js
export const FEATURE_TYPES = {
  CHAT: 'chat',           // ← Được định nghĩa...
  STOCK_RESEARCH: 'stock-research',
  WATCHLIST_ENRICH: 'watchlist-enrich',
};

const FEATURE_SETTINGS_KEY = {
  [FEATURE_TYPES.CHAT]: null, // ...nhưng không bao giờ được sử dụng trong thực tế
  ...
};
```

Hàm `getProviderForFeature(FEATURE_TYPES.CHAT, config)` tồn tại nhưng **không có bất kỳ code nào gọi nó** cho tính năng chat/writing thực tế. Dead code.

---

### 5. `promptQueue.js` Comment — Hardcode Assumption

**File**: `src/background/services/promptQueue.js` (dòng 1-5)

```js
/**
 * ALL ChatGPT interactions MUST go through this queue (concurrency = 1).
 ...
 * 1. enqueue(fn) — Synchronous: ...
 *    Used by: SEND_PROMPT, CHATGPT_SEND_INPUT, context menu sends
 */
```

Comment và architecture của queue service mặc định rằng tất cả đều là ChatGPT interactions. Tuy nhiên về mặt kỹ thuật, `enqueue(fn)` là generic và có thể dùng cho bất kỳ async task nào — bao gồm Gemini/Claude.

---

### 6. `englishApi.js` — Tên Hàm Hardcode ChatGPT

**File**: `src/ui-preact/api/englishApi.js`

```js
// ❌ Tên hàm phản ánh assumption sai
export async function sendPromptToChatGPT(prompt, options = {}) {
  // Luôn gửi SEND_PROMPT → luôn đến ChatGPT
}
```

Tên hàm `sendPromptToChatGPT` là bug documentation: nó encode assumption rằng ChatGPT là provider duy nhất.

---

### 7. `autoSelectTopic()` — Poll ChatGPT Output sau khi gửi

**File**: `src/ui-preact/api/writingApi.js`

```js
// ❌ Gửi qua SEND_PROMPT (→ ChatGPT)
const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SEND_PROMPT, ... });

// ❌ Poll ChatGPT output — sẽ không hoạt động nếu provider là Gemini
for (let i = 0; i < maxPolls; i++) {
  const outputResponse = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT, // ← Hardcoded ChatGPT output polling
    ...
  });
}
```

Nếu Gemini được chọn, prompt vẫn đến ChatGPT (không phải Gemini), và polling vẫn tìm ChatGPT tab output. Double-wrong.

---

## Flow Thực Tế vs Flow Kỳ Vọng

### Flow Thực Tế (LỖI):
```
User chọn Gemini trong Settings
       ↓
LLM_SET_PROVIDER → lưu llm_provider='gemini' vào Supabase ✅
       ↓
User nhấn nút gửi prompt (Writing / English / Portfolio)
       ↓
UI gửi MESSAGE_TYPES.SEND_PROMPT
       ↓
prompt.js handler nhận → KHÔNG đọc llm_provider setting
       ↓
ChatGPTSession.ensureChatGPTTab() → Mở ChatGPT tab
       ↓
ChatGPTSession.sendInput() → Gửi vào ChatGPT ❌ (không phải Gemini!)
```

### Flow Kỳ Vọng (Đúng):
```
User chọn Gemini trong Settings
       ↓
LLM_SET_PROVIDER → lưu llm_provider='gemini' vào Supabase ✅
       ↓
User nhấn nút gửi prompt
       ↓
UI gửi MESSAGE_TYPES.SEND_PROMPT
       ↓
prompt.js handler nhận → đọc llm_provider từ Supabase
       ↓
getProviderForFeature(FEATURE_TYPES.CHAT, config) → provider='gemini'
       ↓
LLMProviderFactory.create({ provider: 'gemini' }, { enqueue })
       ↓
GeminiWebProvider.sendPrompt() → Gửi vào Gemini ✅
```

---

## Tại Sao Stock Research Hoạt Động Đúng Nhưng Chat Thì Không?

Stock Research (`STOCK_RESEARCH_RUN` handler) đã được migration sang `LLMProviderFactory`:

```js
// src/background/handlers/stockResearch.js — ĐÚNG ✅
const providerConfig = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, settingsConfig);
const provider = LLMProviderFactory.create(providerConfig, { enqueue });
const { text } = await provider.sendPrompt(prompt);
```

Nhưng `SEND_PROMPT` handler (`prompt.js`) **chưa bao giờ được migrate** sang pattern này. Nó bị bỏ lại với code cũ hardcode ChatGPT.

---

## Danh Sách Bugs (Jira Tickets)

| Ticket | Mô tả | Độ ưu tiên |
|--------|-------|-----------|
| XST-BUG-1 | `SEND_PROMPT` handler không đọc `llm_provider` — hardcode ChatGPT | Critical |
| XST-BUG-2 | `CHATGPT_SEND_INPUT` bypass LLM provider routing | High |
| XST-BUG-3 | Writing API & English API gọi `SEND_PROMPT` — không provider-aware | High |
| XST-BUG-4 | `autoSelectTopic()` poll `CHATGPT_GET_OUTPUT` khi provider là Gemini/Claude | Medium |
| XST-BUG-5 | `englishApi.sendPromptToChatGPT()` — tên hàm sai + hardcoded assumption | Low |
| XST-BUG-6 | `FEATURE_TYPES.CHAT` trong `llmProviderRouting.js` — dead code, không được dùng | Low |

---

## Giải Pháp

### Fix Chính: Migrate `SEND_PROMPT` Handler

**File**: `src/background/handlers/prompt.js`

```js
import { getProviderConfig } from './llmProvider.js';
import { LLMProviderFactory } from '../../shared/llm/LLMProviderFactory.js';
import { enqueue } from '../services/promptQueue.js';

registerHandler(MESSAGE_TYPES.SEND_PROMPT, async (message, sender) => {
  const { prompt, options } = message.payload || message.data || {};
  
  // ✅ Read provider from user settings
  const userId = await requireAuth(message);
  const config = await getProviderConfig(userId);

  if (config.provider === 'chatgpt') {
    // Backward-compatible: existing ChatGPT path (fire-and-forget)
    ...
  } else {
    // ✅ Use LLMProviderFactory for non-ChatGPT providers
    const provider = LLMProviderFactory.create(config, { enqueue });
    const { text } = await provider.sendPrompt(prompt, options);
    // Return text immediately (no polling needed)
    return createResponse(message, MESSAGE_TYPES.PROMPT_SENT, { text, provider: config.provider });
  }
});
```

### Fix Phụ: Rename `sendPromptToChatGPT` → `sendPromptToLLM`

**File**: `src/ui-preact/api/englishApi.js`

Rename hàm để phản ánh đúng rằng nó có thể gửi tới bất kỳ LLM nào.

### Fix Phụ: `autoSelectTopic()` — Handle Non-ChatGPT Response

Khi provider không phải ChatGPT, text đã có trong response của `SEND_PROMPT` (via `LLM_SEND_PROMPT` path), không cần poll `CHATGPT_GET_OUTPUT`.

---

## Kết Luận

Lỗi xảy ra do quá trình thêm tính năng multi-LLM provider (XST-775, XST-815) chỉ được áp dụng cho **Stock Research** và **Watchlist Enrichment** — các tính năng mới nhất. Tất cả các tính năng cũ hơn (chat/writing/english/portfolio) tiếp tục dùng con đường cũ `SEND_PROMPT` → ChatGPT hardcoded và **chưa được migration** sang architecture LLMProviderFactory.

Cài đặt `llm_provider` được lưu đúng vào Supabase, nhưng không có code nào đọc và dùng nó khi xử lý `SEND_PROMPT`.
