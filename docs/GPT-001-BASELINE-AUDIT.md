# GPT-001 Baseline Audit Report - Architecture-Code Mapping

**Date**: 2026-01-24  
**Status**: ✅ Completed  
**Timebox**: 4 hours

---

## Executive Summary

- Đã hoàn thành audit kiến trúc và codebase. Project hiện tại có **nhiều điểm LỆCH kiến trúc mục tiêu** (cloud-first Supabase) do lịch sử chuyển đổi, hiện trạng:
- ✅ Firebase dependencies (removed)
- ✅ Local storage business data
- ✅ Thiếu Supabase integration hoàn chỉnh
- ⚠️ Message types đã có nhưng cần align
- ⚠️ Handlers đã có một số nhưng cần refactor

**Major Gaps**: 
1. Firebase removed (GPT-028, 029, 030)
2. Migration từ chrome.storage.local sang Supabase (GPT-026, 027)
3. Supabase handlers cần implement đầy đủ (GPT-010-019)
4. Auth gate chưa có (GPT-008)

---

## 1. Architecture Compliance Matrix

### 1.1 Core Principles

| Principle | Status | Notes |
|-----------|--------|-------|
| **Event-Driven SW** | ✅ PASS | Listeners đăng ký top-level sync trong `index.js` |
| **Message-Based** | ✅ PASS | Message router pattern đã implement |
| **Cloud-First Storage** | ❌ FAIL | Vẫn dùng `chrome.storage.local` cho business data |
| **Modular Handlers** | ⚠️ PARTIAL | Có handlers nhưng chưa đầy đủ Supabase CRUD |
| **Minimal Permissions** | ✅ PASS | Manifest permissions hợp lý |

### 1.2 Components Status

| Component | Expected | Actual | Gap |
|-----------|----------|--------|-----|
| **Background SW** | Middleware orchestrator | ✅ Có, nhưng vẫn xử lý local storage | Cần refactor handlers |
| **Message Router** | Command pattern | ✅ Implemented | OK |
| **Handlers** | Auto-register | ✅ Có pattern | Thiếu Supabase CRUD handlers |
| **Content Script** | ChatGPT automation | ✅ Implemented | OK |
| **Side Panel UI** | Modular tabs | ✅ Có | Cần thêm auth gate |
| **Supabase Client** | Auth + CRUD | ⚠️ Config có, handlers thiếu | Cần implement |

---

## 2. Message Types Mapping

### 2.1 Existing vs Required

**Legend**:
- ✅ = Có và đúng
- ⚠️ = Có nhưng cần align
- ❌ = Thiếu

#### A. Auth Messages

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `SUPABASE_AUTH_LOGIN` → `SUPABASE_AUTH_SUCCESS` | ✅ | `supabaseAuth.js` | Đã có |
| `SUPABASE_AUTH_LOGOUT` → `SUPABASE_AUTH_LOGGED_OUT` | ✅ | `supabaseAuth.js` | Đã có |
| `SUPABASE_AUTH_CHECK` → `SUPABASE_AUTH_STATUS` | ✅ | `supabaseAuth.js` | Đã có |
| `AUTH_STATE_CHANGED` | ✅ | `supabaseAuth.js` | Broadcast |

#### B. Prompts Messages

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `PROMPT_GET_ALL` → `PROMPT_DATA` | ✅ | `prompts.js` | Đã có Supabase |
| `PROMPT_GET_BY_ID` → `PROMPT_ITEM` | ✅ | `prompts.js` | Đã có |
| `PROMPT_ADD` → `PROMPT_ADDED` | ✅ | `prompts.js` | Đã có |
| `PROMPT_UPDATE` → `PROMPT_UPDATED` | ✅ | `prompts.js` | Đã có |
| `PROMPT_DELETE` → `PROMPT_DELETED` | ✅ | `prompts.js` | Đã có |
| `PROMPT_SEARCH` → `PROMPT_SEARCH_RESULTS` | ✅ | `prompts.js` | Đã có |

#### C. Categories Messages

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `CATEGORY_GET_ALL` → `CATEGORY_DATA` | ✅ | `categories.js` | Đã có Supabase |
| `CATEGORY_ADD` → `CATEGORY_ADDED` | ✅ | `categories.js` | Đã có |
| `CATEGORY_UPDATE` → `CATEGORY_UPDATED` | ✅ | `categories.js` | Đã có |
| `CATEGORY_DELETE` → `CATEGORY_DELETED` | ✅ | `categories.js` | Đã có |

