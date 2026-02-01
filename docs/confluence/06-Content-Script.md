# Content Script (chatgpt.com automation)

File chính: `src/content.js`

## 1) Scope & permissions

- Content script chỉ match `https://chatgpt.com/*` (manifest content_scripts).
- Mục tiêu: DOM automation để
  - tìm editor
  - nhập prompt
  - bấm send
  - theo dõi streaming và đọc response

Không chứa business logic (portfolio/assets/etc) — các logic đó nằm ở background.

## 2) Selector chains + caching

ChatGPT DOM thay đổi thường xuyên → content script dùng:
- Nhiều selector fallback cho từng “chain” (editor, newChatButton, ...)
- Selector cache + thống kê matchCount/lastMatch

Có “selector telemetry”:
- Hàm `getSelectorStats()` có thể gửi message `TELEMETRY_REPORT` chứa stats + version.
- Nếu background không có receiver/handler, lỗi được catch và log.

## 3) Pending prompt queue (race-condition mitigation)

Để tránh race condition khi:
- navigation sang chat mới
- editor chưa ready

Content script dùng `sessionStorage` trên `chatgpt.com`:
- key: `__chatgpt_assistant_pending_prompt_v1`

Flow:
1. Background gửi message `action: 'input_prompt'` (kèm prompt/runId/newChat).
2. Content script ghi pending prompt vào sessionStorage.
3. Nếu cần new chat: click “new chat” hoặc navigate home.
4. `drainPendingPrompt()` poll và thử gửi 1 lần khi editor ready.
5. Nếu thành công:
   - clear pending prompt
   - send `CONTENT_PROMPT_SENT` về background (kèm chatId/chatUrl)
6. Nếu timeout:
   - send `CONTENT_PROMPT_FAILED` (kèm runId + error)
   - clear pending prompt

## 4) Nhập prompt & gửi

Hàm: `inputAndSendPrompt(prompt, options)`

- Nếu `createNewChat`:
  - `ensureNewChatSession()` với điều kiện strict: urlChanged + msgCount==0 + editor tồn tại

- Editor types:
  - `textarea` hoặc `contenteditable` (ProseMirror)

- Với `contenteditable`:
  - clear content
  - insert prompt theo chunks (200 chars) qua `document.execCommand('insertText')`
  - trigger InputEvent + change

- Gửi prompt:
  - tìm send button (`#composer-submit-button`, `data-testid="send-button"`, aria-label/title heuristics)
  - nếu không có/disabled: fallback dispatch Enter keydown/keyup

## 5) Lấy response

- Dùng selector `div[data-message-author-role="assistant"]` và lấy message cuối.
- Có logic “clean content”:
  - ưu tiên `.markdown/.prose` container
  - clone node và remove một số noise elements (citations/metadata/buttons)

- Wait stable:
  - `waitForStableAssistantResponse({ timeoutMs, stableMs })`
  - MutationObserver theo dõi thay đổi DOM
  - điều kiện kết thúc: text ổn định đủ lâu + không còn “Stop generating” button.

## 6) Content script message listener

`chrome.runtime.onMessage.addListener` hỗ trợ:
- `action: 'ping'` trả diagnostics để background detect content script loaded.
- `action: 'input_prompt'` enqueue pending prompt.

## 7) Privacy considerations

- Content script chỉ thao tác trong ChatGPT page.
- Khi đọc response, chỉ đọc text của assistant message để hiển thị/lưu.
- Không quét/thu thập data ngoài scope các thao tác user khởi tạo.
