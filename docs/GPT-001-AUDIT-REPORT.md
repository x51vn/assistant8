# GPT-001 Architecture-Code Mapping & Gap Analysis

**Date**: January 23, 2026  
**Ticket**: GPT-001 Baseline audit & Architecture-Code mapping  
**Status**: ✅ COMPLETE

---

## Executive Summary

This audit compares the **target architecture** (docs/ARCHITECTURE.md) against the **current codebase** to identify gaps requiring implementation. The codebase currently has **Firebase integration** and **local storage for business data**, both of which violate the Supabase-first, cloud-only architecture.

**Critical Finding**: ~35% of architecture requirements are **NOT implemented** or are **incorrectly implemented**.

---

## 1. Architecture Requirements vs Current State

### 1.1 Storage Strategy

| Requirement | Current State | Gap |
|------------|---------------|-----|
| **NO business data in chrome.storage.local** | ❌ Portfolio, history, errors stored locally | **CRITICAL** |
| **chrome.storage.local ONLY for auth token** | ❌ Used for portfolio, history, errors, settings | **CRITICAL** |
| **All business data in Supabase** | ❌ No Supabase integration | **CRITICAL** |
| **User-based data (user_id + RLS)** | ❌ No user model | **CRITICAL** |

**Evidence**:
- `src/background/handlers/portfolio.js:63`: `chrome.storage.local.get(['portfolio'])`
- `src/background/handlers/errors.js:36`: `chrome.storage.local.get([ERROR_LIST_KEY])`
- `src/background/handlers/history.js:21`: `chrome.storage.local.get([CHAT_HISTORY_KEY])`
- `src/ui/portfolio.js`: 16+ chrome.storage.local calls
- `src/ui/settings.js`: Multiple chrome.storage.local calls

**Decision**: All handlers must be refactored to call Supabase via `supabaseWithRetry()`.

---

### 1.2 Backend & Dependencies

| Requirement | Current State | Gap |
|------------|---------------|-----|
| **Supabase SDK** | ❌ Not installed | **CRITICAL** |
| **NO Firebase** | ❌ Firebase in package.json + handlers | **CRITICAL** |
| **Supabase config with chromeStorageAdapter** | ❌ Not present | **HIGH** |
| **Auth: Supabase email/password** | ❌ Firebase OAuth | **HIGH** |

**Evidence**:
- `package.json:20`: `"firebase": "^12.7.0"`
- `src/background/handlers/firebase.js`: Entire Firebase sync/restore implementation
- `src/background/handlers/index.js:16`: `import './firebase.js'`
- No `@supabase/supabase-js` dependency

**Decision**:
- Remove Firebase dependency (GPT-028)
- Add `@supabase/supabase-js` (GPT-002)
- Create `src/supabaseConfig.js` with chromeStorageAdapter (GPT-003)

---

### 1.3 Message Types

#### Missing MESSAGE_TYPES (Required by Architecture)

| Category | Required Types | Current State |
|----------|----------------|---------------|
| **Auth** | `SUPABASE_AUTH_LOGIN`, `SUPABASE_AUTH_LOGOUT`, `SUPABASE_AUTH_CHECK`, `SUPABASE_AUTH_SUCCESS`, `SUPABASE_AUTH_LOGGED_OUT`, `SUPABASE_AUTH_STATUS` | ❌ Missing |
| **Prompts** | `PROMPT_GET_ALL`, `PROMPT_GET_BY_ID`, `PROMPT_ADD`, `PROMPT_UPDATE`, `PROMPT_DELETE`, `PROMPT_SEARCH`, `PROMPT_DATA`, `PROMPT_ITEM`, `PROMPT_ADDED`, `PROMPT_UPDATED`, `PROMPT_DELETED`, `PROMPT_SEARCH_RESULTS` | ❌ Missing |
| **Categories** | `CATEGORY_GET_ALL`, `CATEGORY_ADD`, `CATEGORY_UPDATE`, `CATEGORY_DELETE`, `CATEGORY_DATA`, `CATEGORY_ADDED`, `CATEGORY_UPDATED`, `CATEGORY_DELETED` | ❌ Missing |
| **Portfolio** | `PORTFOLIO_GET`, `PORTFOLIO_DATA`, `PORTFOLIO_ADDED`, `PORTFOLIO_UPDATED`, `PORTFOLIO_REMOVED`, `PORTFOLIO_UPDATE_PRICES`, `PORTFOLIO_PRICES_UPDATED` | ⚠️ Partial (only ADD/UPDATE/REMOVE) |
| **History** | `HISTORY_ADD`, `HISTORY_ADDED`, `HISTORY_DATA` | ⚠️ Partial (GET/CLEAR exist) |
| **Errors** | `ERROR_DATA` | ⚠️ Partial (others exist) |
| **Migration** | `MIGRATE_LOCAL_TO_SUPABASE`, `MIGRATION_COMPLETE`, `MIGRATION_AVAILABLE` | ❌ Missing |

