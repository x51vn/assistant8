# Writing Assistant — Product & Technical Spec (MVP)

**Project**: ChatGPT Assistant Extension  
**Owner**: (TBD)  
**Status**: Draft  
**Last updated**: 2026-02-05  

## 0) Tóm tắt

Xây dựng trang **Writing Assistant** trong UI (Preact) để người dùng chọn một “job” viết lách cố định (email/social/tóm tắt/rewrite/dịch/outline), nhập nội dung + tuỳ chọn (tone, audience, độ dài, ngôn ngữ...), bấm **Generate** để gửi prompt tới ChatGPT (cơ chế hiện có), nhận output hiển thị trong extension, hỗ trợ **Copy** và **Insert** nhanh.

MVP ưu tiên: trải nghiệm tạo nội dung nhanh, có lịch sử theo module (từ `chat_history`) và xử lý lỗi/timeout ổn định.

---

## 1) Mục tiêu / Không mục tiêu

### 1.1 Mục tiêu (Goals)
- Có **trang Writing Assistant** với 6 job cố định và form tương ứng.
- Generate dùng lại integration sẵn có: `SEND_PROMPT`/`CHATGPT_*` + polling `CHATGPT_GET_OUTPUT`.
- Output hiển thị rõ ràng, có nút **Copy** và **Open in ChatGPT**.
- Có **History trong trang** (lọc từ `chat_history.metadata.module === "writing_assistant"`).
- Error handling: không có tab ChatGPT, selector thay đổi, timeout, network.

### 1.2 Không mục tiêu (Non-goals) cho MVP
- Không làm editor WYSIWYG phức tạp (chỉ textarea/preview).
- Không làm “multi-step clarification chat” trong extension (MVP: 1-shot; nếu thiếu dữ kiện thì output chứa `[TODO]` hoặc câu hỏi).
- Không tối ưu hoá chi phí/token theo model (vì hiện đang dùng UI automation trên chatgpt.com).
- Không làm template marketplace / user-generated templates (để phase sau).

### 1.3 Convention & tái sử dụng (BẮT BUỘC)
Module mới **phải theo đúng phong cách, naming, UI pattern và code conventions** của các module hiện có. Nguyên tắc chung: **ưu tiên tái sử dụng**, chỉ tạo code/file mới khi **không có** function/file tương tự trong repo.

**Bắt buộc tái sử dụng các thành phần sẵn có**
- **Messaging + handlers**: dùng `MESSAGE_TYPES` trong `src/shared/messageSchema.js` và các handler hiện có:
  - Gửi prompt: `src/background/handlers/prompt.js` (`MESSAGE_TYPES.SEND_PROMPT`)
  - Lấy output: `src/background/handlers/chatgpt.js` (`MESSAGE_TYPES.CHATGPT_GET_OUTPUT`)
  - Mở tab ChatGPT: `MESSAGE_TYPES.ENSURE_CHATGPT_OPEN`
- **Persist history**: dùng cơ chế đã có (`persistPromptSafe` trong background) để lưu vào `public.chat_history` và chỉ thêm `metadata` cần thiết.
- **API layer style**: follow pattern `src/ui-preact/api/englishApi.js` (error extraction, `generateCorrelationId`, response normalization).
- **UI layout/style**: follow pattern các page hiện có:
  - Page shell: `page-container`, `page-header`, `header-actions`, `btn-icon`, `empty-state`, `error-message`
  - Loading: dùng `setGlobalLoading()` / `hideLoading()` từ `src/ui-preact/state/appState.js` (không tạo loading overlay mới).

**Không được làm**
- Không tạo background handler/message type mới nếu có thể express bằng `SEND_PROMPT` + `CHATGPT_GET_OUTPUT`.
- Không duplicate logic đã tồn tại (ví dụ parse error, poll output, open chat tab, confirm dialog pattern) — phải gọi/extend code tương tự.
- Không tạo table Supabase mới cho MVP nếu đã đủ bằng `chat_history` (draft table chỉ phase sau).

---

## 2) Phạm vi tính năng (Feature scope)

### 2.1 Jobs (tác vụ) cố định (MVP)
1) Viết email  
2) Viết bài social (FB/LinkedIn/X)  
3) Tóm tắt (Summarize)  
4) Rewrite theo tone/mục tiêu  
5) Dịch 2 chiều (VI↔EN)  
6) Viết dàn ý (Outline)

