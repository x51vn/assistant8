# Storage Strategy Explanation - ChatGPT Assistant

> **Critical Clarification về Local Storage**

---

## 🚨 **QUAN TRỌNG: 2 LOẠI "LOCAL STORAGE" KHÁC NHAU**

### 1️⃣ **`localStorage` (Browser DOM API)**

```javascript
// ❌ KHÔNG HOẠT ĐỘNG trong Service Worker
localStorage.setItem('key', 'value'); 
// Error: ReferenceError: localStorage is not defined
```

**Đặc điểm**:
- ❌ **KHÔNG** available trong Service Worker (no DOM)
- ✅ Available trong UI/Content Script (có window object)
- Quota: ~5-10 MB
- Synchronous API
- Part of Web Storage API

**Trong project này**: ❌ **KHÔNG DÙNG**

---

### 2️⃣ **`chrome.storage.local` (Chrome Extension API)**

```javascript
// ✅ HOẠT ĐỘNG trong Service Worker
await chrome.storage.local.set({ key: 'value' });
const data = await chrome.storage.local.get(['key']);
```

**Đặc điểm**:
- ✅ **CÓ** trong Service Worker
- ✅ **CÓ** trong UI/Content Script  
- Quota: ~10 MB (QUOTA_BYTES)
- Asynchronous API (Promise-based)
- Part of Chrome Extension API

**Trong project này**: ✅ **CHỈ DÙNG CHO**:
1. **Supabase auth token persistence** (qua `chromeStorageAdapter`)
2. **Migration detection** (check old data để migrate sang Supabase)

---

## 📊 **SO SÁNH CHI TIẾT**

| Feature | `localStorage` | `chrome.storage.local` |
|---------|---------------|----------------------|
| **API Type** | Browser (DOM) | Chrome Extension |
| **Service Worker** | ❌ NO | ✅ YES |
| **UI/Content Script** | ✅ YES | ✅ YES |
| **Syntax** | `localStorage.key` | `chrome.storage.local.get/set()` |
| **Async** | ❌ Sync only | ✅ Promise-based |
| **Quota** | ~5-10 MB | ~10 MB |
| **Persist after uninstall** | ✅ YES | ❌ NO (cleared) |
| **Cross-extension** | ❌ NO | ❌ NO (isolated) |

---

## 🏗️ **KIẾN TRÚC STORAGE TRONG PROJECT**

### ✅ **What We DO Use**

#### 1. **Supabase PostgreSQL** (Primary Storage)
**Use Cases**: TẤT CẢ business data
- ✅ User prompts
- ✅ Categories/Tags
- ✅ Chat history
- ✅ Portfolio
- ✅ Errors
- ✅ Settings
- ✅ Runs

**Why**: 
- Cloud-first
- User-based (multi-device sync)
- RLS security
- Unlimited storage (within plan)
- Realtime subscriptions

#### 2. **chrome.storage.local** (Auth Token Only)
**Use Cases**: 
- ✅ Supabase session token (via `chromeStorageAdapter`)
- ✅ Migration flag (one-time check)

**Why**:
- Service Worker needs persistent auth state
- Supabase requires storage adapter
- Small data (~1 KB token)

**Code**:
```javascript
// src/supabaseConfig.js
const chromeStorageAdapter = {
  getItem: async (key) => {
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  },
  setItem: async (key, value) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key) => {
    await chrome.storage.local.remove([key]);
  }
};

export const supabase = createClient(url, key, {
  auth: {
    storage: chromeStorageAdapter, // ← Uses chrome.storage.local
    autoRefreshToken: true,
    persistSession: true
  }
});
```

---

### ❌ **What We DON'T Use**

#### ❌ `localStorage` (Browser API)
**Reason**: Không hoạt động trong Service Worker

#### ❌ `chrome.storage.local` for Business Data
**Reason**: 
- 10 MB quota quá nhỏ
- Không có user-based separation
- Không có cross-device sync
- Không có query capabilities

---

## 🔄 **DATA FLOW**

