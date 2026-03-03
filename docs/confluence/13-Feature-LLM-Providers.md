# 13 — LLM Providers (ChatGPT / Claude / Gemini)

**Last updated:** 2026-02-23  
**Branch:** `baseline/v1.0.4`

---

## Tổng quan

Extension hỗ trợ 3 nhà cung cấp AI (LLM Provider), tất cả dùng **Web/DOM automation** — không cần API key, miễn phí, chỉ yêu cầu user đã đăng nhập tài khoản trên trình duyệt:

| Provider | Website | Yêu cầu |
|----------|---------|---------|
| **ChatGPT** (default) | chatgpt.com | Đăng nhập OpenAI |
| **Claude** | claude.ai | Đăng nhập Anthropic |
| **Gemini** | gemini.google.com | Đăng nhập Google |

---

## Kiến trúc

```
Settings (Supabase)
  llm_provider = 'chatgpt' | 'claude' | 'gemini'
  llm_provider_stock_research = 'gemini'   // per-feature override
  llm_provider_watchlist_enrich = 'claude' // per-feature override
          │
          ▼
llmProviderRouting.js  ─  getProviderForFeature(feature, settingsConfig)
          │
          ▼
LLMProviderFactory.create({ provider: '...' }, { enqueue })
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
ChatGPT  Claude  GeminiWebProvider
Provider   Web     (gemini.google.com
           Provider   content script)
          │
          ▼
   chrome.tabs.sendMessage
          │
          ▼
  content-*.js (DOM automation)
  Tab: chatgpt.com / claude.ai / gemini.google.com
```

### Luồng xử lý một request

1. Feature gọi `getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, settingsConfig)`
2. Routing engine trả về `{ provider: 'gemini' }` (per-feature override hoặc global default)
3. `LLMProviderFactory.create()` khởi tạo `GeminiWebProvider({ enqueue })`
4. `provider.sendPrompt(prompt)` enqueue vào p-queue (concurrency = 1)
5. Provider tìm/tạo tab `gemini.google.com`, ping content script
6. Content script nhận lệnh `inject_prompt` → nhập text vào DOM, click Submit
7. Content script poll response cho đến khi text stable (không thay đổi 2 giây)
8. Provider trả về `{ text, usage: { inputTokens: 0, outputTokens: 0 } }`

---

## Cấu hình

### Cấu hình toàn cục (Settings → LLM Provider)

Lưu trong `settings.config` trên Supabase:

```json
{
  "llm_provider": "chatgpt"
}
```

**Giá trị hợp lệ:** `"chatgpt"` | `"claude"` | `"gemini"`  
**Default khi không cấu hình:** `"chatgpt"`

---

### Cấu hình per-feature (ghi đè cho từng tính năng)

Mỗi tính năng có thể dùng provider khác với global default:

| Setting key | Tính năng | Mô tả |
|-------------|-----------|-------|
| `llm_provider` | Tất cả (global) | Default khi feature không có override |
| `llm_provider_stock_research` | Stock Research | Phân tích cổ phiếu |
| `llm_provider_watchlist_enrich` | Watchlist Enrich | Làm giàu dữ liệu watchlist |

**Ví dụ:** ChatGPT cho mọi thứ, nhưng dùng Gemini cho Stock Research:

```json
{
  "llm_provider": "chatgpt",
  "llm_provider_stock_research": "gemini"
}
```

**Thứ tự ưu tiên (cao → thấp):**
1. Per-feature override (`llm_provider_stock_research`)
2. Global default (`llm_provider`)
3. Feature default (luôn là `chatgpt`)

---

## Từng Provider

### ChatGPT (Web)
- **File:** `src/shared/llm/ChatGPTProvider.js`
- **Content script:** `src/content.js` (chạy trên `chatgpt.com`)
- **Yêu cầu:** User đăng nhập `chatgpt.com` trên Chrome
- **Rate limit:** Không có giới hạn tùy chỉnh (theo giới hạn của OpenAI)
- **Default cho:** Tất cả features

### Claude (Web)
- **File:** `src/shared/llm/ClaudeWebProvider.js`
- **Content script:** `src/content/claude.js` (chạy trên `claude.ai`)
- **Yêu cầu:** User đăng nhập `claude.ai` trên Chrome
- **Rate limit:** 5000ms giữa các request (`rateLimiter.js`)

### Gemini (Web)
- **File:** `src/shared/llm/GeminiWebProvider.js`
- **Content script:** `src/content/gemini.js` (chạy trên `gemini.google.com`)
- **Yêu cầu:** User đăng nhập Google Account trên Chrome
- **Rate limit:** 5000ms giữa các request (`rateLimiter.js`)
- **Timeout:** 120 giây cho toàn bộ request cycle
- **Ping retries:** Tối đa 15 lần (500ms/lần) để chờ content script sẵn sàng

---

## Queue system

Tất cả requests đi qua một **singleton p-queue** (`promptQueue.js`):

```
concurrency = 1  →  Chạy 1 request tại một thời điểm (tránh spam)
maxSize     = ∞  →  Queue không giới hạn số request đang chờ
```

Hai loại job:

| Loại | API | Behavior | Use case |
|------|-----|----------|---------|
| **Sync** | `enqueue(fn)` | Caller await kết quả | Stock research, watchlist enrich |
| **Background** | `enqueueBackgroundJob(config)` | Fire-and-forget, persist qua SW restart | Batch jobs |