### 2.2 Actions chung
- Generate / Regenerate
- Copy output (clipboard)
- Insert output vào ô đang focus (best effort; có fallback Copy)
- Open in ChatGPT (mở `chatUrl` hoặc tab chatgpt.com)
- Save draft (phase sau; xem mục 7.2)

---

## 3) UX & IA (Information Architecture)

### 3.1 Navigation
- Thêm 1 page mới trong UI: `WritingPage.jsx` (tên hiển thị: “Writing Assistant”).
- Thêm menu item trong `MainApp`/navigation (theo pattern các page hiện có: Portfolio/Assets/History/English/Errors).

### 3.2 Layout trang (đề xuất)
- **Left panel**: Job selector + form inputs/options
- **Right panel**: Output viewer + toolbar (Copy/Insert/Open/Regenerate)
- Tabs trong right panel (optional cho MVP, nhưng khuyến nghị):
  - `Output`
  - `History`
  - `Prompt (Advanced)` (read-only: xem prompt render)

### 3.3 Trạng thái hiển thị
- Idle: hướng dẫn nhập & chọn job
- Generating: spinner + “Đang gửi prompt…” / “Đang chờ response…”
- Success: output + action buttons
- Error: message thân thiện + nút “Open ChatGPT” + “Try again”

---

## 4) Job requirements chi tiết

### 4.1 Common fields (áp dụng cho nhiều job)
- `languageOutput`: `vi` | `en` (default theo UI setting hoặc `vi`)
- `tone`: preset + custom
  - Preset đề xuất: `formal`, `neutral`, `friendly`, `assertive`
- `audience`: free text (ví dụ: “khách hàng”, “sếp”, “dev team”)
- `length`: `short` | `medium` | `long` hoặc slider (MVP: dropdown)
- `constraints`: free text “yêu cầu thêm” (optional)

### 4.2 Job: Viết email
**Input**
- `keyPoints` (required): nội dung chính cần gửi
- `context` (optional): bối cảnh, thông tin nền
- `recipient` (optional): “ai”, vai trò

**Options**
- `emailGoal`: `inform` | `request` | `decline` | `follow_up` | `negotiate`
- `includeSubject`: boolean (default true)

**Output**
- Subject (nếu include)
- Body có cấu trúc: mở đầu, nội dung, CTA, kết thúc
- Nếu thiếu dữ kiện: dùng `[TODO]` hoặc 3 câu hỏi làm rõ (không bịa)

### 4.3 Job: Viết bài social
**Input**
- `rawContent` (required): ý chính / nội dung thô
- `link` (optional)

**Options**
- `platform`: `facebook` | `linkedin` | `x`
- `cta`: `none` | `comment` | `follow` | `dm`
- `hashtags`: `0` | `3` | `5` | `10`
- `variants`: `1` | `2` | `3` (default 1)

**Output**
- 1–3 phiên bản
- Có “hook” dòng đầu
- Hashtags theo lựa chọn

### 4.4 Job: Tóm tắt
**Input**
- `sourceText` (required)

**Options**
- `summaryStyle`: `tldr` | `bullets` | `executive`
- `focus`: `key_points` | `action_items` | `risks`
- `maxLines`: number (default 8)

**Output**
- Tóm tắt theo style
- “Action items” nếu focus yêu cầu

### 4.5 Job: Rewrite theo tone/mục tiêu
**Input**
- `sourceText` (required)

**Options**
- `rewriteGoal`: `clearer` | `shorter` | `more_persuasive` | `less_emotional`
- `faithfulness`: `strict` | `normal` (default normal)
- `targetLength`: `short` | `medium` | `long` hoặc `%` (MVP: dropdown)

**Output**
- Bản rewrite
- (Optional) bullet “Changes” (MVP: off mặc định)

### 4.6 Job: Dịch 2 chiều (VI↔EN)
**Input**
- `sourceText` (required)

**Options**
- `direction`: `auto` | `vi_to_en` | `en_to_vi`
- `style`: `natural` | `literal`
- `domain`: `general` | `business` | `tech`
- `glossary`: text (optional; mỗi dòng “term = translation”)

**Output**
- Bản dịch
- (Optional) glossary resolved (MVP: off)

