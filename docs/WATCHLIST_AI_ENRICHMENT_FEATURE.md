# Tính năng: AI Enrichment cho Watchlist (Entry/Target/Stoploss/Thesis) → JSON-only → Auto Update

**Ngày**: 2026-02-09  
**Mục tiêu**: Thêm *một prompt mới trong Settings* để yêu cầu ChatGPT phân tích/tìm kiếm thông tin cho từng mã trong Watchlist và trả về **JSON-only**. Extension sẽ **đọc JSON** đó và **cập nhật lại Watchlist** (X-Neews Watchlist API) theo từng mã.

> Phạm vi tài liệu này được viết theo kiến trúc hiện tại của dự án: UI (side panel) → Background Service Worker → (1) ChatGPT tab automation, (2) X-Neews API.

---

## 1) User story

- Là người dùng có Watchlist X-Neews trong extension
- Tôi muốn bấm 1 nút trong Settings để gửi một prompt cho ChatGPT
- ChatGPT sẽ trả về **chỉ JSON** chứa `entry`, `target`, `stoploss`, `investment_thesis` cho từng mã
- Extension sẽ **tự parse JSON** và **update** từng mã lên Watchlist database (X-Neews)

---

## 2) Non-goals

- Không xây thêm trang mới ngoài Settings (chỉ thêm 1 prompt + controls tối thiểu).
- Không “bảo đảm” ChatGPT có browsing/search: phụ thuộc tài khoản ChatGPT và cấu hình model trên chatgpt.com.
- Không tự ý tạo/xóa mã trong watchlist. Chỉ **cập nhật** các field cho các mã đang tồn tại.

---

## 3) UX/Flow (Settings)

### 3.1 UI trong Settings

Trong Settings → nhóm **Prompts (System)**, thêm 1 prompt mới:

- **Key**: `prompt.watchlistEnrich` (đề xuất)
- **Title**: `Watchlist AI Enrichment (JSON-only)`
- **Description**: `Tạo entry/target/stoploss/thesis cho từng mã trong watchlist. Bắt buộc JSON-only.`

Các control tối thiểu ở cùng khu vực:

- Nút **Chạy phân tích Watchlist**
- Chế độ chạy tự động: **mỗi ngày chạy 1 lần lúc 16:00** (theo giờ hệ thống của máy)
- Trạng thái chạy: `Đang gửi prompt…` → `Đang đợi phản hồi…` → `Đang cập nhật watchlist…` → `Hoàn tất`/`Lỗi`
- Hiển thị kết quả: số lượng mã cập nhật thành công/thất bại.

### 3.2 Lịch chạy tự động (daily 16:00)

- Extension sẽ tự động khởi chạy enrichment **mỗi ngày lúc 16:00**.
- Thời gian 16:00 được tính theo **timezone của hệ điều hành** (local time). Nếu muốn đúng giờ Việt Nam, người dùng cần đặt timezone hệ thống là `Asia/Ho_Chi_Minh`.
- Nếu tại thời điểm 16:00 đang có một run enrichment khác đang chạy, extension **không khởi chạy run mới** (anti-overlap lock) và sẽ thử lại vào ngày hôm sau.

### 3.3 Quy tắc dữ liệu đầu vào

Khi chạy, extension lấy toàn bộ watchlist hiện tại từ X-Neews (có phân trang). Input gửi vào prompt nên là:

- Danh sách mã
- Các field hiện có (nếu có): `price`, `ediff`, `notes`, `investment_thesis`.

Mục tiêu là tăng chất lượng phân tích mà không cần thêm trang UI.

---

## 4) Prompt template (default)

**Yêu cầu quan trọng**: ChatGPT phải trả về **JSON-only**, không markdown, không giải thích.

### 4.1 Placeholder

Prompt template hỗ trợ placeholder đơn giản (string replace):

- `{WATCHLIST_ITEMS_JSON}`: JSON string của danh sách item (đã rút gọn field, xem 4.3)
- `{AS_OF_DATE}`: ngày chạy (YYYY-MM-DD)

### 4.2 Default prompt đề xuất

Nội dung (default) cho `prompt.watchlistEnrich`:

```
Bạn là trợ lý phân tích cổ phiếu Việt Nam.

Nhiệm vụ:
- Với từng mã trong danh sách watchlist bên dưới, hãy xác định:
  - entry (giá vào)
  - target (giá mục tiêu)
  - stoploss (giá cắt lỗ)
  - investment_thesis (luận điểm đầu tư ngắn gọn nhưng có căn cứ)

Ràng buộc output:
- CHỈ trả về JSON hợp lệ (application/json), KHÔNG markdown, KHÔNG text ngoài JSON.
- Output là một object có shape:
  {
    "as_of": "YYYY-MM-DD",
    "items": [ ... ]
  }

Quy tắc:
- symbol phải khớp chính xác.
- Các giá trị entry/target/stoploss là số (VND), không kèm dấu phẩy, không chuỗi.
- Nếu bạn không chắc chắn một trường, hãy để null.
- investment_thesis tối đa 600 ký tự.

Dữ liệu watchlist:
{WATCHLIST_ITEMS_JSON}

Ngày chạy: {AS_OF_DATE}
```

### 4.3 Input payload rút gọn (khuyến nghị)

Để tránh prompt quá dài, background nên map watchlist thành dạng tối giản trước khi nhét vào `{WATCHLIST_ITEMS_JSON}`:

```json
[
  {
    "symbol": "VCB",
    "price": 59100,
    "ediff": -0.0930,
    "investment_thesis": "...",
    "notes": "..."
  }
]
```

---

## 5) JSON Output Contract

### 5.1 Schema (logic)

Output **bắt buộc** là JSON object:

```json
{
  "as_of": "2026-02-09",
  "items": [
    {
      "symbol": "VCB",
      "entry": 64600,
      "target": 77600,
      "stoploss": 61500,
      "investment_thesis": "..."
    }
  ]
}
```

### 5.2 Validation rules (bắt buộc)

Khi parse + validate:

- Root phải là object, có `items` là array.
- Mỗi item:
  - `symbol`: string, trim, uppercase, match regex `^[A-Z0-9]{1,10}$`.
  - `entry`, `target`, `stoploss`: `number | null`.
    - Nếu là string number ("64600.00") → cho phép parse sang number.
    - Sau parse: phải là finite number.
  - `investment_thesis`: `string | null`.

Quy tắc update:
- Chỉ update các field **khác null/undefined**.
- Không overwrite `highlighted`.
- Không update `price`/`ediff` (readonly từ API).

### 5.3 JSON-only enforcement

Mặc dù prompt yêu cầu JSON-only, thực tế ChatGPT đôi khi trả về code-fence. Parser nên:

1. Nếu response là JSON thuần → parse trực tiếp.
2. Nếu có code fence ```json ... ``` → strip fence và parse phần bên trong.
3. Nếu vẫn có text ngoài JSON → coi là lỗi `INVALID_JSON_OUTPUT` và không update.

---

## 6) Kiến trúc triển khai (đề xuất)

### 6.1 Lưu prompt trong Settings

Dự án hiện có cơ chế unified prompts (`public.prompts`) với keys trong `src/shared/allPrompts.js`.

Thay đổi cần có:

- Thêm key `prompt.watchlistEnrich` vào `ALL_PROMPT_KEYS`
- Thêm metadata + default content vào `src/shared/systemPrompts.js`
- Settings UI tự động hiển thị (đang load qua `PROMPTS_GET_ALL`)

### 6.2 Message types

Thêm message types mới (trong `src/shared/messageSchema.js`):

- `WATCHLIST_AI_ENRICH_RUN`: UI → Background (khởi chạy)
- `WATCHLIST_AI_ENRICH_STATUS`: Background → UI (progress)
- `WATCHLIST_AI_ENRICH_DONE`: Background → UI (kết quả)

Payload đề xuất:

- RUN: `{ dryRun?: boolean }`
- STATUS/DONE: `{ runId, stage, successCount, failureCount, errors?: [...] }`

### 6.3 Background handler (core)

Tạo handler mới: `src/background/handlers/watchlistAiEnrich.js` (đề xuất)

Trách nhiệm:

1) Fetch watchlist đầy đủ từ X-Neews
- Dùng handler logic hiện có của `XNEEWS_WATCHLIST_GET` (phân trang)
- Loop page=1..totalPages, size=100 (đã clamp) để lấy đủ

2) Chạy theo batch 10 mã/lần cho đến khi hết watchlist

