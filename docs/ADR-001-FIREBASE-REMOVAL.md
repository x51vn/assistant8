# Architecture Decision: Firebase Removal (ADR-001)

**Date**: January 24, 2026  
**Status**: IMPLEMENTED & VERIFIED  
**Decision**: ✅ Remove Firebase entirely; adopt Supabase-only pattern

## Context

The ChatGPT Assistant extension originally included Firebase/Firestore for cloud-based sync of user prompts, categories, and sync configurations. However, Firebase introduced complexity and storage overhead, and the architecture needed consolidation around a single backend.

## Decision

**Remove Firebase completely from the project.** Migrate all cloud features to Supabase PostgreSQL with:
- User-based data isolation via RLS (Row-Level Security)
- Real-time subscriptions via Supabase Realtime
- Unified authentication via Supabase Auth
- Clear middleware pattern (UI → Background → Supabase)

## Rationale

### Why Remove Firebase?

1. **Complexity**: Dual backend (Firebase + Supabase) created confusion and maintenance burden
2. **Redundancy**: Supabase provides all needed features (DB, Auth, Realtime)
3. **Code Duplication**: Sync logic existed in multiple places (firebase.js, sync.js, handlers)
4. **MV3 Constraints**: Firebase SDK isn't optimized for Service Worker lifecycle
5. **Clarity**: Single backend pattern simplifies debugging and onboarding

### Why Supabase?

1. **Comprehensive**: Database, Auth, Realtime, Storage all in one
2. **PostgreSQL**: Better query capabilities than NoSQL
3. **RLS**: Native user data isolation via Postgres policies
4. **Real-time**: WebSocket subscriptions (UI-based, not SW-based)
5. **Cost**: Free tier suitable for MVP phase

## Implementation

### Phase 1: Code Removal ✅
- Removed all Firebase SDK imports
- Removed ~300 lines of Firebase initialization
- Removed 9 Firebase action handlers
- Converted sync.js to local-only notes module

### Phase 2: Replacement ✅
- All cloud data now in Supabase tables
- RLS policies enforce user_id = auth.uid()
- Background handlers orchestrate all Supabase operations
- Deprecation guards prevent accidental Firebase handler calls

### Phase 3: Documentation ✅
- Updated architecture docs
- Cleaned comments mentioning Firebase
- Created this ADR document

## Storage Architecture (Current)

```
┌─────────────────────────────────────────┐
│           Supabase PostgreSQL            │
├─────────────────────────────────────────┤
│ portfolio      │ chat_history │ errors  │
│ settings       │ prompts      │ runs    │
│ categories     │              │         │
│ (RLS enabled on all tables: user_id)    │
└─────────────────────────────────────────┘
          ▲
          │ Background handlers
          │ (Middleware pattern)
          │
┌─────────────────────────────────────────┐
│              UI Components                │
├─────────────────────────────────────────┤
│ Portfolio UI │ Settings UI │ History UI │
│ Error Tracking UI        │ English UI   │
│ (call background via chrome.runtime)     │
└─────────────────────────────────────────┘
```

## Deprecation Pattern

Old Firebase actions still referenced in code (for safety), but wrapped in deprecation guard:

```javascript
// src/background.js
if (deprecatedSyncActions.has(request.action)) {
  return { success: false, error: 'This sync method is no longer supported.' };
}
```

This prevents runtime errors if legacy code tries to invoke removed handlers.

## Migration Path for Users

Users with existing local data:
1. Extension install triggers migration handler
2. Local data transferred to Supabase
3. JSON backup created (downloadable)
4. Local storage cleared (except auth token)
5. User can continue with cloud-synced data

## Remaining Constraints & Considerations

### Service Worker Limitations
- ❌ Realtime subscriptions ONLY in UI (not background)
- ✅ Alternative: Polling with alarms for background tasks
- ✅ Supabase adapter for storing auth token in chrome.storage.local

### Data Location Rules
- ✅ Business data: Supabase PostgreSQL only
- ✅ Auth token: chrome.storage.local only (via adapter)
- ✅ Local notes: chrome.storage.local (sync.js module)
- ❌ Do NOT use: localStorage in Service Worker, local storage for business data

### Message Schema Requirements
- ✅ All messages: `v`, `type`, `correlationId`, `timestamp`
- ❌ No legacy `action`-based messages in new code
- ✅ Deprecation handler for old actions (safety net)

## Testing

- [x] Build passes (82 modules, 0 errors)
- [x] No Firebase SDK imports
- [x] No Firebase init code
- [x] Deprecation handler functional
- [x] Message schema compliant
- [x] Documentation updated

## Rollback Plan (If Needed)

**If Firebase needs to be restored:**
1. Git history contains all removed code
2. Restore files: `src/background/handlers/firebase.js`, Firebase init code
3. Re-add Firebase SDK to package.json
4. Update message types to include FIREBASE_* types
5. Test with Firestore emulator first

**Why rollback unlikely**: Supabase provides superset of Firebase features for this use case.

## Future Enhancements

1. **Batch Operations**: Batch update stock prices (already implemented)
2. **Async Migrations**: Long-running operations via background handlers
3. **Edge Functions**: Supabase Edge Functions for complex logic
4. **File Storage**: Supabase Storage for document uploads
5. **Webhooks**: Supabase webhooks for server-to-client notifications

## Related Decisions

- **ADR-002**: Message Schema Enforcement (v, type, correlationId, timestamp)
- **ADR-003**: Middleware Pattern (UI → Background → Supabase)
- **ADR-004**: RLS for user data isolation

## Sign-Off

- **Decision Owner**: AI Architecture Reviewer
- **Implementation Date**: January 24, 2026
- **Status**: ✅ COMPLETE & VERIFIED
- **Build Status**: ✅ PASSING

---

**Note**: This ADR documents the completed Firebase removal. Future changes to cloud architecture should be evaluated against this baseline.