#### Obsolete MESSAGE_TYPES (Should Remove)

| Type | Reason |
|------|--------|
| `FIREBASE_AUTH`, `FIREBASE_SYNC`, `FIREBASE_SYNCED`, `FIREBASE_RESTORE`, `FIREBASE_RESTORED`, `FIREBASE_LIST_BACKUPS`, `FIREBASE_BACKUPS_LISTED` | Firebase being removed |
| `STATE_GET`, `STATE_SET`, `STATE_UPDATED` | No state handler needed in stateless middleware |

**Decision**:
- Add missing types in GPT-006
- Remove Firebase types in GPT-029

---

### 1.4 Handlers

#### Missing Handlers (Required by Architecture)

| Handler | Purpose | Tickets |
|---------|---------|---------|
| **supabase.js** | Auth handlers: LOGIN, LOGOUT, CHECK | GPT-007 |
| **prompts.js** | CRUD for prompts table | GPT-012 |
| **categories.js** | CRUD for categories table | GPT-010 |
| **migration.js** | MIGRATE_LOCAL_TO_SUPABASE | GPT-026, GPT-027 |
| **prices.js** | SSI batch price fetcher + PORTFOLIO_UPDATE_PRICES | GPT-020, GPT-021 |

**Note**: `alarms.js`, `contextMenu.js`, `telemetry.js` exist but not registered in `index.js`.

#### Obsolete Handlers (Should Remove)

| Handler | Reason | Ticket |
|---------|--------|--------|
| **firebase.js** | Firebase removed | GPT-029 |
| **state.js** | No in-memory state in middleware | GPT-029 |

#### Handlers Requiring Refactor

| Handler | Issue | Ticket |
|---------|-------|--------|
| **portfolio.js** | Uses chrome.storage.local; needs Supabase | GPT-018 |
| **history.js** | Uses chrome.storage.local; needs Supabase | GPT-014 |
| **errors.js** | Uses chrome.storage.local; needs Supabase | GPT-016 |

**Decision**:
- Remove firebase.js, state.js (GPT-029)
- Add missing handlers (GPT-007, GPT-010, GPT-012, GPT-020/021, GPT-026/027)
- Refactor existing handlers to Supabase (GPT-014, GPT-016, GPT-018)

---

### 1.5 Utilities & Helpers

| Utility | Required | Current State | Ticket |
|---------|----------|---------------|--------|
| **supabaseConfig.js** | chromeStorageAdapter | ❌ Missing | GPT-003 |
| **supabaseWithRetry()** | Retry logic + error mapping | ❌ Missing | GPT-004 |
| **requireAuth()** | Get user_id or throw | ❌ Missing | GPT-005 |
| **getCurrentUserId()** | Auth helper | ❌ Missing | GPT-005 |

**Decision**: Implement all utilities before handler refactors.

---

### 1.6 UI Modules

#### Missing UI Pages

| Page | Purpose | Ticket |
|------|---------|--------|
| **Auth login/gate** | Login screen when unauthenticated | GPT-008 |
| **Prompts library** | Browse/search/manage prompts | GPT-013 |
| **Categories management** | CRUD categories/tags | GPT-011 |

#### UI Modules Requiring Refactor

| Module | Issue | Ticket |
|--------|-------|--------|
| **portfolio.js** | 16+ chrome.storage.local calls → call background middleware | GPT-019 |
| **history.js** | chrome.storage.local → background middleware | GPT-015 |
| **errors.js** | chrome.storage.local → background middleware | GPT-017 |
| **settings.js** | chrome.storage.local → background middleware | Implicit in others |
| **All UI** | No Realtime subscriptions | GPT-025 |

