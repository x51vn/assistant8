# Project Review Report — 2026-04-27

Reviewed by: Claude Code (automated multi-agent review)  
Branch: `baseline/v2.0.0`

---

## Executive Summary

Review phát hiện **1 critical bug** (undefined error code gây silent failure trong auth), **3 medium-severity issues** (variable shadowing, dead module file, unregistered handler pattern), và **~20 low-severity issues** (dead code, raw string literals, style inconsistency). Tất cả critical và medium issues đã được fix trong cùng session này.

---

## 1. Critical Bug — FIXED

### `llm.js:31` — `ERROR_CODES.AUTH_REQUIRED` là `undefined`

**File**: [src/background/handlers/llm.js](../src/background/handlers/llm.js)

**Vấn đề**: Handler `SEND_PROMPT` import `ERROR_CODES` từ `../../types.js` nhưng `types.js` không có key `AUTH_REQUIRED`. Kết quả là `ERROR_CODES.AUTH_REQUIRED` là `undefined` tại line 132, khiến error response bị tạo với `errorCode: undefined` — UI không thể phân biệt loại lỗi này.

```js
// BEFORE (wrong import):
import { ERROR_CODES } from '../../types.js';  // types.js có 16 keys, KHÔNG có AUTH_REQUIRED

// Line 132:
return createErrorResponse(message, ERROR_CODES.AUTH_REQUIRED, '...');
// → errorCode: undefined ← silent failure!

// AFTER (correct):
import { ERROR_CODES } from '../../shared/errorCodes.js';  // có đủ 60+ keys bao gồm AUTH_REQUIRED
```

**Root cause**: Dự án có 2 file định nghĩa `ERROR_CODES`:
- `src/types.js` — 16 legacy error codes (tab/content script errors)
- `src/shared/errorCodes.js` — 60+ error codes (comprehensive, chuẩn)

Mọi handler khác đều import từ `shared/errorCodes.js`. Chỉ `llm.js` và một số platform files dùng `types.js`. Khi `llm.js` cần `AUTH_REQUIRED` (chỉ có trong `shared/errorCodes.js`), kết quả là `undefined`.

**Fix**: Đổi import sang `../../shared/errorCodes.js`.

---

## 2. Medium Issues — FIXED

### 2.1 Variable Shadowing trong `settings.js`

**File**: [src/background/handlers/settings.js](../src/background/handlers/settings.js)

**Vấn đề**: Trong handler `SETTINGS_UPDATE`, `const data` ở line 161 (inner try scope) shadow `const data` ở line 129 (outer scope = `message.data`). Đây là code smell và có thể gây nhầm lẫn khi đọc code.

```js
// BEFORE:
const data = message.data || {};   // line 129 - message payload
try {
  const data = await supabaseWithRetry(...);  // line 161 - shadows outer data!
  return createResponse(message, ..., { config: data.config });  // which data?
}

// AFTER: renamed inner variable
const savedData = await supabaseWithRetry(...);
return createResponse(message, ..., { config: savedData.config });
```

### 2.2 `enrichmentQueue.js` — File chết hoàn toàn

**File**: ~~`src/background/services/enrichmentQueue.js`~~ (đã xóa)

**Vấn đề**: File này implement một job queue (`XST-742`) nhưng không có file nào import nó. `watchlistEnrich.js` đã migrate sang `promptQueue.js` — file mới hơn, tổng quát hơn với p-queue. `enrichmentQueue.js` là dead code hoàn toàn.

**Fix**: Xóa file.

### 2.3 `sessionManager.js` — Handler ngoài luồng registry

**File**: [src/background/index.js](../src/background/index.js), [src/background/handlers/sessionManager.js](../src/background/handlers/sessionManager.js)

**Vấn đề**: `sessionManager.js` đăng ký handlers cho `SESSION_CHECK` và `FORCE_SESSION_REFRESH` nhưng không được include trong bất kỳ registry file nào (`coreRegistry.js`, `authAndProvidersRegistry.js`, v.v.). Nó chỉ được load vì `background/index.js` có một static import riêng biệt.

Pattern hiện tại:
```js
// background/index.js — import dùng để load side-effects (handler self-registration)
import * as sessionManagerModule from './handlers/sessionManager.js';
// nhưng sessionManagerModule không bao giờ được gọi → unused variable
```

**Fix**: Đổi thành side-effect import (không gán variable):
```js
import './handlers/sessionManager.js'; // registers SESSION_CHECK handler
```

**TODO còn lại**: Thêm `sessionManager.js` vào `coreRegistry.js` để đồng nhất với pattern của các handlers khác.

---

## 3. Dead Code — FIXED

### 3.1 `MainApp.jsx` — Unused import `useEffect`

**File**: [src/ui-preact/components/MainApp.jsx:8](../src/ui-preact/components/MainApp.jsx)

`useEffect` được import từ `preact/hooks` nhưng không được sử dụng trong component.

