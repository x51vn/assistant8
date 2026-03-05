# Requirements: Fix `Receiving end does not exist` (Safe Messaging in MV3)

**Date**: 2026-03-04  
**Status**: Draft  
**Applies to**: MV3 background service worker, sidepanel UI, content scripts  
**Primary error**: `Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist.`

---

## 1) Problem Statement

Hệ thống hiện đôi khi log lỗi runtime:

```
Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist.
```

Đây là lỗi “promise rejection không được handle” (unhandled), gây nhiễu log, khó debug lỗi thật, và trong một số trường hợp có thể làm gián đoạn flow nếu callsite không có fallback.

---

## 2) Deep Understanding: Vì sao lỗi này xảy ra trong Chrome Extensions (MV3)

### 2.1 `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` có thể reject

- `chrome.tabs.sendMessage(tabId, ...)` sẽ reject nếu:
  - tab không tồn tại,
  - content script chưa được inject / chưa load,
  - trang không match `content_scripts.matches`,
  - frame không có receiver.
- `chrome.runtime.sendMessage(...)` (broadcast trong extension) sẽ reject nếu:
  - không có context nào đang lắng nghe message đó (ví dụ sidepanel đóng, không có UI listener),
  - extension đang reload/unload,
  - receiver bị crash.

### 2.2 Vì sao `try/catch` không bắt được?

Trong MV3, `chrome.runtime.sendMessage()` trả về **Promise** khi không truyền callback.

Ví dụ bug pattern:

```js
try {
  chrome.runtime.sendMessage({ type: 'X' });
} catch {}
```

`try/catch` chỉ bắt được lỗi synchronous. Promise reject xảy ra **sau đó**, nên sẽ tạo:

- `Uncaught (in promise) ...` nếu không `await` hoặc `.catch()`.

---

## 3) Codebase Messaging Topology (as-is)

### 3.1 UI → Background

- UI Preact gọi `chrome.runtime.sendMessage(...)` để request handlers qua `messageRouter`.
- Background service worker sẽ wake lên theo onMessage.
- Đây là request/response path; thường caller `await` và có try/catch.

### 3.2 Background → UI (broadcast best-effort)

- Nhiều job chạy bằng `chrome.alarms` và muốn “broadcast” để UI refresh nhanh nếu đang mở.
- Nếu UI đóng, broadcast là **optional** và phải được swallow (không được tạo unhandled rejection).

### 3.3 Background → Content Script (tab messaging)

- ChatGPT/Gemini/Claude web providers dùng `chrome.tabs.sendMessage` để inject/extract.
- Codebase đã có cơ chế readiness/registry/ping fallback; “Receiving end does not exist” là *expected transient* khi content script chưa sẵn sàng.

---

## 4) Identified Root Causes in This Repo

### 4.1 Unhandled Promise Rejection trong broadcast (background)

Các handler có broadcast kiểu “fire-and-forget” nhưng không `.catch()` hoặc không `await`:

- `src/background/handlers/supabasePriceUpdate.js`
  - Broadcast `XNEEWS_PRICES_UPDATED` khi alarm chạy.
  - Nếu sidepanel đóng: reject với “Receiving end does not exist”.
- `src/background/handlers/watchlistBgPriceFetch.js`
  - Broadcast `WATCHLIST_BG_PRICES_FETCHED` sau khi fetch/persist prices.
  - Nếu sidepanel đóng: reject tương tự.

---

## 5) Requirements to Fix (Systematic)

### 5.1 Introduce safe broadcast helper (mandatory)

Tạo helper dùng chung cho background:

- `safeBroadcast(message, { logLevelOnNoReceiver = 'debug' })`
- Behavior:
  - Always attaches `.catch()`.
  - Nếu error message chứa `Receiving end does not exist`:
    - log ở debug (hoặc không log), không throw.
  - Với các lỗi khác:
    - log warn (non-critical), không throw.

**Rationale**: Broadcast là best-effort; source of truth là Supabase DB. UI có thể refresh từ DB khi mở.

### 5.2 Apply helper to all background→UI broadcasts (mandatory)

Audit và replace mọi broadcast dạng:

- `chrome.runtime.sendMessage({ ... })` (không await/catch)
- `try { chrome.runtime.sendMessage(...) } catch {}`

Tất cả phải dùng:

- `safeBroadcast(...)`
  - hoặc `chrome.runtime.sendMessage(...).catch(...)`
  - hoặc `await chrome.runtime.sendMessage(...);` trong try/catch (nếu thực sự cần blocking)

### 5.3 No-floating-promises rule (recommended)

Thêm guardrail để không tạo lại bug:

- ESLint rule để bắt Promise không được handle:
  - `@typescript-eslint/no-floating-promises` (nếu migrate TS)
  - hoặc custom ESLint rule / pattern check cho `chrome.*.sendMessage(`.

Minimum alternative:

- CI check (grep) phát hiện `chrome.runtime.sendMessage({` trong background mà không có `.catch` trong cùng statement.

### 5.4 Acceptance Criteria

- AC-01: Đóng sidepanel, để alarms chạy (watchlistPriceUpdate / watchlistBgPriceFetch), **không còn** `Uncaught (in promise) ... Receiving end does not exist` trong service worker console.
- AC-02: Mở sidepanel, broadcast vẫn đến UI (UI refresh nhanh hơn), không gây crash nếu listener chưa đăng ký kịp.
- AC-03: Khi content script chưa sẵn sàng, retry/fallback xử lý bình thường; không có unhandled rejection.

---

## 6) Verification Scenarios (manual)

1. Close sidepanel hoàn toàn.
2. Chờ alarm chạy (hoặc trigger manual route).
3. Mở Service Worker DevTools:
   - Không còn unhandled promise error.
4. Mở sidepanel Watchlist:
   - Giá vẫn update từ DB/broadcast.