### **Normal Operation** (After Login)

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ Adds prompt
       │
┌──────▼──────────────────────────────────┐
│   UI (Side Panel)                       │
│   src/ui/prompts.js                     │
└──────┬──────────────────────────────────┘
       │ chrome.runtime.sendMessage
       │ { type: PROMPT_ADD, data: {...} }
       │
┌──────▼──────────────────────────────────┐
│   Background Service Worker             │
│   src/background/handlers/prompts.js    │
│                                         │
│   registerHandler(PROMPT_ADD, ...)     │
└──────┬──────────────────────────────────┘
       │ await supabase.from('prompts').insert(...)
       │ Auth token từ chrome.storage.local
       │
┌──────▼──────────────────────────────────┐
│   Supabase PostgreSQL                   │
│   Table: prompts                        │
│   RLS: WHERE user_id = auth.uid()       │
└─────────────────────────────────────────┘
```

**Key Points**:
1. UI → Background (message)
2. Background → Supabase (authenticated request)
3. Auth token loaded từ `chrome.storage.local` (transparent)
4. Data saved to cloud, NOT local

---

### **First-Time Setup** (Migration)

```
┌─────────────────────────────────────────┐
│   OLD: chrome.storage.local             │
│   {                                     │
│     prompts: [...],  // ← Old data      │
│     portfolio: [...],                   │
│     chatHistory: [...]                  │
│   }                                     │
└──────┬──────────────────────────────────┘
       │ Detect on startup
       │
┌──────▼──────────────────────────────────┐
│   Migration Handler                     │
│   MIGRATE_LOCAL_TO_SUPABASE             │
└──────┬──────────────────────────────────┘
       │ Read old data
       │ Insert to Supabase (batch)
       │ Backup to JSON file
       │ Clear chrome.storage.local
       │
┌──────▼──────────────────────────────────┐
│   Supabase PostgreSQL                   │
│   All data migrated ✅                   │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│   chrome.storage.local                  │
│   {                                     │
│     // EMPTY (except auth token)        │
│     'sb-xxx-auth-token': '...'          │
│   }                                     │
└─────────────────────────────────────────┘
```

---

## 🎯 **TÓM TẮT**

### **chrome.storage.local CHỈ chứa**:
```javascript
{
  // Auth token (managed by Supabase)
  'sb-abcdefgh-auth-token': 'eyJhbGciOiJIUzI1...',
  'sb-abcdefgh-auth-token-code-verifier': 'xyz...',
  
  // Migration flag (one-time)
  'migration_completed': true
}
```

### **Supabase PostgreSQL chứa**:
```javascript
{
  prompts: [
    { id: 'uuid1', user_id: 'user1', title: 'Debug prompt', ... },
    { id: 'uuid2', user_id: 'user1', title: 'Code review', ... }
  ],
  categories: [
    { id: 'uuid3', user_id: 'user1', name: 'Work', color: '#ff0000' }
  ],
  chat_history: [
    { id: 'uuid4', user_id: 'user1', chat_id: 'c123', prompt: '...' }
  ],
  portfolio: [...],
  errors: [...],
  settings: {...}
}
```

---

## 🔒 **SECURITY**

### **chrome.storage.local**:
- ⚠️ Không encrypted
- ⚠️ Accessible by extension code only
- ⚠️ Cleared on extension uninstall
- ✅ Chỉ chứa session token (có expiry)

### **Supabase**:
- ✅ HTTPS encrypted in transit
- ✅ Encrypted at rest
- ✅ Row Level Security (RLS)
- ✅ User chỉ access own data
- ✅ JWT token-based auth

---

## 📚 **REFERENCES**

- [Chrome Extension Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Web Storage API (localStorage)](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [Supabase Auth Persistence](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Service Worker Limitations](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

---

**Conclusion**: Chúng ta KHÔNG lưu business data locally. `chrome.storage.local` CHỈ là adapter cho Supabase auth token trong Service Worker context. Tất cả user data ở cloud.
