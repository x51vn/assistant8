# Storage Keys Migration Plan

**Related Tickets**: GPT-026, GPT-027  
**Source**: docs/GPT-001-AUDIT-REPORT.md section 2

---

## Executive Summary

Current codebase stores business data in `chrome.storage.local` which violates the architecture requirement of cloud-first storage. This document maps all current storage keys to their Supabase equivalents and defines the migration path.

**Key Principle**: After migration, `chrome.storage.local` will ONLY contain Supabase auth tokens, not business data.

---

## Current Storage Keys (Business Data - WILL BE REMOVED)

| Key | Type | Used In | Size Estimate | Target Supabase Table | Removal Ticket |
|-----|------|---------|---------------|----------------------|----------------|
| `portfolio` | Array | `portfolio.js` (handler + UI) | ~10-50 KB | `portfolio` | GPT-026 |
| `chatHistory` | Array | `history.js` (handler + UI) | ~100-500 KB | `chat_history` | GPT-026 |
| `errorList` | Array | `errors.js` (handler + UI) | ~10-50 KB | `errors` | GPT-026 |
| `stockEvalPrompt` | String | `portfolio.js`, `settings.js` | ~1-5 KB | `settings.config` (JSONB) | GPT-026 |
| `portfolioPromptKey` | String | `portfolio.js` (UI) | ~1-5 KB | `settings.config` (JSONB) | GPT-026 |
| Various settings | Mixed | `settings.js` | ~5-20 KB | `settings.config` (JSONB) | GPT-026 |

**Total Current Usage**: ~130-630 KB business data in chrome.storage.local

---

## Target Storage Keys (After Migration)

| Key | Purpose | Managed By | Expected Size | Persistence |
|-----|---------|------------|---------------|-------------|
| `sb-{project}-auth-token` | Supabase session token | Supabase SDK (via chromeStorageAdapter) | ~1-2 KB | Until logout |
| `sb-{project}-auth-token-code-verifier` | Supabase PKCE verifier | Supabase SDK | ~100 bytes | Temporary |
| `migration_completed` | One-time migration flag (optional) | Migration handler | ~10 bytes | Permanent |

**Total Target Usage**: ~1-2 KB (auth only)

---

## Storage Key Mapping Detail

### 1. Portfolio Data

**Current Key**: `portfolio`

**Current Structure**:
```javascript
{
  portfolio: [
    {
      code: 'VNM',
      quantity: 100,
      entryPrice: 85000,
      note: 'Long-term hold',
      addedAt: 1234567890
    },
    // ... more items
  ]
}
```

**Target**: Supabase `portfolio` table
```sql
CREATE TABLE portfolio (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  avg_price DECIMAL(15,2),
  current_price DECIMAL(15,2),
  updated_at TIMESTAMPTZ
);
```

**Migration Flow**: GPT-026
- Read `chrome.storage.local.get(['portfolio'])`
- Transform: `code` → `symbol`, `entryPrice` → `avg_price`
- Bulk insert to Supabase with user_id
- Clear key after successful insert

---

### 2. Chat History

**Current Key**: `chatHistory`

**Current Structure**:
```javascript
{
  chatHistory: [
    {
      chatId: 'c123',
      chatUrl: 'https://chatgpt.com/c/123',
      prompt: 'Debug this code...',
      response: 'Here is the fix...',
      timestamp: 1234567890,
      runId: 'r456'
    },
    // ... more items
  ]
}
```

**Target**: Supabase `chat_history` table
```sql
CREATE TABLE chat_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  chat_id TEXT NOT NULL,
  chat_url TEXT,
  prompt TEXT NOT NULL,
  response TEXT,
  prompt_id UUID REFERENCES prompts(id),
  timestamp BIGINT NOT NULL,
  run_id TEXT
);
```

**Migration Flow**: GPT-026
- Read `chrome.storage.local.get(['chatHistory'])`
- No transformation needed (keys match)
- Bulk insert with user_id
- Clear key after insert

---

### 3. Error Tracking

**Current Key**: `errorList`

**Current Structure**:
```javascript
{
  errorList: [
    {
      title: 'ChatGPT Timeout',
      description: 'Failed to get response...',
      severity: 'high',
      type: 'timeout',
      timestamp: 1234567890,
      resolved: false
    },
    // ... more items
  ]
}
```

**Target**: Supabase `errors` table
```sql
CREATE TABLE errors (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  type TEXT,
  timestamp BIGINT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE
);
```

**Migration Flow**: GPT-026
- Read `chrome.storage.local.get(['errorList'])`
- No transformation needed
- Bulk insert with user_id
- Clear key after insert

---

### 4. Settings & Prompts

**Current Keys**: `stockEvalPrompt`, `portfolioPromptKey`, and various settings

**Current Structure**: Scattered across multiple keys

**Target**: Supabase `settings` table with JSONB config
```sql
CREATE TABLE settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  config JSONB NOT NULL DEFAULT '{}'
);
```

**Migration Flow**: GPT-026
- Read all settings keys: `chrome.storage.local.get(['stockEvalPrompt', 'portfolioPromptKey', ...])`
- Merge into single JSONB object
- Upsert to `settings.config` with user_id
- Clear all settings keys after insert

**Example Merged Config**:
```json
{
  "stockEvalPrompt": "...",
  "portfolioPromptKey": "...",
  "otherSettings": "..."
}
```

---

## Migration Flow (High-Level)

### Phase 1: Pre-Migration (GPT-002 to GPT-009)
1. ✅ Supabase SDK installed
2. ✅ SQL schema + RLS created
3. ✅ Auth handlers implemented
4. ✅ User logged in

