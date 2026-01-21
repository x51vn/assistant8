# ChatGPT Assistant - Hướng dẫn cho AI Coding Agent

## Mục tiêu Dự án

**ChatGPT Assistant** là một Chrome MV3 extension được thiết kế để hỗ trợ quản lý prompts, chat sessions, và 3 lĩnh vực chính:

1. **📈 Quản lý Portfolio Chứng khoán**: 
   - Theo dõi các cổ phiếu yêu thích
   - Tích hợp dữ liệu giá thực tế từ SSI iBoard API
   - Gửi prompt tới ChatGPT để nhận được phân tích, đánh giá danh mục đầu tư
   - Lưu lịch sử đánh giá cho mục đích retrospective

2. **🎓 Hỗ trợ Học Tiếng Anh**:
   - Tạo prompt tùy chỉnh để học từ vựng, grammar, cách phát âm
   - Lưu chat sessions để ôn tập
   - Theo dõi tiến độ học tập qua history management

3. **📝 Ghi chú (Notes)**:
   - Lưu trữ các ghi chú tức thời
   - Liên kết ghi chú với chat sessions và prompts tương ứng

4. **🔍 Tính năng Retrospective (Học từ Sai lầm)**:
   - Hệ thống Error Tracking để ghi lại lỗi, vấn đề gặp phải
   - CRUD operations cho quản lý lỗi (tạo, sửa, xóa, xem)
   - Color-coding theo mức độ severity (critical, warning, info)
   - Giúp nhận thức và tránh lặp lại lỗi cũ

**Công nghệ**: Xây dựng bằng Vite, Firebase (đồng bộ cloud), và JavaScript modular, tuân theo MV3 architecture của Chrome.

## Tổng Quan Kiến trúc

Một Chrome MV3 extension tự động hóa tương tác ChatGPT với đồng bộ cloud, quản lý portfolio, và error tracking thông minh. Xây dựng bằng Vite, Firebase, và JavaScript modular.

## Ràng buộc Kiến trúc MV3 Quan trọng

### Mô hình Service Worker Event-Driven
- **Không lưu trữ trạng thái trong bộ nhớ**: Service workers có tính tạm thời—có thể bị terminate bất cứ lúc nào
- **Đăng ký listeners đồng bộ tại top-level**: Tất cả event listeners (message, alarms, contextMenus) PHẢI được đăng ký đồng bộ tại module top-level trong `src/background/index.js`, KHÔNG bao giờ bên trong async functions
- **Import static không dynamic**: Sử dụng static imports (`import * as`) chứ không dynamic (`import()`)—Vite's preload helper inject `document.*` code sẽ làm hỏng Service Worker
- **Thiết kế cho thực thi ngắn hạn**: Coi Service Worker như một "serverless function"—lưu trữ trạng thái vào `chrome.storage.local`, không bao giờ dựa vào biến
- **Tham khảo**: Xem header comments trong `src/background/index.js` và `src/firebaseService.js` (dòng 74) cho state management patterns

## Các Pattern Kiến trúc Cốt lõi

### Mô hình Giao tiếp Ba Process
1. **Background Service Worker** (`src/background/index.js`): Orchestrator—quản lý trạng thái, Firebase, alarms
2. **Content Script** (`src/content.js`): Tự động hóa ChatGPT DOM—gửi/nhận prompts
3. **UI (Side Panel)** (`src/ui/`): Giao diện người dùng—chỉ gửi message tới Background

### Giao tiếp Dựa trên Messages
- **Central schema**: `src/shared/messageSchema.js` định nghĩa tất cả `MESSAGE_TYPES` (65+ loại message)
- **Pattern**: Request → correlationId → Response; luôn include `{ type, correlationId, data }`
- **Router**: `src/background/messageRouter.js` dispatch messages tới handlers đăng ký dùng Command Pattern
- **Handler registration**: Mỗi file handler trong `src/background/handlers/` tự đăng ký message types via `registerHandler()`
- **Ví dụ**: Message `CHATGPT_SEND_INPUT` flow: UI → Background → Content → ChatGPT DOM → Content → Background → UI

### Tổ chức Handler
- Mỗi feature nằm trong `src/background/handlers/{feature}.js` (ví dụ: `prompt.js`, `errors.js`, `history.js`)
- Handlers tự đăng ký khi import via `registerHandler(MESSAGE_TYPE, handler)`
- Import tất cả handlers trong `src/background/handlers/index.js` ở top-level để auto-register
- **Quan trọng**: Handlers là các hàm ngắn (< 100 dòng), không phải classes

## Lưu trữ & Quản lý Trạng thái