**Fix**: Xóa import.

### 3.2 `settings.js` — `console.log` thay vì `logger`

**File**: [src/background/handlers/settings.js:89,158](../src/background/handlers/settings.js)

Hai dòng `console.log(...)` trong handler (vi phạm pattern logging của toàn dự án — nên dùng `logger.debug()`).

**Fix**: Đổi sang `logger.debug()`.

### 3.3 `portfolioState.js` — 3 exports không dùng

**File**: [src/ui-preact/state/portfolioState.js](../src/ui-preact/state/portfolioState.js)

| Export | Vấn đề |
|--------|---------|
| `sortBy` (signal) | Không được import bởi bất kỳ component nào. `LessonsTab.jsx` có `sortBy` riêng dùng local `useState` |
| `filteredPortfolioItems` (computed) | Không được dùng. `PortfolioPage.jsx` tự tính filter + sort inline |
| `setLastUpdateTime()` | Không được gọi. Actual update logic nằm trong `portfolioPriceUpdater.js` với signal riêng |

**Fix**: Xóa 3 exports này.

**Lưu ý**: `lastUpdateTime` signal và `resetPortfolioState()` vẫn được giữ — cần thiết.

### 3.4 `navigationState.js` — JSDoc outdated

**File**: [src/ui-preact/state/navigationState.js:14](../src/ui-preact/state/navigationState.js)

JSDoc mention `'english'` trong danh sách page IDs nhưng `EnglishPage` đã bị loại khỏi navigation.

**Fix**: Cập nhật comment với danh sách page IDs đầy đủ hiện tại.

---

## 4. Inconsistency — FIXED

### 4.1 `llm.js` — Handler registration dùng raw string literals

**File**: [src/background/handlers/llm.js](../src/background/handlers/llm.js)

3 handler registrations và 3 response types dùng raw strings thay vì `MESSAGE_TYPES` constants:

```js
// BEFORE:
registerHandler('LLM_GET_PROVIDERS', ...)
registerHandler('LLM_GET_STATUS', ...)
registerHandler('LLM_SET_PROVIDER', ...)
createResponse(message, 'LLM_PROVIDERS_DATA', ...)
createResponse(message, 'LLM_STATUS', ...)
createResponse(message, 'LLM_PROVIDER_SET', ...)

// AFTER: tất cả dùng MESSAGE_TYPES constants
registerHandler(MESSAGE_TYPES.LLM_GET_PROVIDERS, ...)
```

### 4.2 `llm.js` — Undefined error code strings

3 error codes dùng raw string literals không có trong `ERROR_CODES`:
- `'LLM_GET_PROVIDERS_ERROR'` → `ERROR_CODES.OPERATION_FAILED`
- `'LLM_STATUS_ERROR'` → `ERROR_CODES.OPERATION_FAILED`
- `'VALIDATION_ERROR'` → `ERROR_CODES.INVALID_INPUT`
- `'LLM_SET_ERROR'` → `ERROR_CODES.OPERATION_FAILED`

**Fix**: Đổi sang `ERROR_CODES` constants.

---

## 5. Issues Còn Lại (Chưa Fix — Cần Ticket)

### 5.1 `EnglishPage.jsx` — Page orphan

**File**: [src/ui-preact/pages/EnglishPage.jsx](../src/ui-preact/pages/EnglishPage.jsx)

`EnglishPage` component tồn tại đầy đủ nhưng:
- Không có entry trong `navigationConfig.js`
- Không được import trong `MainApp.jsx`
- Không có case trong switch statement

**Khuyến nghị**: Hoặc xóa file hoặc kết nối lại vào navigation. Cần confirm với team.

### 5.2 Duplicate `ERROR_CODES` definitions — Dual source of truth

**Files**: `src/types.js` (16 codes) và `src/shared/errorCodes.js` (60+ codes)

Hai file cùng export `ERROR_CODES`. `types.js` là legacy — chỉ dùng bởi platform-level files (`messaging.js`, `tabs.js`, `storage.js`) và `messageRouter.js`. `shared/errorCodes.js` là chuẩn.

**Khuyến nghị**: Merge `types.js::ERROR_CODES` vào `shared/errorCodes.js`, update imports ở platform files. Đây là refactor lớn cần ticket riêng.

### 5.3 `multiPortfolio.js`, `apiKeys.js`, `priceAlerts.js` — Raw string handler registrations

Tương tự vấn đề 4.1 nhưng ở các handlers khác:
- `apiKeys.js`: `registerHandler('API_KEY_LIST', ...)`, `'API_KEY_GENERATE'`, `'API_KEY_REVOKE'`
- `priceAlerts.js`: `'ALERT_LIST'`, `'ALERT_CREATE'`, `'ALERT_DELETE'`, `'ALERT_TOGGLE'`
- `multiPortfolio.js`: `'PORTFOLIO_LIST_PORTFOLIOS'`, `'PORTFOLIO_CREATE_PORTFOLIO'`, etc.