### Phase 2: Migration Execution (GPT-026)

```javascript
// Pseudo-code for GPT-026 handler
registerHandler(MESSAGE_TYPES.MIGRATE_LOCAL_TO_SUPABASE, async (message) => {
  const userId = await requireAuth(message);
  
  // 1. Read all old data
  const oldData = await chrome.storage.local.get([
    'portfolio',
    'chatHistory',
    'errorList',
    'stockEvalPrompt',
    'portfolioPromptKey',
    // ... all settings keys
  ]);
  
  // 2. Transform and insert to Supabase (with retry)
  await supabaseWithRetry(async () => {
    // Portfolio
    if (oldData.portfolio) {
      await supabase.from('portfolio').insert(
        oldData.portfolio.map(item => ({
          user_id: userId,
          symbol: item.code,
          quantity: item.quantity,
          avg_price: item.entryPrice,
        }))
      );
    }
    
    // Chat History
    if (oldData.chatHistory) {
      await supabase.from('chat_history').insert(
        oldData.chatHistory.map(item => ({
          user_id: userId,
          ...item
        }))
      );
    }
    
    // Errors
    if (oldData.errorList) {
      await supabase.from('errors').insert(
        oldData.errorList.map(item => ({
          user_id: userId,
          ...item
        }))
      );
    }
    
    // Settings (merge all)
    const settingsConfig = {
      stockEvalPrompt: oldData.stockEvalPrompt,
      portfolioPromptKey: oldData.portfolioPromptKey,
      // ... collect all settings
    };
    await supabase.from('settings').upsert({
      user_id: userId,
      config: settingsConfig
    });
  });
  
  // 3. Backup to JSON file
  const backup = JSON.stringify(oldData, null, 2);
  const blob = new Blob([backup], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: `chatgpt-assistant-backup-${Date.now()}.json`,
    saveAs: true
  });
  
  // 4. Clear old keys
  await chrome.storage.local.remove([
    'portfolio',
    'chatHistory',
    'errorList',
    'stockEvalPrompt',
    'portfolioPromptKey',
    // ... all business keys
  ]);
  
  // 5. Set migration flag
  await chrome.storage.local.set({ migration_completed: true });
  
  return createResponse(message, MESSAGE_TYPES.MIGRATION_COMPLETE, {
    migrated: {
      portfolio: oldData.portfolio?.length || 0,
      chatHistory: oldData.chatHistory?.length || 0,
      errors: oldData.errorList?.length || 0
    }
  });
});
```

### Phase 3: Post-Migration
- All business data in Supabase
- `chrome.storage.local` only has auth token + migration flag
- Handlers fetch from Supabase via `supabaseWithRetry()`
- UI calls background middleware (never Supabase directly)

---

## Migration Safety Checks

### Pre-Migration Validation
- [x] User authenticated (has valid Supabase session)
- [x] Supabase tables exist (schema created via GPT-009)
- [x] RLS policies active
- [x] Backup destination writable

### During Migration
- [x] Transaction-like behavior (all-or-nothing)
- [x] Retry transient errors (network, Supabase 5xx)
- [x] Don't retry client errors (4xx)
- [x] Log progress for debugging

### Post-Migration
- [x] Verify data in Supabase (sample queries)
- [x] Backup file downloaded successfully
- [x] Old keys cleared from chrome.storage.local
- [x] migration_completed flag set

### Rollback Plan
If migration fails:
1. Old data remains in chrome.storage.local (not cleared)
2. User can retry migration
3. Backup file provides manual recovery option

---

## Detection & Triggering

### Auto-Detection on Startup

```javascript
// src/background/index.js
chrome.runtime.onStartup.addListener(async () => {
  const hasOldData = await chrome.storage.local.get([
    'portfolio',
    'chatHistory',
    'errorList'
  ]);
  
  const hasMigrated = await chrome.storage.local.get(['migration_completed']);
  
  if ((hasOldData.portfolio || hasOldData.chatHistory) && !hasMigrated.migration_completed) {
    // Show migration prompt in UI
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.MIGRATION_AVAILABLE,
      data: {
        itemCount: (hasOldData.portfolio?.length || 0) + 
                   (hasOldData.chatHistory?.length || 0) +
                   (hasOldData.errorList?.length || 0)
      }
    });
  }
});
```

### Manual Trigger
Settings page button: "Chuyển dữ liệu sang cloud" (visible if old data detected)

---

## Timeline

| Phase | Duration | Tickets |
|-------|----------|---------|
| Foundation | Week 1 | GPT-002 to GPT-009 |
| Core Features | Week 2-3 | GPT-010 to GPT-019 |
| **Migration** | **Week 4** | **GPT-026, GPT-027** |
| Cleanup | Week 5 | GPT-028 to GPT-031 |

---

## Testing Checklist

- [ ] Create test data in chrome.storage.local
- [ ] Run migration handler
- [ ] Verify all data in Supabase
- [ ] Verify backup file downloaded
- [ ] Verify chrome.storage.local cleared (except auth token)
- [ ] Test handlers fetch from Supabase (not local)
- [ ] Test new data writes to Supabase only

---

## Related Documents

- [GPT-001 Audit Report](../GPT-001-AUDIT-REPORT.md)
- [Architecture](../ARCHITECTURE.md)
- [Storage Explained](../STORAGE_EXPLAINED.md)
- [GPT-026 Ticket](../tickets/GPT-026 Migration v1.md)
- [GPT-027 Ticket](../tickets/GPT-027 Migration v2.md)

---

**Status**: Planning Complete  
**Last Updated**: January 23, 2026  
**Maintainer**: AI Coding Team