### Storage Keys
- **Tập trung**: Tất cả keys được định nghĩa trong `src/constants.js` dưới object `STORAGE_KEYS`
- **Limits áp dụng**: Object `LIMITS` (ví dụ: `MAX_CHAT_HISTORY: 100`, `MAX_ERRORS: 50`)
- **API**: `chrome.storage.local` để lưu trữ persistent (đồng bộ sau khi restart)
- **Pattern**: Đọc/ghi qua promise-based API: `chrome.storage.local.get(['key'])` trả về `{ key: value }`

### Cấu trúc Dữ liệu
- **Chat History**: Array của `{ chatId, chatUrl, prompt, response, timestamp, runId }`—tối đa 100 items
- **Errors (Retrospective)**: Array của `{ id, title, description, severity, type, timestamp }`—tối đa 50 items, được color-coding
- **Portfolio**: Danh mục cổ phiếu của người dùng kèm giá từ SSI market data provider
- **Notes**: Ghi chú tức thời
- **Settings**: Cấu hình người dùng (prompts, auto-run settings, Firebase auth state)


### Quy trình Build
- **Command**: `npm run build` tạo folder `dist/` với 3 entry points:
  - `background.js` (~513 KB)—Service Worker
  - `content.js` (~13 KB)—Content script
  - `ui.js` (~67 KB)—Side panel UI
- **Tool**: Vite với custom plugin `copyExtensionStatic()` copy manifest, HTML, images, prompts
- **Source maps**: Được bật ở dev mode only (X51LABS-98)
- **Watch mode**: `npm run build -- --watch` rebuild khi file thay đổi
- **Load trong Chrome**: `chrome://extensions` → Developer mode → Load unpacked → folder `dist/`

### Cấu hình Manifest
- **Vị trí**: `src/extension/manifest.json`
- **Permissions**: storage, tabs, scripting, alarms, sidePanel, identity, contextMenus, activeTab
- **Host permissions**: chatgpt.com, iboard-query.ssi.com.vn (market data)
- **OAuth2**: Google Drive API cho future backup features (client ID trongta)
- **OAuth2**: Google Drive API for future backup features (client ID in manifest)

## Các File Quan trọng & Trách nhiệm

| File | Mục đích | Ví dụ |
|------|---------|---------|
| `src/background/index.js` | Top-level listeners, SW entry | Message/alarm/action click handlers |
| `src/background/messageRouter.js` | Message dispatch engine | Routes `MESSAGE_TYPES` to handlers |
| `src/background/handlers/*.js` | Triển khai features | `prompt.js` = gửi/lấy ChatGPT; `errors.js` = CRUD lỗi; `portfolio.js` = portfolio |
| `src/content.js` | ChatGPT DOM automation | `inputAndSendPrompt()`, `getLatestAssistantMessage()` |
| `src/firebaseService.js` | Firebase operations + retry logic | `firestoreWithRetry()` pattern (dòng 30) |
| `src/chatgptSession.js` | ChatGPT tab lifecycle | `ensureChatGPTTab()`, `waitForContentScript()` |
| `src/logger.js` | Structured logging | `createLogger(module)` → log với context |
| `src/constants.js` | Single source of truth | `STORAGE_KEYS`, `LIMITS`, `TIMEOUTS`, `MESSAGE_TYPES` |
| `src/types.js` | Type definitions & responses | `createSuccessResponse()`, `ERROR_CODES` |
| `src/ui/*.js` | UI modules (DOM, tabs) | `results.js`, `settings.js`, `history.js`, `errors.js` |
| `src/market-data/ssi-realtime.provider.js` | SSI API integration | Lấy giá cổ phiếu thực tế cho portfolio |
Quy trình Phát triển Thường gặp

### Thêm Feature Mới
1. **Tạo handler**: `src/background/handlers/myfeature.js` → export handler function với `registerHandler(MESSAGE_TYPE, async handler)`
2. **Định nghĩa message types**: Thêm `MY_FEATURE_ACTION: 'MY_FEATURE_ACTION'` vào `src/shared/messageSchema.js`
3. **Đăng ký trong index**: Import handler trong `src/background/handlers/index.js`
4. **Gọi từ UI**: Gửi message với `chrome.runtime.sendMessage({ type: MESSAGE_TYPE, data: {...} })`
5. **Build & test**: `npm run build` → load trong Chrome → mở DevTools (F12) để xem logs