### 4.7 Job: Viết dàn ý (Outline)
**Input**
- `topic` (required)
- `goal` (required): mục tiêu bài viết/tài liệu
- `mustInclude` (optional): ý bắt buộc có

**Options**
- `docType`: `blog` | `email` | `report` | `script`
- `structureDepth`: `h2_only` | `h2_h3` (default `h2_h3`)
- `includeExamples`: boolean

**Output**
- Dàn ý theo heading + bullet
- (Optional) intro sample nếu bật

---

## 5) Prompting requirements

### 5.1 Template engine
- Mỗi job tương ứng 1 template prompt.
- Template được render từ: `{jobType, inputs, options}`.
- Cấu trúc prompt thống nhất:
  1) Role & output format requirements
  2) Constraints: không bịa, thiếu thì hỏi hoặc `[TODO]`
  3) Inputs (raw user text)

### 5.2 Prompt policies (MVP)
- “Không bịa dữ kiện”: nếu thiếu thông tin bắt buộc thì:
  - Đưa placeholder `[TODO: ...]`, hoặc
  - Liệt kê tối đa 3 câu hỏi làm rõ trước khi viết hoàn chỉnh (tuỳ job)
- Output phải đúng ngôn ngữ `languageOutput`.
- Tránh nhắc đến prompt nội bộ trong output.

### 5.3 Advanced prompt view (read-only)
- UI hiển thị prompt đã render để debug.
- Không cho sửa trực tiếp (MVP) để tránh “prompt drift” khó support.

---

## 6) Technical design (client + background integration)

### 6.0 Reuse matrix (để tránh tạo code trùng)
Khi triển khai, ưu tiên “wire-up” từ các module tương tự thay vì tạo logic mới:
- **Generate + poll**: copy pattern từ `EnglishPage.jsx` + `englishApi.js`, chỉ thay template/payload cho writing jobs.
- **History list UI**: reuse pattern từ `HistoryPage.jsx` (list item, expand/collapse, delete/open chat nếu cần).
- **Open ChatGPT / navigate chat**: reuse logic từ `englishApi.js` (`openEnglishChat`) hoặc shared helper nếu đã có.
- **Context-menu insert**: nếu đã có content-script utilities tương tự, reuse; nếu không, implement tối thiểu và fallback Copy.

### 6.1 UI components/files (đề xuất)
- `src/ui-preact/pages/WritingPage.jsx` (page mới)
- `src/ui-preact/api/writingApi.js` (API layer)
- `src/ui-preact/components/writing/JobSelector.jsx` (optional)
- `src/ui-preact/components/writing/OutputPanel.jsx` (optional)
- `src/ui-preact/components/writing/HistoryPanel.jsx` (optional)

MVP có thể gộp trong `WritingPage.jsx` để ship nhanh, nhưng khuyến nghị tách dần.

### 6.2 API layer: `writingApi.js`
**Functions (MVP)**
- `sendWritingJob(jobType, inputs, options)`:
  - render prompt
  - gọi `chrome.runtime.sendMessage` tới `MESSAGE_TYPES.SEND_PROMPT` (khuyến nghị) hoặc `CHATGPT_SEND_INPUT`
  - trả `{ runId, chatId, chatUrl }`
- `pollWritingOutput({ wait=false })`:
  - gọi `MESSAGE_TYPES.CHATGPT_GET_OUTPUT` (payload `{ wait }`)
  - parse output tương tự `englishApi.js`

**History**
- `fetchWritingHistory(limit=50)`:
  - reuse `historyApi.js` nếu đã có endpoint lọc server-side, hoặc
  - fetch lịch sử chung rồi filter client theo `metadata.module`
  - MVP ưu tiên: client filter để giảm scope backend

### 6.3 Message types & handlers (reuse)
Reuse message types hiện có:
- `MESSAGE_TYPES.SEND_PROMPT` (đã có handler `src/background/handlers/prompt.js`)
- `MESSAGE_TYPES.CHATGPT_GET_OUTPUT` (đã có handler `src/background/handlers/chatgpt.js`)
- `MESSAGE_TYPES.ENSURE_CHATGPT_OPEN` (đã có)

**Requirement**
- `runId/correlationId` phải được propagate và lưu vào `chat_history.run_id` để map prompt/response.
- `persistPromptSafe` đã tồn tại: Writing Assistant phải set metadata:
  - `metadata.module = "writing_assistant"`
  - `metadata.jobType = ...`
  - `metadata.options = ...` (giới hạn size; xem 6.5)