#### D. Portfolio Messages

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `PORTFOLIO_GET` → `PORTFOLIO_DATA` | ⚠️ | `portfolio.js` | Có nhưng dùng local storage |
| `PORTFOLIO_ADD` → `PORTFOLIO_ADDED` | ⚠️ | `portfolio.js` | Cần migrate Supabase |
| `PORTFOLIO_UPDATE` → `PORTFOLIO_UPDATED` | ⚠️ | `portfolio.js` | Cần migrate Supabase |
| `PORTFOLIO_REMOVE` → `PORTFOLIO_REMOVED` | ⚠️ | `portfolio.js` | Cần migrate Supabase |
| `PORTFOLIO_UPDATE_PRICES` → `PORTFOLIO_PRICES_UPDATED` | ⚠️ | `alarms.js` | Có logic, cần Supabase |

#### E. History Messages

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `HISTORY_GET_ALL` → `HISTORY_DATA` | ✅ | `chatHistory.js` | Đã có Supabase |
| `HISTORY_GET_BY_ID` → `HISTORY_ITEM` | ✅ | `chatHistory.js` | Đã có |
| `HISTORY_ADD` → `HISTORY_ADDED` | ✅ | `chatHistory.js` | Đã có |
| `HISTORY_CLEAR` → `HISTORY_CLEARED` | ✅ | `chatHistory.js` | Đã có |

#### F. Errors Messages

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `ERROR_GET_ALL` → `ERROR_DATA` | ✅ | `errorTracking.js` | Đã có Supabase |
| `ERROR_ADD` → `ERROR_ADDED` | ✅ | `errorTracking.js` | Đã có |
| `ERROR_UPDATE` → `ERROR_UPDATED` | ✅ | `errorTracking.js` | Đã có |
| `ERROR_DELETE` → `ERROR_DELETED` | ✅ | `errorTracking.js` | Đã có |

#### G. High-Level Orchestration

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `SEND_PROMPT` → `PROMPT_SENT` | ⚠️ | `prompt.js` | Có nhưng cần integrate Supabase save |
| `ENSURE_CHATGPT_OPEN` → `CHATGPT_TAB_READY` | ⚠️ | `prompt.js` | Có |

#### H. ChatGPT Low-Level

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `CHATGPT_SEND_INPUT` → `CHATGPT_INPUT_SENT` | ✅ | `chatgpt.js` | OK |
| `CHATGPT_GET_OUTPUT` → `CHATGPT_OUTPUT_READY` | ✅ | `chatgpt.js` | OK |


#### I. Firebase (REMOVED)

| Message Type | Status | Handler | Notes |
|--------------|--------|---------|-------|
| `FIREBASE_AUTH` | ✅ REMOVED | `firebase.js` | GPT-029 |
| `FIREBASE_SYNC` → `FIREBASE_SYNCED` | ✅ REMOVED | `firebase.js` | GPT-029 |
| `FIREBASE_RESTORE` → `FIREBASE_RESTORED` | ✅ REMOVED | `firebase.js` | GPT-029 |
| `FIREBASE_LIST_BACKUPS` → `FIREBASE_BACKUPS_LISTED` | ✅ REMOVED | `firebase.js` | GPT-029 |

---

## 3. Handlers Mapping

### 3.1 Current Handlers

**Location**: `src/background/handlers/`

| File | Purpose | Status | Action |
|------|---------|--------|--------|
| `index.js` | Handler registration | ✅ | OK, update imports |
| `chatgpt.js` | ChatGPT DOM automation | ✅ | Keep |
| `prompt.js` | High-level prompt flow | ⚠️ | Refactor to save Supabase |
| `supabaseAuth.js` | Auth handlers | ✅ | Keep, test thoroughly |
| `prompts.js` | Prompts CRUD | ✅ | Keep, đã Supabase |
| `categories.js` | Categories CRUD | ✅ | Keep, đã Supabase |
| `chatHistory.js` | History CRUD | ✅ | Keep, đã Supabase |
| `errorTracking.js` | Errors CRUD | ✅ | Keep, đã Supabase |
| `portfolio.js` | Portfolio (local) | ❌ | **Refactor to Supabase (GPT-010)** |
| `history.js` | History (legacy?) | ⚠️ | Check duplicate with chatHistory.js |
| `errors.js` | Errors (legacy?) | ⚠️ | Check duplicate with errorTracking.js |
| `firebase.js` | Firebase sync | ❌ | **Remove (GPT-029)** |
| `alarms.js` | Alarms (CHECK/AUTORUN) | ⚠️ | Update for Supabase portfolio |
| `contextMenu.js` | Right-click menu | ✅ | Keep |
| `content.js` | Content script msg | ✅ | Keep |
| `state.js` | State management | ⚠️ | Review, might be legacy |
| `telemetry.js` | Telemetry | ✅ | Keep |
| `health.js` | Health check | ✅ | Keep |