- Mỗi run (manual hoặc scheduled) sẽ tạo một hàng đợi (queue) các `symbol` cần enrich.
- Batch size cố định: **10 mã / 1 prompt**.
- Extension sẽ chạy **liên tục** theo chuỗi:
  1) lấy 10 mã tiếp theo từ queue
  2) render prompt với đúng 10 mã
  3) gửi prompt sang ChatGPT
  4) chờ content script capture response
  5) parse JSON và update watchlist cho 10 mã đó
  6) lặp lại đến khi queue rỗng

Lý do batch: giảm rủi ro prompt quá dài, giảm lỗi JSON, giảm gánh nặng cập nhật API.

3) Render prompt
- Lấy nội dung prompt từ `public.prompts` key `prompt.watchlistEnrich`
- Replace placeholders `{WATCHLIST_ITEMS_JSON}`, `{AS_OF_DATE}`

**Bắt buộc**: `{WATCHLIST_ITEMS_JSON}` chỉ chứa **10 item** của batch hiện tại.

4) Send prompt sang ChatGPT
- Reuse pipeline `MESSAGE_TYPES.SEND_PROMPT`
- Set `options.metadata` để đánh dấu run thuộc feature này:
  - `metadata: { feature: 'watchlist_ai_enrich', asOf: 'YYYY-MM-DD', symbols: ['VCB', ...], batchIndex: 1, batchSize: 10 }`

5) Nhận response text
- Content script tự capture và gửi `CONTENT_RESPONSE_CAPTURED`
- Background persist vào `public.chat_history` (đã có)

6) Parse JSON và update watchlist
Có 2 phương án (chọn 1):

**Phương án A (đáng tin cậy hơn, ít phụ thuộc UI):**
- Mở rộng handler hiện có `src/background/handlers/chatHistoryAutoSave.js`:
  - Sau khi `recordResponseCaptured(runId)` thành công, gọi service `watchlistAiEnrichService.tryProcess(runId)`.
  - Service:
    - Fetch chat_history row by `run_id`
    - Check `metadata.feature === 'watchlist_ai_enrich'`
    - Parse/validate JSON
    - Update từng symbol qua X-Neews Watchlist update endpoint
    - Emit broadcast `WATCHLIST_AI_ENRICH_DONE` (chrome.runtime.sendMessage)

**Phương án B (đơn giản triển khai ban đầu):**
- UI sau khi gửi prompt sẽ có nút “Áp dụng kết quả”
- UI copy JSON từ ChatGPT và paste vào textarea → background parse + update

Tài liệu này ưu tiên **Phương án A** vì đúng yêu cầu “tự đọc JSON rồi cập nhật”.

### 6.4 Lập lịch chạy 16:00 bằng `chrome.alarms`

Tận dụng cơ chế alarm hiện có trong background:

- Tạo alarm tên ví dụ: `watchlistAiEnrichDaily`
- Lịch: **mỗi ngày 16:00**, period 24h.

Pseudo:

- Khi cài/khởi động extension: tính `next16h` (local time) rồi `chrome.alarms.create(name, { when: next16h, periodInMinutes: 1440 })`.
- Trong handler `alarms.js`: khi alarm fire → gửi message nội bộ `WATCHLIST_AI_ENRICH_RUN` (hoặc gọi trực tiếp service start run).

### 6.5 MV3-safe: run state + anti-overlap lock

Do Service Worker có thể bị terminate bất kỳ lúc nào, cần lưu **trạng thái chạy** để có thể tiếp tục:

- Lưu queue (chỉ symbol + runId + cursor) ở `chrome.storage.local` dưới key ví dụ: `x51labs_watchlist_ai_enrich_state_v1`.
  - Đây là **trạng thái vận hành (operational state)**, không phải dữ liệu nghiệp vụ. Dữ liệu nghiệp vụ vẫn nằm ở X-Neews/Supabase.
- Anti-overlap lock:
  - `lockUntil` (timestamp). Nếu đang lock thì không start run mới.
  - Nếu SW chết giữa chừng, lock tự hết hạn (ví dụ 2 giờ) để tránh kẹt vĩnh viễn.

Khuyến nghị thêm:
- Mỗi batch sau khi update xong thì persist state ngay (cursor tiến lên).
- Nếu gặp lỗi tạm thời (network/429) thì retry với backoff và tiếp tục.