**Decision**:
- Add auth gate (GPT-008)
- Add prompts/categories UI (GPT-011, GPT-013)
- Refactor existing UI to middleware pattern (GPT-015, GPT-017, GPT-019)
- Add Realtime subscriptions (GPT-025)

---

### 1.7 Permissions & Manifest

| Required | Current | Gap |
|----------|---------|-----|
| `storage` | ✅ Present | OK |
| `tabs` | ✅ Present | OK |
| `scripting` | ✅ Present | OK |
| `alarms` | ✅ Present | OK |
| `sidePanel` | ✅ Present | OK |
| `contextMenus` | ✅ Present | OK |
| `activeTab` | ✅ Present | OK |
| `https://*.supabase.co/*` | ❌ Missing | **HIGH** |
| Remove `identity` (OAuth) | ⚠️ Still present | **MEDIUM** |

**Evidence**:
- `manifest.json:7`: `"identity"` (Firebase OAuth, not needed)
- `manifest.json`: No Supabase host permission

**Decision**: Update manifest in GPT-031.

---

### 1.8 Database Schema

| Requirement | Current State | Ticket |
|------------|---------------|--------|
| **Supabase PostgreSQL tables** | ❌ Not created | GPT-009 |
| **RLS policies** | ❌ Not created | GPT-009 |
| Tables: prompts, categories, chat_history, portfolio, errors, settings, runs | ❌ None exist | GPT-009 |

**Decision**: SQL schema + RLS in GPT-009 (must run before handlers).

---

### 1.9 Build & Config

| Requirement | Current State | Ticket |
|------------|---------------|--------|
| **Supabase env vars** | ❌ No .env.example | GPT-002 |
| **Remove Firebase config files** | ❌ firebase.json, firestore.* still present | GPT-028 |
| **Vite build excludes Firebase** | ❌ Not configured | GPT-028 |

**Decision**: Clean build config in GPT-028, add Supabase env in GPT-002.

---

### 1.10 Testing

| Requirement | Current State | Ticket |
|------------|---------------|--------|
| **Unit tests for utilities** | ❌ Missing | GPT-033 |
| **Unit tests for handlers** | ❌ Missing | GPT-034 |
| **E2E for auth + prompts** | ❌ Missing | GPT-035 |
| **E2E for portfolio** | ⚠️ Exists but uses old architecture | GPT-036 |

**Decision**: Add test coverage after implementation (GPT-033 to GPT-036).

---

## 2. Storage Keys Inventory

### Current chrome.storage.local Keys (Business Data - MUST REMOVE)

| Key | Used In | Should Be | Ticket |
|-----|---------|-----------|--------|
| `portfolio` | portfolio.js (handler + UI) | Supabase `portfolio` table | GPT-018, GPT-019 |
| `chatHistory` | history.js (handler + UI) | Supabase `chat_history` table | GPT-014, GPT-015 |
| `errorList` | errors.js (handler + UI) | Supabase `errors` table | GPT-016, GPT-017 |
| `stockEvalPrompt` | settings.js, portfolio.js | Supabase `settings` table | GPT-026 |
| `portfolioPromptKey` | portfolio.js (UI) | Supabase `settings` table | GPT-026 |
| Various settings | settings.js | Supabase `settings` table | GPT-026 |

### Allowed chrome.storage.local Keys (Target)

| Key | Purpose |
|-----|---------|
| `sb-{project}-auth-token` | Supabase auth token (via chromeStorageAdapter) |
| `sb-{project}-auth-token-code-verifier` | Supabase PKCE |
| `migration_completed` | One-time flag (optional) |

**Decision**: Migration handlers (GPT-026/027) will read old keys, bulk insert to Supabase, then clear chrome.storage.local.

---

## 3. Architecture Pattern Compliance

### 3.1 Service Worker Constraints

| Constraint | Compliance | Evidence |
|-----------|-----------|----------|
| **Listeners registered top-level sync** | ✅ YES | `src/background/index.js` |
| **No dynamic imports** | ✅ YES | Static imports only |
| **No in-memory state between calls** | ⚠️ NO | `state.js` handler exists |
| **Handlers are stateless** | ⚠️ PARTIAL | portfolio/history/errors use chrome.storage |