Background jobs được persist trong `chrome.storage.local` (`prompt_queue_jobs`), tối đa **50 jobs**. Khi SW restart, pending jobs tự động resume.

---

## Thêm Provider mới

Nếu muốn thêm provider mới (ví dụ Mistral, Llama):

1. **Tạo provider class** kế thừa `LLMProvider`:
   ```js
   // src/shared/llm/MistralWebProvider.js
   import { LLMProvider } from './LLMProvider.js';
   export class MistralWebProvider extends LLMProvider {
     get name() { return 'mistral'; }
     async sendPrompt(prompt, options = {}) { /* ... */ }
     async getStatus() { /* ... */ }
   }
   ```

2. **Tạo content script** `src/content/mistral.js` (DOM automation, tương tự `gemini.js`)

3. **Đăng ký trong Factory** (`LLMProviderFactory.js`):
   ```js
   import { MistralWebProvider } from './MistralWebProvider.js';
   // ...
   case 'mistral':
     return new MistralWebProvider({ enqueue: deps.enqueue });
   ```

4. **Thêm vào SUPPORTED_PROVIDERS:**
   ```js
   { id: 'mistral', name: 'Mistral (Web)', plans: ['free'], requiresKey: false }
   ```

5. **Khai báo host_permissions** trong `manifest.json`:
   ```json
   "https://chat.mistral.ai/*"
   ```

6. **Đăng ký content_scripts** trong `manifest.json`:
   ```json
   { "matches": ["https://chat.mistral.ai/*"], "js": ["content-mistral.js"] }
   ```

7. **Khai báo entry point** trong `vite.config.js`:
   ```js
   'content-mistral': path.resolve(__dirname, 'src/content/mistral.js')
   ```

8. **Viết tests** trong `tests/unit/mistralWebProvider.test.js`

---

## Xử lý lỗi

Các lỗi được map về `ERROR_CODES` chuẩn qua `classifyLLMError()`:

| Lỗi | ERROR_CODE | Retryable | Nguyên nhân |
|-----|-----------|-----------|-------------|
| timeout / timed out / 504 | `LLM_TIMEOUT` | ✅ | Gemini/Claude chậm xử lý |
| quota / rate limit / 429 | `LLM_QUOTA_EXCEEDED` | ❌ | Vượt giới hạn request |
| unauthorized / api key / 401 / 403 | `AUTH_ERROR` | ❌ | Chưa đăng nhập provider |
| parse / json / format | `PARSE_ERROR` | ✅ | DOM structure thay đổi |
| Khác | `LLM_ERROR` | ✅ | Lỗi không xác định |

User-facing errors (tiếng Việt) được format qua `LLMProvider.formatError()`.

---

## Troubleshooting

**❌ "Gemini content script không sẵn sàng"**  
→ Extension không inject được vào tab. Kiểm tra: `chrome://extensions` → Enable extension → Reload tab Gemini.

**❌ "Bạn chưa đăng nhập Gemini"**  
→ Mở `gemini.google.com` và đăng nhập Google Account.

**❌ Tab Gemini/Claude không mở được**  
→ Kiểm tra `host_permissions` trong manifest có chứa domain tương ứng.

**❌ Response không trả về (timeout)**  
→ Prompt quá dài hoặc Gemini đang bận. Thử giảm độ dài prompt. Timeout mặc định = 120s.

**❌ Queue stuck (requests chờ mãi)**  
→ Service Worker restart. Background jobs tự resume. Sync jobs cần retry từ UI.

---

## Files liên quan

| File | Mô tả |
|------|-------|
| [src/shared/llm/LLMProvider.js](../../src/shared/llm/LLMProvider.js) | Abstract base class |
| [src/shared/llm/LLMProviderFactory.js](../../src/shared/llm/LLMProviderFactory.js) | Factory — tạo provider instance |
| [src/shared/llm/llmProviderRouting.js](../../src/shared/llm/llmProviderRouting.js) | Routing — chọn provider theo feature |
| [src/shared/llm/GeminiWebProvider.js](../../src/shared/llm/GeminiWebProvider.js) | Gemini Web provider |
| [src/shared/llm/ClaudeWebProvider.js](../../src/shared/llm/ClaudeWebProvider.js) | Claude Web provider |
| [src/shared/llm/ChatGPTProvider.js](../../src/shared/llm/ChatGPTProvider.js) | ChatGPT Web provider |
| [src/content/gemini.js](../../src/content/gemini.js) | Gemini content script (DOM) |
| [src/background/services/promptQueue.js](../../src/background/services/promptQueue.js) | p-queue singleton |
| [src/background/services/rateLimiter.js](../../src/background/services/rateLimiter.js) | Rate limiter (5s cho Gemini/Claude) |
| [tests/unit/llmProviderFactory.test.js](../../tests/unit/llmProviderFactory.test.js) | Factory tests |
| [tests/unit/llmProviderRouting.test.js](../../tests/unit/llmProviderRouting.test.js) | Routing tests |
| [tests/unit/geminiWebProvider.test.js](../../tests/unit/geminiWebProvider.test.js) | Gemini provider tests |
| [tests/unit/geminiContentScript.test.js](../../tests/unit/geminiContentScript.test.js) | Gemini DOM tests |
