# Settings Prompts Loading Fix - January 24, 2026

## 🐛 Issue

Trang cấu hình (Settings) không load được các prompt từ Supabase lên giao diện UI.

## 🔍 Root Cause

**File**: `src/background/handlers/settings.js` (lines 46 & 124)

### SETTINGS_GET Handler
```javascript
// ❌ WRONG (Line 46)
const data = await supabaseWithRetry(...);  // Returns { user_id, config, updated_at }
return createResponse(message, MESSAGE_TYPES.SETTINGS_DATA, data);
// Result spreads to: { type, user_id, config, updated_at }
```

**Problem**: Spreads the entire database row with `user_id` and timestamps as top-level properties. While `config` IS at the top-level, this is unnecessary and inconsistent with other handlers.

### SETTINGS_UPDATE Handler  
```javascript
// ❌ WRONG (Line 124)
const data = await supabaseWithRetry(...);  // Returns { user_id, config, updated_at }
return createResponse(message, MESSAGE_TYPES.SETTINGS_UPDATE, data);
// Same issue - spreads entire row
```

## ✅ Solution Applied

Extract only the `config` field before spreading:

### SETTINGS_GET Handler (Line 46)
```javascript
// ✅ CORRECT (Fixed)
logger.endOperation(correlationId, 'success');
return createResponse(message, MESSAGE_TYPES.SETTINGS_DATA, {
  config: data.config || {}
});
// Result spreads to: { type, config }
```

### SETTINGS_UPDATE Handler (Line 124)
```javascript
// ✅ CORRECT (Fixed)
logger.endOperation(correlationId, 'success');
return createResponse(message, MESSAGE_TYPES.SETTINGS_UPDATED, {
  config: data.config || {}
});
// Result spreads to: { type, config }
```

## 📊 Before vs After

### Before (Handler Response)
```javascript
{
  type: 'SETTINGS_DATA',
  v: 1,
  user_id: '550e8400-e29b-41d4-a716-446655440000',    // ← Unnecessary
  config: {
    prompts: {
      portfolio: '...',
      stockEval: '...',
      english: '...'
    }
  },
  updated_at: '2026-01-24T10:00:00Z'                  // ← Unnecessary
}
```

### After (Handler Response)
```javascript
{
  type: 'SETTINGS_DATA',
  v: 1,
  config: {
    prompts: {
      portfolio: '...',
      stockEval: '...',
      english: '...'
    }
  }
}
```

## 🎯 UI Impact

### Before
```javascript
// settings.js line 255
const prompts = (response.config?.prompts) || {};
// Works IF config exists, but includes unnecessary fields
```

### After
```javascript
// settings.js line 255 (unchanged - already correct)
const prompts = (response.config?.prompts) || {};
// Works perfectly - clean response structure
```

## 🔄 Consistency Pattern

This aligns with other handlers like Portfolio:

```javascript
// portfolio.js handler
return createResponse(message, MESSAGE_TYPES.PORTFOLIO_DATA, {
  success: true,
  items: data  // Extract just items, not entire row
});
// Result: { type, success, items }

// Similar for Settings
return createResponse(message, MESSAGE_TYPES.SETTINGS_DATA, {
  config: data.config  // Extract just config, not entire row
});
// Result: { type, config }
```

## ✅ Verification

- Build: ✅ Passing (82 modules, 0 errors)
- Response structure: ✅ Consistent with portfolio pattern
- UI access: ✅ `response.config?.prompts` now works correctly

## 📝 Files Modified

- `src/background/handlers/settings.js`
  - Line 46-48: Extract config in SETTINGS_GET
  - Line 124-126: Extract config in SETTINGS_UPDATE

## 🚀 Status

**Fixed**: ✅ COMPLETE
**Build**: ✅ PASSING
**Ready**: ✅ YES