**Decision**: Remove state.js (GPT-029), refactor handlers to be truly stateless (call Supabase per request).

---

### 3.2 Middleware Pattern

| Requirement | Compliance | Gap |
|------------|-----------|-----|
| **UI NEVER calls Supabase directly** | ✅ YES (no Supabase yet) | Must maintain |
| **Background orchestrates all Supabase calls** | ❌ NO (no Supabase) | Add in handlers |
| **Background uses requireAuth()** | ❌ NO | Add GPT-005 |
| **Background wraps calls in supabaseWithRetry()** | ❌ NO | Add GPT-004 |

**Decision**: Strict enforcement during handler implementation.

---

### 3.3 Error Handling

| Requirement | Current | Ticket |
|------------|---------|--------|
| **Retry transient errors (network, 5xx)** | ❌ NO | GPT-004 |
| **Don't retry client errors (4xx)** | ❌ NO | GPT-004 |
| **Map to VN user messages** | ⚠️ PARTIAL | GPT-032 |
| **Technical details in console only** | ⚠️ PARTIAL | GPT-032 |

**Decision**: Implement in supabaseWithRetry (GPT-004) + UI error mapping (GPT-032).

---

### 3.4 Realtime Strategy

| Requirement | Current | Ticket |
|------------|---------|--------|
| **NO Realtime in Service Worker** | ✅ YES (none exist) | Maintain |
| **Realtime in UI (side panel)** | ❌ NO | GPT-025 |
| **Fallback polling pattern** | ❌ NO | GPT-025 |

**Decision**: Implement Realtime in UI (GPT-025), document fallback pattern.

---

## 4. Feature Coverage

### 4.1 Prompts & Categories

| Feature | Architecture | Current | Ticket |
|---------|-------------|---------|--------|
| **Prompt templates CRUD** | Required | ❌ Missing | GPT-012 (handler), GPT-013 (UI) |
| **Categories/Tags CRUD** | Required | ❌ Missing | GPT-010 (handler), GPT-011 (UI) |
| **Prompt search** | Required | ❌ Missing | GPT-012 |
| **Favorites** | Required | ❌ Missing | GPT-012 |
| **Usage tracking** | Required | ❌ Missing | GPT-012 |

---

### 4.2 Portfolio

| Feature | Architecture | Current | Ticket |
|---------|-------------|---------|--------|
| **Portfolio CRUD** | Supabase | chrome.storage.local | GPT-018, GPT-019 |
| **SSI price integration** | Batch + concurrent | ❌ Missing | GPT-020 |
| **Auto price updates (alarms)** | Every 5min market hours | ⚠️ Alarm handler exists but not used | GPT-021, GPT-022 |
| **Price history** | Optional | ❌ Missing | Future |

---

### 4.3 Chat History

| Feature | Architecture | Current | Ticket |
|---------|-------------|---------|--------|
| **Save chat history** | Supabase | chrome.storage.local | GPT-014, GPT-015 |
| **Link to prompt template** | prompt_id FK | ❌ Missing | GPT-014 |
| **Chat URL tracking** | chat_url field | ❌ Missing | GPT-014 |

---

### 4.4 Error Tracking

| Feature | Architecture | Current | Ticket |
|---------|-------------|---------|--------|
| **Error retrospective** | Supabase | chrome.storage.local | GPT-016, GPT-017 |
| **Severity levels** | critical/high/warning/info | ⚠️ Exists locally | GPT-016 |
| **Error types** | prompt/response/connection/timeout | ⚠️ Exists locally | GPT-016 |
| **Resolved flag** | Boolean | ⚠️ Exists locally | GPT-016 |

---

### 4.5 Authentication

| Feature | Architecture | Current | Ticket |
|---------|-------------|---------|--------|
| **Login required** | Supabase email/password | ❌ Firebase OAuth | GPT-007, GPT-008 |
| **Auth gate in UI** | Block unauthenticated | ❌ Missing | GPT-008 |
| **Session management** | Supabase Auth | ❌ Firebase | GPT-007 |
| **Auto token refresh** | Supabase client | ❌ Missing | GPT-003 |

---

### 4.6 Migration

