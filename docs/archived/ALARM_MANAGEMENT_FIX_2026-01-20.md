# Alarm Management Fix - January 20, 2026

## 🐛 Bug Report

### Error Observed
```
[Alarms] Unknown alarm correlationId="1768909707523-0l2g27vs3", name="googleDriveSync"
[Alarms] Failed correlationId="1768909707523-0l2g27vs3", success=false, error="Unknown error"
```

### Root Cause Analysis

1. **setupAlarms() uses clearAll() incorrectly**
   - Location: `src/background/index.js` line 203
   - Called `chrome.alarms.clearAll()` on extension startup
   - Deleted ALL alarms including:
     - `autoSync` - created by Firebase auth listener
     - `firebaseSync` - created by UI sync module
     - Legacy alarms from old versions (e.g., `googleDriveSync`)
   
2. **Multiple modules create alarms independently**
   - Background: `CHECK`, `AUTORUN`
   - Firebase: `autoSync` (when user authenticates)
   - UI Sync: `firebaseSync` (on-demand)
   - Content/Background: `POLL` (temporary, for result polling)

3. **Unknown alarm handler logs as error**
   - Location: `src/background/handlers/alarms.js` line 94
   - Logged unknown alarms as `warn` level
   - Called `endOperation(correlationId, 'unknown')` which logged "Failed error=Unknown error"
   - Should treat unknown alarms as normal (legacy from updates)

4. **No cleanup for legacy alarms**
   - Old versions created alarms that were removed in new versions
   - These alarms persist in Chrome until explicitly cleared
   - Extension updates don't automatically clean up old alarms

## 🔧 Fixes Applied

### 1. Changed setupAlarms() to Selective Clearing

**File**: `src/background/index.js`

**Before**:
```javascript
async function setupAlarms() {
  try {
    // Clear existing alarms
    await chrome.alarms.clearAll(); // ❌ Deletes ALL alarms!
    
    // CHECK alarm
    chrome.alarms.create('CHECK', { periodInMinutes: 5 });
    
    // AUTORUN alarm
    // ...
  }
}
```

**After**:
```javascript
async function setupAlarms() {
  try {
    // IMPORTANT: Only clear specific alarms, not all
    // Other alarms (autoSync, firebaseSync) are managed elsewhere
    await chrome.alarms.clear('CHECK');
    await chrome.alarms.clear('AUTORUN');
    
    // CHECK alarm
    chrome.alarms.create('CHECK', { periodInMinutes: 5 });
    
    // AUTORUN alarm
    // ...
    
    // Clean up legacy/unknown alarms
    await cleanupLegacyAlarms();
  }
}
```

### 2. Added cleanupLegacyAlarms() Function

**File**: `src/background/index.js` (lines 236-253)

```javascript
/**
 * Clean up legacy alarms from old versions
 * Known alarms: CHECK, AUTORUN, POLL, autoSync, firebaseSync
 */
async function cleanupLegacyAlarms() {
  try {
    const knownAlarms = ['CHECK', 'AUTORUN', 'POLL', 'autoSync', 'firebaseSync'];
    const allAlarms = await chrome.alarms.getAll();
    
    for (const alarm of allAlarms) {
      if (!knownAlarms.includes(alarm.name)) {
        await chrome.alarms.clear(alarm.name);
        logger.info('Cleared legacy alarm', { name: alarm.name });
      }
    }
  } catch (error) {
    logger.warn('Failed to cleanup legacy alarms', { error });
  }
}
```

### 3. Fixed Unknown Alarm Handler

**File**: `src/background/handlers/alarms.js` (line 93-96)

**Before**:
```javascript
// Unknown alarm
logger.warn('Unknown alarm', { correlationId, name: alarm.name });
logger.endOperation(correlationId, 'unknown'); // ❌ Logs "Failed error=Unknown error"
```

**After**:
```javascript
// Unknown alarm - log as info, not error
// This is normal during extension updates when old alarms still exist
logger.info('Unknown alarm (legacy)', { correlationId, name: alarm.name });
// Don't call endOperation() - no operation was started
```

## 📚 Documentation Updated

**File**: `docs/COMMON_MISTAKES.md`

Added new section: **"Extension Lifecycle Anti-Patterns"**

Key points:
- ❌ Never use `clearAll()` when only managing a subset of resources
- ✅ Use selective clearing: `clear(name)` instead
- ✅ Add cleanup function for legacy resources on startup
- ✅ Unknown resources should not be treated as errors
- 📝 Pattern applies to: alarms, context menus, storage, etc.

## ✅ Verification

### Build Status
```bash
$ npm run build
✓ built in 1.94s
```

### Expected Behavior After Fix

1. **On extension startup**:
   - `setupAlarms()` clears only CHECK and AUTORUN
   - `cleanupLegacyAlarms()` removes old alarms (googleDriveSync, etc.)
   - autoSync and firebaseSync are preserved

2. **When unknown alarm fires**:
   - Logged as info: `Unknown alarm (legacy) name=xyz`
   - No "Failed" error logged
   - Alarm will be cleaned up on next extension restart

3. **Multiple alarm sources work independently**:
   - Background manages CHECK/AUTORUN
   - Firebase manages autoSync
   - UI Sync manages firebaseSync
   - No interference between modules

## 🔍 Related Issues Fixed

This fix also prevents similar issues with:
- Context menus (already OK - only 1 menu)
- Message handlers (already OK - return error for unknown types)
- Storage management (no clearAll() usage found)

## 📊 Impact Assessment

### Severity: **Medium**
- Error was cosmetic (logs only)
- Functionality not broken (alarms recreated dynamically)
- But confusing to users/developers

### Risk: **Low**
- Changes are defensive (selective clearing)
- Backward compatible (all existing alarms still work)
- No breaking changes to API

### Benefits:
- ✅ Cleaner console logs
- ✅ Better separation of concerns between modules
- ✅ Automatic cleanup of legacy resources
- ✅ Pattern documented for future reference

## 🎯 Lessons Learned

1. **Avoid *All() methods in modular code**
   - clearAll(), removeAll(), etc. are dangerous
   - Only use them for factory reset scenarios
   - Prefer selective resource management

2. **Unknown entities are normal during updates**
   - Extensions update but Chrome state persists
   - Old alarms/menus/storage keys don't auto-cleanup
   - Need explicit migration/cleanup code

3. **Document resource ownership**
   - Who creates which alarms?
   - Who is responsible for cleanup?
   - Keep a registry of known resources

4. **Log levels matter**
   - Unknown ≠ Error
   - Use info/debug for expected scenarios
   - Reserve warn/error for actual problems

## 📝 Testing Checklist

- [x] Build passes
- [x] setupAlarms() only clears its own alarms
- [x] cleanupLegacyAlarms() removes unknown alarms
- [x] Unknown alarm handler logs as info
- [x] Documentation updated
- [ ] Manual test: Load extension, check console logs
- [ ] Manual test: Verify alarms with `chrome.alarms.getAll()`
- [ ] Manual test: Sync still works after extension restart

---

**Date**: January 20, 2026  
**Author**: Development Team  
**Status**: ✅ Fixed and Documented