### 3.2 Missing Handlers (Need Implementation)

**Status**: Một số đã có, cần kiểm tra coverage

| Feature | Handler | Status | Ticket |
|---------|---------|--------|--------|
| Portfolio CRUD (Supabase) | `portfolio.js` | ❌ Refactor | GPT-010, 018 |
| Migration v1 | `migration.js` | ❌ Missing | GPT-026 |
| Migration v2 | `migration.js` | ❌ Missing | GPT-027 |

---

## 4. Storage Strategy Gap Analysis

### 4.1 Current Storage Usage

**chrome.storage.local** (hiện tại):
```javascript
{
  // Auth
  'sb-xxx-auth-token': '...',
  
  // Business data (KHÔNG NÊN Ở ĐÂY)
  portfolio: [...],
  notes: [...],
  settings: { autoRun, interval, ... },
  chatHistory: [...],  // Có thể còn tồn tại
  errorList: [...]      // Có thể còn tồn tại
}
```

**Supabase** (mục tiêu):
```sql
-- Tables
- users (auth.users)
- prompts ✅ (đã có handlers)
- categories ✅ (đã có handlers)
- chat_history ✅ (đã có handlers)
- portfolio ❌ (cần refactor)
- errors ✅ (đã có handlers)
- settings ❌ (cần implement)
- runs (optional)
```

### 4.2 Migration Status

| Data Type | Source | Target | Status | Ticket |
|-----------|--------|--------|--------|--------|
| Auth Token | chrome.storage.local | chrome.storage.local | ✅ OK | N/A |
| Portfolio | chrome.storage.local | Supabase | ❌ TODO | GPT-026 |
| Chat History | chrome.storage.local | Supabase | ⚠️ Partial | GPT-026 |
| Errors | chrome.storage.local | Supabase | ⚠️ Partial | GPT-026 |
| Settings | chrome.storage.local | Supabase | ❌ TODO | GPT-026 |
| Prompts | N/A (new) | Supabase | ✅ | GPT-012 |
| Categories | N/A (new) | Supabase | ✅ | GPT-010 |

---

## 5. Manifest & Permissions Gap

### 5.1 Current Permissions

**manifest.json**:
```json
{
  "permissions": [
    "storage",        // ✅ OK (auth token)
    "tabs",           // ✅ OK (ChatGPT tab)
    "scripting",      // ✅ OK (content script)
    "alarms",         // ✅ OK (periodic tasks)
    "sidePanel",      // ✅ OK (UI)
    "identity",       // ⚠️ For Firebase OAuth, remove sau
    "contextMenus",   // ✅ OK
    "activeTab"       // ✅ OK
  ],
  "host_permissions": [
    "https://chatgpt.com/*",                  // ✅ OK
    "https://iboard-query.ssi.com.vn/*",     // ✅ OK (SSI API)
    "https://iboard.ssi.com.vn/*"            // ✅ OK (SSI API)
  ]
}
```

**Cần thêm**:
```json
{
  "host_permissions": [
    "https://*.supabase.co/*"  // ❌ MISSING - GPT-031
  ]
}
```

**Cần remove (sau khi xóa Firebase)**:
```json
{
  "permissions": [
    "identity"  // ❌ Remove in GPT-028
  ],
  "oauth2": { ... }  // ❌ Remove in GPT-028
}
```

---

## 6. Dependencies Gap

