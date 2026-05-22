# LLM Provider Routing Bug Report — Phase 2

**Date**: 2026-02-24  
**Reporter**: AI Agent (root-cause analysis)  
**Status**: Active

## Tóm tắt

Mặc dù đã sửa backend handler `SEND_PROMPT` trong `llm.js` để route qua `LLMProviderFactory` cho mọi provider (XST-816 Phase 1), **lỗi vẫn xảy ra** vì **UI code bỏ qua response text** từ `SEND_PROMPT` và luôn fallback vào polling `CHATGPT_GET_OUTPUT` — một handler chỉ hoạt động với ChatGPT tab.

## Root Cause

### Luồng thực thi hiện tại (SAI)

```
User chọn Gemini → UI gọi SEND_PROMPT
  → llm.js route đúng qua GeminiWebProvider → nhận text response
  → trả về { success: true, text: "..." } cho UI
  
UI nhận response nhưng KHÔNG đọc response.text
  → Bắt đầu polling CHATGPT_GET_OUTPUT (chỉ check ChatGPT tab!)
  → Gemini không có ChatGPT tab → polling timeout → "không phản hồi sau 3 phút"
```

### Luồng thực thi mong muốn (ĐÚNG)

```
User chọn Gemini → UI gọi SEND_PROMPT
  → llm.js route đúng qua GeminiWebProvider → nhận text response
  → trả về { success: true, text: "..." } cho UI
  
UI kiểm tra response.text → CÓ text → hiển thị kết quả trực tiếp
  → KHÔNG cần polling
```

## Các Bug Cụ thể

### BUG 1 (Critical): `sendWritingJob()` bỏ response text

**File**: `src/ui-preact/api/writingApi.js` line 349  
**Vấn đề**: Gọi `SEND_PROMPT`, nhận `response.text`, nhưng trả về `{ success: true }` — text bị mất.

```javascript
// HIỆN TẠI (SAI):
return { success: true, error: null }; // text bị discard!

// ĐÚNG:
return { success: true, text: response.text, error: null };
```

### BUG 2 (Critical): WritingPage luôn polling CHATGPT_GET_OUTPUT

**File**: `src/ui-preact/pages/WritingPage.jsx` lines 425-440  
**Vấn đề**: `handleGenerate()` gọi `sendWritingJob()`, rồi luôn gọi `pollForResponse()` → `pollWritingOutput()` → `CHATGPT_GET_OUTPUT`. Không bao giờ kiểm tra text trả về.

### BUG 3 (Critical): EnglishPage luôn polling CHATGPT_GET_OUTPUT

**File**: `src/ui-preact/pages/EnglishPage.jsx` lines 278-295  
**Vấn đề**: `handleGenerate()` gọi `sendPromptToLLM(prompt)`, nhận `sendResult.text` nhưng bỏ qua, rồi luôn gọi `pollForResponse()` → `getChatGPTOutput()` → `CHATGPT_GET_OUTPUT`.

### BUG 4 (Critical): englishApi.autoSelectTopic() bỏ qua response text

**File**: `src/ui-preact/api/englishApi.js` lines 375-400  
**Vấn đề**: Gọi `sendPromptToChatGPT(pickPrompt)`, nhận `sendResult.text` nhưng bỏ qua — luôn polling `getChatGPTOutput()`.  
**Lưu ý**: `writingApi.autoSelectTopic()` đã được fix (XST-819) nhưng `englishApi` version chưa!

### BUG 5 (High): EvaluatePortfolioModal dùng response.data thay vì response.text

**File**: `src/ui-preact/components/EvaluatePortfolioModal.jsx` line 140  
**Vấn đề**: `createResponse()` spread payload trực tiếp → response field là `response.text`, không phải `response.data`. Code check `response?.data` → undefined → "Unexpected response format".

### BUG 6 (High): TeaStockModal dùng response.data thay vì response.text

**File**: `src/ui-preact/components/TeaStockModal.jsx` line 97  
**Vấn đề**: Tương tự BUG 5.

### BUG 7 (Medium): openEnglishChat/openWritingChat hardcoded ChatGPT

**File**: `src/ui-preact/api/englishApi.js`, `writingApi.js`  
**Vấn đề**: Luôn dùng `ENSURE_CHATGPT_OPEN` + navigate đến `chatgpt.com/c/...`. Không hoạt động cho Gemini/Claude conversations.

### BUG 8 (Low): Hardcoded "ChatGPT" strings trong UI

**Các file**: EnglishPage.jsx, WritingPage.jsx, PortfolioPage.jsx, settingsApi.js, EvaluatePortfolioModal.jsx  
**Vấn đề**: UI hiển thị "ChatGPT" bất kể provider đang dùng:
- "Yêu cầu ChatGPT chọn topic phổ biến nhất trong tuần..."
- "⏱️ Timeout - ChatGPT không phản hồi sau 3 phút"
- "Đã gửi! Nhấn vào item để mở ChatGPT"
- "Failed to get response from ChatGPT"
- "Prompt sent successfully to ChatGPT"

### BUG 9 (Low): sendPromptToChatGPT deprecated alias vẫn import

**File**: `src/ui-preact/pages/EnglishPage.jsx` line 22  
**Vấn đề**: Import deprecated alias không cần thiết.

## Jira Tickets

| Ticket | Severity | Tóm tắt |
|--------|----------|---------|
| XST-822 | Critical | UI discards SEND_PROMPT response text — polls CHATGPT_GET_OUTPUT instead |
| XST-823 | High | EvaluatePortfolioModal & TeaStockModal use response.data instead of response.text |
| XST-824 | Medium | openEnglishChat/openWritingChat hardcoded to ChatGPT |
| XST-825 | Low | Replace hardcoded "ChatGPT" strings with generic LLM provider name |
| XST-826 | Low | Remove deprecated sendPromptToChatGPT alias |

## Kết luận

**Nguyên nhân gốc**: Backend đã fix đúng (XST-816), nhưng UI chưa adapt. Toàn bộ UI flow vẫn theo pattern cũ "fire-and-forget + poll ChatGPT tab", trong khi backend giờ đã return response text trực tiếp cho MỌI provider.

**Giải pháp**: Sửa UI để sử dụng `response.text` ngay khi nhận được, thay vì luôn polling `CHATGPT_GET_OUTPUT`. Polling chỉ giữ lại làm fallback compatibility (nếu text không có).