**Impact**: Low (strings match MESSAGE_TYPES values) nhưng tạo inconsistency và có thể gây typo bugs.

### 5.4 `multiPortfolio.js`, `priceAlerts.js` — Undefined error code strings

Tương tự 4.2:
- `'PLAN_LIMIT'`, `'PORTFOLIO_LIST_ERROR'`, `'PORTFOLIO_CREATE_ERROR'` v.v.

### 5.5 `crypto.provider.js` — Dead methods

**File**: [src/commodity-data/crypto.provider.js](../src/commodity-data/crypto.provider.js)

- `getTopCryptos(limit)` — defined, never called
- `searchCrypto(query)` — defined, never called

**Khuyến nghị**: Xóa hoặc đánh dấu là experimental API.

### 5.6 `commodity-data/index.js` — `console.log/warn` trong production code

`CommodityDataClient` class dùng `console.log` và `console.warn` trực tiếp thay vì dùng logger (vi phạm project convention).

### 5.7 `PortfolioPage.jsx` — Duplicate export

**File**: [src/ui-preact/pages/PortfolioPage.jsx:177,537](../src/ui-preact/pages/PortfolioPage.jsx)

```js
export default function PortfolioPage() { ... }  // line 177 - default export (unused)
export { PortfolioPage };  // line 537 - named export (used by MainApp.jsx)
```

Default export không được import bởi ai. Nên đổi sang `export function PortfolioPage()` (named only, remove default).

### 5.8 `GiaVang` fallback provider — Comment không có implementation

**File**: [src/commodity-data/index.js:8](../src/commodity-data/index.js)

Comment: `* - Gold: BTMC (primary) → GiaVang (fallback)` nhưng `GiaVangProvider` không tồn tại trong codebase. Chỉ có `BTMCGoldProvider`.

### 5.9 `sessionManager.js` — Không trong registry

Như đề cập ở mục 2.3, `sessionManager.js` cần được thêm vào `coreRegistry.js` để đồng nhất pattern.

### 5.10 Mixed export patterns ở UI pages

Một số pages dùng `export default`, một số dùng named exports. Không gây bug nhưng inconsistent:
- Default exports: `AssetsPage`, `WatchlistPage`
- Named exports: `PortfolioPage`, `PromptsPage`, `HistoryPage`, v.v.

---

## 6. Tổng Hợp Changes Đã Fix

| # | File | Thay đổi |
|---|------|---------|
| 1 | `src/background/handlers/llm.js` | Fix import `ERROR_CODES` từ `types.js` → `shared/errorCodes.js` (critical bug) |
| 2 | `src/background/handlers/llm.js` | 3 handler registrations: raw string → `MESSAGE_TYPES` constants |
| 3 | `src/background/handlers/llm.js` | 4 error codes: raw string → `ERROR_CODES` constants |
| 4 | `src/background/handlers/llm.js` | 3 response types: raw string → `MESSAGE_TYPES` constants |
| 5 | `src/background/handlers/settings.js` | Fix variable shadowing: rename inner `data` → `savedData` |
| 6 | `src/background/handlers/settings.js` | 2 `console.log` → `logger.debug` |
| 7 | `src/background/index.js` | Unused `sessionManagerModule` variable → side-effect import |
| 8 | `src/ui-preact/components/MainApp.jsx` | Remove unused `useEffect` import |
| 9 | `src/ui-preact/state/portfolioState.js` | Remove unused `sortBy` signal |
| 10 | `src/ui-preact/state/portfolioState.js` | Remove unused `filteredPortfolioItems` computed |
| 11 | `src/ui-preact/state/portfolioState.js` | Remove unused `setLastUpdateTime` function |
| 12 | `src/ui-preact/state/navigationState.js` | Fix outdated JSDoc (removed 'english', added all current pages) |
| 13 | ~~`src/background/services/enrichmentQueue.js`~~ | Xóa file dead code |

---

## 7. Kiến Trúc — Nhận Xét Chung

**Tốt**:
- Message router pattern (registerHandler + MESSAGE_TYPES) nhất quán và dễ trace
- Registry system cho handler registration — clean separation
- LLM provider interface (`sendPrompt`, `getStatus`, `getCapabilities`) được 3 providers implement đầy đủ
- Commodity provider interface segregation đúng (gold/crypto không cross domain)
- p-queue cho serialized prompt execution — đúng hướng

**Cần cải thiện**:
- Dual `ERROR_CODES` definitions tạo risk cho ai thêm code mới sẽ import sai
- `EnglishPage.jsx` orphaned — cần quyết định xóa hoặc reconnect
- Handler registration pattern không 100% nhất quán (sessionManager bypass registry)
- Raw string error codes rải rác ở `multiPortfolio`, `apiKeys`, `priceAlerts`