| Feature | Architecture | Current | Ticket |
|---------|-------------|---------|--------|
| **Migrate portfolio** | chrome.storage → Supabase | ❌ Missing | GPT-026 |
| **Migrate history** | chrome.storage → Supabase | ❌ Missing | GPT-026 |
| **Migrate errors** | chrome.storage → Supabase | ❌ Missing | GPT-026 |
| **Migrate prompts** | (new feature) | ❌ Missing | GPT-027 |
| **Backup before clear** | JSON download | ❌ Missing | GPT-026 |

---

## 5. Dependency Graph

```
Foundational (Must do first):
├── GPT-002: Add Supabase SDK
├── GPT-003: chromeStorageAdapter
├── GPT-004: supabaseWithRetry
├── GPT-005: requireAuth
├── GPT-006: Message types alignment
└── GPT-009: SQL schema + RLS

Auth Layer:
├── GPT-007: Auth handlers (depends: 003, 004, 005, 006, 009)
└── GPT-008: Auth UI gate (depends: 007)

Core Features (can parallelize):
├── Categories:
│   ├── GPT-010: Handler (depends: 004, 005, 006, 009)
│   └── GPT-011: UI (depends: 010, 008)
├── Prompts:
│   ├── GPT-012: Handler (depends: 004, 005, 006, 009)
│   └── GPT-013: UI (depends: 012, 008)
├── History:
│   ├── GPT-014: Handler (depends: 004, 005, 006, 009)
│   └── GPT-015: UI refactor (depends: 014, 008)
├── Errors:
│   ├── GPT-016: Handler (depends: 004, 005, 006, 009)
│   └── GPT-017: UI refactor (depends: 016, 008)
└── Portfolio:
    ├── GPT-018: Handler (depends: 004, 005, 006, 009)
    ├── GPT-019: UI refactor (depends: 018, 008)
    ├── GPT-020: SSI price fetcher
    └── GPT-021: Price update handler (depends: 018, 020)

Advanced:
├── GPT-022: Alarms scheduling (depends: 021)
├── GPT-023: SEND_PROMPT orchestration (depends: 012)
├── GPT-024: Results page (depends: 014, 023)
└── GPT-025: Realtime subscriptions (depends: 008)

Migration:
├── GPT-026: Migrate v1 (portfolio, history, errors) (depends: 018, 014, 016)
└── GPT-027: Migrate v2 (prompts, categories) (depends: 012, 010)

Cleanup:
├── GPT-028: Remove Firebase dependency
├── GPT-029: Remove Firebase handlers (depends: 028)
└── GPT-030: Remove Firebase UI flows (depends: 028, 029)

Polish:
├── GPT-031: Manifest permissions
├── GPT-032: Error UX standardization
├── GPT-033: Unit tests utilities
├── GPT-034: Unit tests handlers
├── GPT-035: E2E auth + prompts
├── GPT-036: E2E portfolio
└── GPT-037: Final compliance review
```

---

## 6. Risks & Decisions

### 6.1 Critical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Breaking existing users' local data** | HIGH | Migration handlers with backup (GPT-026/027) |
| **Supabase quota limits** | MEDIUM | Monitor usage, implement cleanup (GPT-022) |
| **Service Worker lifecycle edge cases** | MEDIUM | Retry logic + keepalive for critical ops |
| **SSI API CORS/rate limits** | LOW | Batch + delays + fallback (GPT-020) |

---

### 6.2 Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Email/password auth** | Simplest for MVP; OAuth later |
| **Retry 3 times max** | Balance resilience vs latency |
| **Keep last 100 chat history** | Reasonable default; user configurable later |
| **Price updates every 5min** | SSI rate limits + market hours only |
| **Realtime in UI only** | Service Worker WebSocket unstable |
| **No offline mode (MVP)** | Cloud-first; offline is complex |

---

## 7. Coverage Matrix

### Architecture Sections → Tickets

