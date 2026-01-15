# Firestore Sync Size Limit Fix - Documentation

## Problem
Firestore has a 1 MB document size limit. The backup was failing because the user's local data exceeded this limit:
- Error: `Document size (1,094,398 bytes) exceeds the maximum allowed size of 1,048,576 bytes`
- Root cause: `chatHistory`, `errorList`, and `runs` arrays grew unbounded

## Solution: Data Splitting Architecture

### New Backup Structure

Instead of storing all data in a single document, we now split data into:

```
users/{uid}/
  ├── backups/latest          → Metadata only (small, frequently accessed)
  │   └── data: {
  │       portfolio,
  │       portfolioPrompt,
  │       prompt,
  │       autoRun,
  │       interval,
  │       settings,
  │       promptTemplates,
  │       notes,
  │       teaStockPrompt,
  │       stockEvalPrompt
  │     }
  ├── config/latestBackup     → Backup reference metadata
  └── data/
      ├── chatHistory         → {items: [...], count, size, syncedAt}
      ├── errorList           → {items: [...], count, size, syncedAt}
      └── runs                → {items: [...], count, size, syncedAt}
```

### Key Features

1. **Automatic Data Limits**
   - chatHistory: Keep last 50 items
   - errorList: Keep last 30 items  
   - runs: Keep last 30 items

2. **Automatic Cleanup**
   - Runs on sync if metadata approaches 1MB
   - Trims old items automatically
   - User doesn't need to take action

3. **Metadata Size**
   - Typical metadata backup: ~50-200 KB (well under 1 MB limit)
   - Large data stored separately: Each < 500 KB typically

4. **Backward Compatibility**
   - Old backup format still readable
   - Automatic migration on next sync

## Implementation Details

### Sync Process
```javascript
// 1. Write metadata to backups/latest (< 500 KB)
// 2. Write chatHistory to data/chatHistory (with limit of 50)
// 3. Write errorList to data/errorList (with limit of 30)
// 4. Write runs to data/runs (with limit of 30)
// 5. Update config/latestBackup with reference
```

### Cleanup Strategy
```javascript
// If metadata backup exceeds 1,000,000 bytes:
// 1. Trim chatHistory to last 30 items
// 2. Trim errorList to last 25 items
// 3. Trim runs to last 20 items
// 4. Retry sync
```

## Firestore Rules Update

New rules allow writing to `data/` subcollection:

```firestore-rules
match /data/{dataType} {
  allow read: if isOwner(uid);
  allow create: if isOwner(uid) && request.resource.data.size() > 0;
  allow update: if isOwner(uid) && request.resource.data.size() > 0;
  allow delete: if isOwner(uid);
}
```

## Testing the Fix

### Before Deploying

1. **Backup Current Rules**
   ```bash
   firebase rules:read --project myfcx51 > firestore.rules.backup
   ```

2. **Deploy Updated Rules**
   ```bash
   firebase deploy --only firestore:rules --project myfcx51
   ```

3. **Test Sync**
   - Open extension
   - Click "Đồng bộ ngay" (Sync Now)
   - Check browser console: `[Background Firebase]` logs should show success
   - Check Firestore Console:
     - `users/{uid}/backups/latest` should exist
     - `users/{uid}/data/chatHistory` should exist  
     - `users/{uid}/data/errorList` should exist
     - `users/{uid}/data/runs` should exist

### Monitoring

Check logs for:
- ✅ "Metadata backup size: X bytes (limit: 1,048,576)"
- ✅ "Syncing chatHistory: {count: X, size: Y bytes}"
- ✅ "Syncing errorList: {count: X, size: Y bytes}"
- ✅ "Syncing runs: {count: X, size: Y bytes}"
- ✅ "Sync completed successfully"

Or errors like:
- ❌ "WARNING: Metadata backup approaching size limit!"
- ❌ "Cleanup error:" (optional cleanup failed)

## Migration Notes

- **Existing users**: Old format still works, will migrate automatically on next sync
- **New data**: Uses new split format immediately
- **No action required**: Automatic and transparent to users

## Future Improvements

1. **Pagination**: If lists grow beyond limits, implement pagination
2. **Archival**: Old items → separate archive collection
3. **Compression**: Compress large arrays before storing
4. **Selective Sync**: Allow users to choose what to backup

## Rollback Plan

If issues occur:

1. **Revert Rules**
   ```bash
   firebase rules:rollback --project myfcx51
   ```

2. **Old Sync Still Works**
   - Users on old version can still sync metadata
   - Data in new format will be preserved

## Related Files

- `src/background.js` - Lines 106-255 (syncToFirebaseHandler, cleanupOldData, syncLargeDataToFirebase)
- `firestore.rules` - Lines 42-49 (data subcollection rules)
- `src/constants.js` - STORAGE_KEYS, LIMITS definitions