### 6.6 Update Watchlist database

Update theo từng symbol bằng message `XNEEWS_WATCHLIST_UPDATE` (đã có), hoặc gọi trực tiếp endpoint tương ứng trong `xneewsWatchlist.js`.

Quy tắc thực thi:

- Cập nhật tuần tự từng mã để tránh rate-limit.
- Nếu lỗi 401 → trả về lỗi `AUTH_ERROR` yêu cầu đăng nhập lại X-Neews.
- Nếu lỗi 422/400 → đánh dấu item đó thất bại và tiếp tục item khác.

---

## 7) Error handling & Logging

### 7.1 User-facing errors (Vietnamese)

- `INVALID_JSON_OUTPUT`: `ChatGPT không trả về JSON hợp lệ. Vui lòng thử lại.`
- `NO_ITEMS_TO_UPDATE`: `Không có mã nào hợp lệ để cập nhật.`
- `AUTH_ERROR`: `Phiên đăng nhập X-Neews hết hạn. Vui lòng đăng nhập lại.`
- `NETWORK_ERROR`: `Không có kết nối internet. Vui lòng kiểm tra mạng.`
- `API_ERROR`: `Lỗi kết nối API. Vui lòng thử lại.`

### 7.2 Logging (không log nội dung nhạy cảm)

- Không log full prompt hoặc full JSON response.
- Chỉ log: `runId`, số lượng symbols, độ dài prompt/response, số success/failure.

---

## 8) Privacy & Web Store compliance

Tính năng này có hành vi truy cập/điều phối dữ liệu giữa các hệ thống, cần disclosure rõ:

**Dữ liệu gửi sang ChatGPT (chatgpt.com):**
- Danh sách mã trong watchlist
- Các ghi chú/luận điểm hiện có (nếu được include trong prompt)
- Không gửi access token X-Neews, refresh token, hoặc thông tin đăng nhập.

**Dữ liệu lưu trữ:**
- Prompt/response được lưu vào bảng `public.chat_history` trên Supabase theo cơ chế hiện có.
- Watchlist được cập nhật lên X-Neews (server của X-Neews), theo token đăng nhập của người dùng.

**Kiểm soát của người dùng:**
- Người dùng chủ động bấm “Chạy phân tích Watchlist”.
- Có thể chỉnh prompt hoặc tắt không dùng tính năng.

---

## 9) Acceptance Criteria (AC)

1. Settings hiển thị thêm 1 prompt mới `prompt.watchlistEnrich` và lưu được qua `public.prompts`.
2. Bấm “Chạy phân tích Watchlist” sẽ mở ChatGPT, gửi prompt, và chờ capture response.
3. Nếu response là JSON hợp lệ, extension sẽ update watchlist cho từng mã.
4. Nếu JSON không hợp lệ, extension không update và báo lỗi rõ ràng.
5. Không ghi log chứa nội dung prompt/response đầy đủ.
6. Tự động chạy **mỗi ngày lúc 16:00** và chạy theo batch **10 mã/lần** cho đến khi hết watchlist.

---

## 10) Test Plan (khuyến nghị)

### 10.1 Unit tests (Vitest)

- `parseJsonOnlyResponse(text)`:
  - JSON thuần
  - JSON trong code fence
  - Có text ngoài JSON → fail
- `validateEnrichItems(payload)`:
  - symbol invalid
  - number as string
  - risk mapping

### 10.2 Integration tests (mocks)

- Mock `CONTENT_RESPONSE_CAPTURED` → verify gọi update watchlist đúng số lượng, đúng payload, và tổng kết success/failure.

### 10.3 Manual test

- Watchlist có 5-10 mã → chạy → xác nhận các field entry/target/stoploss/thesis được fill và hiển thị trên Watchlist page.
- Watchlist có 30+ mã → chạy → xác nhận hệ thống chia batch 10 mã và chạy đến khi hết.
- Đặt đồng hồ hệ thống gần 16:00 → verify alarm trigger và run tự động bắt đầu.

---

## 11) Rollout notes

- Default prompt nên “an toàn”: cho phép `null` khi không chắc chắn.
- Chạy theo batch 10 mã/prompt để tránh prompt quá dài; nếu watchlist lớn, hệ thống tự chạy đến khi hết.