### Debug Messaging Issues
- **Console logs ở khắp nơi**: UI logs tới DevTools, Background logs tới Service Worker DevTools (chrome://extensions → Details → Service Worker)
- **Correlation ID**: Mỗi message include `correlationId` để trace request/response chains
- **Logger format**: `createLogger('ModuleName')` output `[ModuleName] message key1=value1, key2=value2`
- **Inspect storage**: `chrome.storage.local` trong DevTools console: `chrome.storage.local.get(null, console.log)`

### Xử lý Firebase Operations
- **Retry pattern**: Dùng `firestoreWithRetry(operation, operationName, maxRetries)` cho tất cả Firestore calls
- **Config**: Firebase config từ `src/firebaseConfig.js` (đọc `VITE_*` env vars)
- **Auth state**: Được quản lý trong `firebaseService.js` với `onAuthStateChanged()` listener
- **Error responses**: Dùng `createErrorResponse()` từ `types.js` cho standardized errors

### Test Changes
- **Unit tests**: `npm run test:unit` chạy Vitest trên `tests/unit/`
- **E2E tests**: `npm run test:e2e` chạy Playwright (cấu hình trong `playwright.config.js`)
- **E2E with UI**: `npm run test:e2e:ui` mở Playwright UI cho interactive debugging
- **E2E headed**: `npm run test:e2e:headed` chạylaywright UI for interactive debugging
- **E2E headed**: `npm run test:e2e:headed` runs browser visible
ác Code Pattern & Convention

### Error Handling
```javascript
// Luôn trả về standardized response với ERROR_CODES từ types.js
if (!input) {
  return createErrorResponse(ERROR_CODES.EMPTY_PROMPT, 'Prompt không thể trống');
}
// Hoặc catch lỗi:
try { /* ... */ } catch (e) { 
  return createErrorResponse(ERROR_CODES.OPERATION_FAILED, e.message); 
}
```

### Async/Await Philosophy
- **Không bao giờ dùng callbacks**: Luôn dùng async/await hoặc Promises
- **Timeout safety**: Wrap các long operations trong `Promise.race([operation(), timeout()])`
- **Ví dụ**: `TIMEOUTS.GET_RESULT = 15 * 60 * 1000` cho ChatGPT responses

### DOM Selectors & Content Script
- ChatGPT selectors rất fragile—luôn validate trước dùng
- Pattern: Try selector → fallback → log error
- Lưu trữ chat-id từ URL pattern: `/c/{id}` hoặc `/g/{id}` (dùng regex trong `results.js` dòng 11)

### Storage Read/Write Pattern
```javascript
// Đọc
const { data } = await chrome.storage.local.get(['key']);
// Ghi (với = await chrome.storage.local.get(['key']);
// Write (with limit enforcement)
const items = data || [];
if (items.length >= LIMITS.MAX_ITEMS) items.shift(); // FIFO eviction
items.push(newItem);
await chrome.storage.local.set({ key: items });
```

## Chi tiết Triển khai Quan trọng

### Đánh giá Portfolio Chứng khoán (X51LABS Market Data)
- Lấy giá cổ phiếu thực tế từ SSI iBoard API
- Dùng `src/market-data/ssi-realtime.provider.js` cho market data
- Gửi prompt tới ChatGPT kèm portfolio + giá để nhận phân tích
- Kết quả được cache trong `PORTFOLIO_PRICES` storage
- Hỗ trợ 3 tính năng: Portfolio tracking, English learning, Notes ghi chú

### Hệ thống Error Tracking - Tính năng Retrospective
- **CRUD operations**: `addError()`, `updateError()`, `deleteError()`, `getErrors()`
- **Severity levels**: Dùng để color-coding trong UI (critical, warning, info)
- **Max 50 items**: Lỗi cũ nhất sẽ tự động xóa khi vượt limit
- **Mục đích**: Ghi lại sai lầm, vấn đề gặp phải để học từ đó, tránh lặp lại
- **Hiển thị**: Errors tab trong UI, lưu trữ trong `errorList` trong storage

### History Management (Mới trong v2.0)
- Lưu trữ 100 cuộc chat ChatGPT gần nhất với full metadata
- Mỗi history item: `{ chatId, chatUrl, prompt, response, timestamp, runId }`
- Hiển thị trong History tab, click để xem chi tiết
- Dùng để theo dõi quá trình học tiếng Anh, đánh giá portfolio

### Hệ thống Alarms
- **Định nghĩa trong**: `src/constants.js` (object `ALARMS`)
- **Loại**: `checkChatGPT`, `autoRunPrompt`, `pollResult`, `periodicSync`
- **Handler**: `src/background/handlers/alarms.js` quản lý lịch biểu alarm

## Cấu hình Môi trường
- **Bắt buộc**: File `.env` có Firebase config (xem README `VITE_FIREBASE_*` vars)
- **Không bao giờ commit**: `.env` chứa secrets; dùng `.env.template` cho reference
- **Build-time**: Vite đọc env vars, access qua `import.meta.env.VITE_*` trong code

## Testing & Quality
- **Errors hiển thị**: Kiểm tra "Errors" tab trong UI, lưu trong `errorList` trong storage
- **Telemetry (X51LABS-94)**: Tự động report lỗi via `TELEMETRY_REPORT` messages
- **Source maps**: Bật để debug (vite.config.js)
- **Build sizes**: Theo dõi để tránh bloat; warning khi vượt 2000 KB chunks

---

**Cập nhật lần cuối**: Tháng 1 năm 2026 | **Architecture Version**: MV3 | **Trạng thái Dự án**: Production (v2.0)