### 6.4 Insert output (best effort)
Goal: “Insert” dán output vào ô text đang focus ở tab hiện tại (không phải ChatGPT tab).
MVP approach:
- `chrome.tabs.query({ active: true, currentWindow: true })` lấy tabId
- `chrome.scripting.executeScript` inject function:
  - Nếu `document.activeElement` là `input/textarea` => set value + dispatch input event
  - Nếu là `contenteditable` => insert text at caret (fallback: set `innerText`)
- Nếu fail => fallback Copy + toast “Đã copy, hãy paste (Ctrl+V)”

Out of scope MVP:
- Insert “rich text” giữ format Markdown.

### 6.5 Input/output limits & safety
- `maxInputChars` default: 10,000 (configurable)
- Nếu vượt:
  - hiển thị warning + cho phép “Trim to max”
- `metadata` lưu trong `chat_history` phải giới hạn (đề xuất):
  - chỉ lưu options quan trọng, loại bỏ raw `sourceText` (đã nằm trong prompt)
  - tránh lưu content quá lớn trong metadata

---

## 7) Data model

### 7.1 MVP: chỉ dùng `chat_history`
Persist prompt/response vào `public.chat_history` như hiện tại.
**Requirement**: metadata tối thiểu:
```json
{
  "module": "writing_assistant",
  "jobType": "email|social|summarize|rewrite|translate|outline",
  "options": {
    "tone": "formal",
    "languageOutput": "vi",
    "length": "short"
  }
}
```

### 7.2 Phase sau (khuyến nghị): `writing_drafts`
**Use case**: lưu draft inputs/options để chạy lại không cần đào history.
Migration đề xuất (chưa làm trong MVP):
- Table: `public.writing_drafts`
  - `id uuid pk`
  - `user_id uuid fk auth.users`
  - `job_type text`
  - `title text`
  - `inputs jsonb`
  - `options jsonb`
  - `created_at/updated_at`
  - `is_favorite bool`
- RLS theo pattern các table khác.

---

## 8) Error handling requirements

### 8.1 Các lỗi chính
- ChatGPT tab không tồn tại / không tạo được
- Selector ChatGPT thay đổi (content script không tìm thấy)
- Timeout chờ output
- Network error / runtime sendMessage fail
- Insert fail (do CSP/permissions/DOM)

### 8.2 UX yêu cầu khi lỗi
- Message thân thiện (VN), có action:
  - `Open ChatGPT`
  - `Try again`
  - `Copy anyway` (nếu có output partial)

---

## 9) Acceptance criteria (MVP)
- Có trang “Writing Assistant” xuất hiện trong navigation.
- 6 job hoạt động end-to-end: nhập → Generate → nhận output.
- Copy output hoạt động 100%.
- Open in ChatGPT mở đúng conversation nếu có `chatUrl`, nếu không thì mở chatgpt.com.
- Insert hoạt động với `textarea/input` trên đa số site; nếu fail có fallback Copy + toast.
- History panel hiển thị các item thuộc module này (tối thiểu 20 mục gần nhất).
- Timeout polling hiển thị rõ, không “treo” UI.

---

## 10) Test plan (manual + automated nếu có)

### 10.1 Manual checklist
- Generate từng job với input ngắn + dài (gần limit).
- Verify output format (email có subject khi bật).
- Copy/Insert trên:
  - Google Docs (contenteditable) (kỳ vọng: best effort)
  - Gmail compose (textarea/contenteditable tuỳ UI)
  - Notion (contenteditable)
  - Plain textarea website
- History filter đúng module.

### 10.2 Automated (optional)
- Unit test render prompt templates (pure functions) nếu tách ra file riêng.
- E2E Playwright (nếu infra đã có) chỉ test UI state transitions (không test chatgpt.com).

---

## 11) Open questions
- MVP có cần “Regenerate variants” (nhiều output) cho email/social mặc định không?
- Tone presets có cần map sang tiếng Việt (ví dụ “lịch sự”, “thân thiện”) hay giữ key tiếng Anh nội bộ?
- Lưu history: lọc client hay bổ sung API/handler để query server-side theo metadata?
- Insert: có chấp nhận chỉ hỗ trợ `input/textarea` ở MVP để giảm rủi ro?