### 6.1 Current package.json

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.91.0",  // ✅ Đã có
    "firebase": "^12.7.0"                // ✅ REMOVED (GPT-028)
  }
}
```

**Action**: Firebase dependency removed from package.json (GPT-028)

---

## 7. UI Gap Analysis

### 7.1 Current UI Files

**Location**: `src/ui/`

| File | Purpose | Status | Notes |
|------|---------|--------|-------|
| `index.js` | Entry point | ✅ | OK |
| `auth.js` | Auth UI | ⚠️ | Có Supabase login nhưng chưa gate |
| `portfolio.js` | Portfolio UI | ⚠️ | Dùng local storage, cần refactor |
| `history.js` | History UI | ⚠️ | Check nếu dùng Supabase |
| `errors.js` | Errors UI | ⚠️ | Check nếu dùng Supabase |
| `results.js` | Results page | ✅ | OK |
| `settings.js` | Settings | ⚠️ | Dùng local, cần Supabase |
| `english.js` | English learning | ✅ | OK |
| `sync.js` | Firebase sync UI | ❌ | **Remove (GPT-030)** |
| `backup.js` | Backup UI | ⚠️ | Check if Firebase-related |

### 7.2 Missing UI Components

| Component | Purpose | Status | Ticket |
|-----------|---------|--------|--------|
| **Auth Gate** | Block UI until login | ❌ Missing | GPT-008 |
| **Login Form** | Email/password | ⚠️ Có nhưng cần enhance | GPT-008 |
| **Signup Form** | Registration | ❌ Missing | GPT-008-003 |
| **Categories UI** | Categories CRUD | ❌ Missing | GPT-011 |
| **Prompts Library** | Prompts CRUD | ❌ Missing | GPT-013 |

---

## 8. Code Quality Issues

### 8.1 Duplicate Handlers

| Handler | Files | Issue |
|---------|-------|-------|
| History | `history.js`, `chatHistory.js` | ⚠️ 2 handlers cho cùng feature? |
| Errors | `errors.js`, `errorTracking.js` | ⚠️ 2 handlers cho cùng feature? |

**Action**: Xác định handler nào dùng, xóa duplicate (GPT-001-001)

### 8.2 Firebase References

**Count**: 90 references to "firebase" in codebase

**Files affected**:
- `src/background/handlers/firebase.js`
- `src/ui/sync.js`
- `src/ui/backup.js` (?)
- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`

**Action**: Remove toàn bộ (GPT-028, 029, 030)

---

## 9. Testing Gap

### 9.1 Current Tests

**Unit Tests**: `vitest` configured  
**E2E Tests**: `playwright` configured  

**Status**: Unknown coverage, cần check

**Action**: 
- GPT-033: Unit tests cho Supabase utilities
- GPT-034: Unit tests cho handlers
- GPT-035: E2E Auth + CRUD
- GPT-036: E2E Portfolio + prices

---

## 10. Architectural Decisions (Phổ biến)

### 10.1 Auth Strategy

**Decision**: Email/Password  
**Rationale**: Phổ biến nhất, đơn giản, Supabase built-in  
**Alternative**: OAuth (Google), Magic Link  
**Chosen**: Email/Password (GPT-007, 008)

### 10.2 History Limit

**Decision**: 100 records  
**Rationale**: Balance giữa performance và usability  
**Alternative**: 50, 200, unlimited  
**Chosen**: 100 (GPT-014)

### 10.3 Retry Strategy

**Decision**: 3 retries với exponential backoff  
**Rationale**: Industry standard  
**Code**: `supabaseWithRetry` (GPT-004)

### 10.4 Realtime Strategy

**Decision**: UI-only subscriptions + fallback polling  
**Rationale**: SW không thể maintain WebSocket  
**Alternative**: Pure polling  
**Chosen**: Realtime (UI) + Polling fallback (GPT-025)

### 10.5 Error Messages

**Decision**: Vietnamese with error codes  
**Rationale**: User-facing Vietnamese, dev-facing English codes  
**Implementation**: GPT-006, 032

---

## 11. Risk Assessment

### 11.1 High Risks

| Risk | Impact | Mitigation | Ticket |
|------|--------|------------|--------|
| **Firebase removal breaks prod** | 🔴 Critical | Migration first, remove after | GPT-026-030 |
| **Supabase RLS misconfiguration** | 🔴 Critical | Thorough testing, review | GPT-009 |
| **Auth token lost on SW terminate** | 🟡 Medium | chromeStorageAdapter tested | GPT-003 |
| **ChatGPT selectors break** | 🟡 Medium | Multiple fallbacks | Already handled |
| **Playwright tests flaky** | 🟡 Medium | Stable checks, retries | GPT-035, 036 |

### 11.2 Medium Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Portfolio price API rate limit** | 🟡 Medium | Batch + delay (GPT-020) |
| **Realtime connection drops** | 🟡 Medium | Polling fallback (GPT-025) |
| **Migration data loss** | 🟡 Medium | Backup before clear (GPT-026) |

---

## 12. Action Items Summary

### 12.1 Critical Path (Must Do)