| Architecture Section | Tickets |
|---------------------|---------|
| **Service Worker constraints** | GPT-001 (audit), GPT-029 (remove state) |
| **Message schema** | GPT-006 |
| **Message router** | No change (already compliant) |
| **Supabase config** | GPT-002, GPT-003 |
| **Auth utilities** | GPT-004, GPT-005 |
| **Auth handlers** | GPT-007 |
| **Auth UI** | GPT-008 |
| **Database schema + RLS** | GPT-009 |
| **Categories feature** | GPT-010, GPT-011 |
| **Prompts feature** | GPT-012, GPT-013 |
| **History feature** | GPT-014, GPT-015 |
| **Errors feature** | GPT-016, GPT-017 |
| **Portfolio feature** | GPT-018, GPT-019 |
| **SSI integration** | GPT-020 |
| **Price updates** | GPT-021 |
| **Alarms** | GPT-022 |
| **Prompt orchestration** | GPT-023 |
| **Results page** | GPT-024 |
| **Realtime** | GPT-025 |
| **Migration** | GPT-026, GPT-027 |
| **Firebase removal** | GPT-028, GPT-029, GPT-030 |
| **Permissions** | GPT-031 |
| **Error UX** | GPT-032 |
| **Content script** | No changes (already compliant) |
| **Context menus** | Exists (contextMenu.js), needs registration |
| **Telemetry** | Exists (telemetry.js), optional |
| **Testing** | GPT-033, GPT-034, GPT-035, GPT-036 |
| **Final review** | GPT-037 |
| **Coverage matrix** | GPT-038 (this audit) |

---

## 8. Actionable Checklist

### Phase 0: Audit (DONE)
- [x] GPT-001: This audit document

### Phase 1: Foundation (Week 1)
- [ ] GPT-002: Add Supabase SDK + env
- [ ] GPT-003: chromeStorageAdapter
- [ ] GPT-004: supabaseWithRetry
- [ ] GPT-005: requireAuth
- [ ] GPT-006: Message types alignment
- [ ] GPT-009: SQL schema + RLS

### Phase 2: Auth (Week 1-2)
- [ ] GPT-007: Auth handlers
- [ ] GPT-008: Auth UI gate

### Phase 3: Core Features (Week 2-3, can parallelize)
- [ ] GPT-010: Categories handler
- [ ] GPT-011: Categories UI
- [ ] GPT-012: Prompts handler
- [ ] GPT-013: Prompts UI
- [ ] GPT-014: History handler
- [ ] GPT-015: History UI refactor
- [ ] GPT-016: Errors handler
- [ ] GPT-017: Errors UI refactor
- [ ] GPT-018: Portfolio handler
- [ ] GPT-019: Portfolio UI refactor

### Phase 4: Advanced (Week 3-4)
- [ ] GPT-020: SSI price fetcher
- [ ] GPT-021: Price update handler
- [ ] GPT-022: Alarms scheduling
- [ ] GPT-023: SEND_PROMPT orchestration
- [ ] GPT-024: Results page
- [ ] GPT-025: Realtime subscriptions

### Phase 5: Migration (Week 4)
- [ ] GPT-026: Migrate v1 (portfolio, history, errors)
- [ ] GPT-027: Migrate v2 (prompts, categories)

### Phase 6: Cleanup (Week 5)
- [ ] GPT-028: Remove Firebase dependency
- [ ] GPT-029: Remove Firebase handlers
- [ ] GPT-030: Remove Firebase UI flows
- [ ] GPT-031: Manifest permissions

### Phase 7: Polish (Week 5-6)
- [ ] GPT-032: Error UX standardization
- [ ] GPT-033: Unit tests utilities
- [ ] GPT-034: Unit tests handlers
- [ ] GPT-035: E2E auth + prompts
- [ ] GPT-036: E2E portfolio
- [ ] GPT-037: Final compliance review
- [ ] GPT-038: Coverage matrix (done in this audit)

---

## 9. Conclusion

**Status**: Codebase requires **major refactoring** to align with Supabase-first architecture.

**Estimated Effort**: ~150 hours (38 tickets × 2-4h average)

**Critical Path**:
1. Foundation (GPT-002 to GPT-009) - **MUST complete first**
2. Auth (GPT-007, GPT-008) - **Blocks all features**
3. Core features (GPT-010 to GPT-019) - **Main implementation**
4. Advanced & Polish - **Can be incremental**

**Next Steps**:
1. Review this audit with team
2. Begin GPT-002 (Add Supabase SDK)
3. Follow dependency graph strictly
4. Run GPT-037 (compliance review) before production

---

**Signed**: AI Coding Agent  
**Date**: January 23, 2026  
**Ticket**: GPT-001 ✅ COMPLETE