1. ✅ **GPT-001-001**: Register all handlers in index.js (fix duplicates)
2. ⚠️ **GPT-002**: Add Supabase SDK (đã có, check config)
3. ⚠️ **GPT-003**: Supabase SW client (đã có, test)
4. ✅ **GPT-007**: Auth handlers (đã có)
5. ❌ **GPT-008**: Auth gate UI (missing)
6. ✅ **GPT-009**: SQL schema + RLS (cần deploy)
7. ❌ **GPT-010**: Portfolio CRUD Supabase (refactor)
8. ❌ **GPT-026**: Migration v1 (portfolio, history, errors, settings)
9. ❌ **GPT-027**: Migration v2 (prompts, categories)
10. ❌ **GPT-028**: Remove Firebase from build
11. ❌ **GPT-029**: Remove Firebase handlers
12. ❌ **GPT-030**: Remove Firebase UI

### 12.2 High Priority (Should Do)

13. ❌ **GPT-011**: Categories UI
14. ❌ **GPT-013**: Prompts Library UI
15. ⚠️ **GPT-018**: Portfolio refactor to middleware
16. ⚠️ **GPT-020**: SSI price fetcher (có logic, cần Supabase)
17. ❌ **GPT-031**: Manifest permissions alignment

### 12.3 Medium Priority (Nice to Have)

18. ❌ **GPT-025**: Realtime subscriptions + polling fallback
19. ❌ **GPT-033-036**: Testing coverage
20. ❌ **GPT-037-038**: Final architecture review

---

## 13. File/Symbol Map for Each Gap

### Gap 1: Firebase Removal

**Files to modify/delete**:
```
src/background/handlers/firebase.js          ❌ DELETE
src/background/handlers/index.js             ✏️ Remove import
src/ui/sync.js                               ❌ DELETE
src/ui/backup.js                             ⚠️ Check if Firebase-related
firebase.json                                ❌ DELETE
.firebaserc                                  ❌ DELETE
firestore.rules                              ❌ DELETE
firestore.indexes.json                       ❌ DELETE
package.json                                 ✏️ Remove firebase dep
src/shared/messageSchema.js                  ✏️ Remove FIREBASE_* types
```

### Gap 2: Portfolio Supabase Migration

**Files to refactor**:
```
src/background/handlers/portfolio.js         ✏️ Refactor to Supabase
src/ui/portfolio.js                          ✏️ Update to use new handlers
src/background/handlers/alarms.js            ✏️ Update price fetch logic
```

**New code needed**:
- `requireAuth()` call
- `supabaseWithRetry()` wrapper
- CRUD operations với `supabase.from('portfolio')`

### Gap 3: Auth Gate

**Files to create/modify**:
```
src/ui/auth.js                               ✏️ Add auth gate logic
src/ui/index.js                              ✏️ Check auth on load
```

**New UI**:
- Login form (enhance existing)
- Signup form (new)
- Remember Me checkbox
- Password visibility toggle

### Gap 4: Handler Duplicates

**Files to check**:
```
src/background/handlers/history.js           ⚠️ vs chatHistory.js
src/background/handlers/errors.js            ⚠️ vs errorTracking.js
```

**Action**: Xác định handler nào active, xóa unused

---

## 14. Definition of Done Checklist

- [x] ✅ Liệt kê rõ các điểm lệch kiến trúc
- [x] ✅ Bảng mapping message types (hiện có vs cần có)
- [x] ✅ Bảng mapping handlers (hiện có vs cần có)
- [x] ✅ Bảng mapping storage keys (hiện tại vs chiến lược mới)
- [x] ✅ Liệt kê permissions/host_permissions cần thiết
- [x] ✅ Đưa ra quyết định "phổ biến" cho ambiguity
- [x] ✅ Checklist gap rõ ràng, actionable
- [x] ✅ List file/symbol liên quan cho từng gap
- [x] ✅ Các rủi ro lớn được nêu

---

## 15. Next Steps

**Thứ tự thực hiện tickets** (theo dependency):

1. **Foundation** (GPT-001-006): Baseline, SDK, utilities
2. **Auth** (GPT-007-008): Backend + UI login gate
3. **Database** (GPT-009): SQL schema + RLS
4. **Supabase CRUD** (GPT-010-019): Implement handlers + UI
5. **Migration** (GPT-026-027): Migrate data
6. **Firebase Removal** (GPT-028-030): Remove legacy code
7. **Refinement** (GPT-031-036): Permissions, testing
8. **Review** (GPT-037-038): Final compliance check

**Estimated Total Time**: 80-120 hours

---

**End of Audit Report**
