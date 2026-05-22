# Quick Fix Reference - Message Schema Compliance

## Problem
```
Error: Message does not follow schema
  at src/platform/messaging.js:26
  at isValidMessage(message)
```

## Root Cause
Missing `v` field in `chrome.runtime.sendMessage()` calls

## Solution Pattern

### Before ❌
```javascript
const response = await chrome.runtime.sendMessage({
  type: MESSAGE_TYPES.ASSETS_GET,
  correlationId: generateCorrelationId(),
  timestamp: Date.now(),
  data: { includeInactive: false }
});
// Missing: v: 1
```

### After ✅
```javascript
import { createMessage, MESSAGE_TYPES } from '../../shared/messageSchema.js';

const response = await chrome.runtime.sendMessage(
  createMessage(MESSAGE_TYPES.ASSETS_GET, { data: { includeInactive: false } })
);
// Automatically adds v: 1, correlationId, timestamp
```

## Changes Applied

### AssetsPage.jsx (3 fixes)
- Line 87: `loadAssets()` - FIXED ✅
- Line 138: `confirmDelete()` - FIXED ✅
- Line 172: `handleSave()` - FIXED ✅

### NetWorthSummary.jsx (1 fix)
- Line 65: `fetchNetWorth()` - FIXED ✅

### AssetHistoryChart.jsx (1 fix)
- Line 76: `fetchHistory()` - FIXED ✅

## Verification
```bash
npm run build
# ✓ built in 1.45s - SUCCESS
```

## When Adding New Message Calls
1. Import: `import { createMessage, MESSAGE_TYPES } from '../../shared/messageSchema.js'`
2. Use: `createMessage(MESSAGE_TYPES.YOUR_TYPE, { data: {...} })`
3. Send: `chrome.runtime.sendMessage(createMessage(...))`

## Valid Message Template
```javascript
{
  v: 1,                           // ✅ REQUIRED - schema version
  type: "ASSETS_GET",             // ✅ REQUIRED - from MESSAGE_TYPES
  correlationId: "uuid-xxx",      // ✅ REQUIRED - for tracing
  timestamp: 1706800000000,       // ✅ AUTO - from createMessage()
  inResponseTo?: "ASSET_ADD",     // Optional - for responses
  data?: { filter: 'all' },       // Optional - payload
  error?: { code, message }       // Optional - for errors
}
```

## Helper Functions Available

### `createMessage(type, payload?)`
Creates request message with v, correlationId, timestamp
```javascript
createMessage(MESSAGE_TYPES.ASSETS_GET, { data: { range: '30d' } })
```

### `createResponse(originalMessage, responseType, payload?)`
Creates response with same correlationId
```javascript
createResponse(message, MESSAGE_TYPES.ASSETS_DATA, { items: [...] })
```

### `createErrorResponse(originalMessage, errorCode, errorMessage, details?)`
Creates error response
```javascript
createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Asset type invalid')
```

### `isValidMessage(message)`
Validates message structure
```javascript
if (!isValidMessage(msg)) throw new Error('Invalid message');
```

## Common Mistakes to Avoid

❌ Using `v` without consistent version
```javascript
{ v: 2, type: 'ASSETS_GET' }  // WRONG - v must be 1
```

❌ Missing correlationId
```javascript
{ v: 1, type: 'ASSETS_GET' }  // WRONG - needs correlationId
```

❌ Using arbitrary strings for type
```javascript
{ v: 1, type: 'get-assets', correlationId: 'x' }  // WRONG - use MESSAGE_TYPES
```

❌ Not using helper for new messages
```javascript
// WRONG - manual message without v:1
const msg = {
  type: MESSAGE_TYPES.NEW_TYPE,
  correlationId: generateCorrelationId(),
  timestamp: Date.now()
};
```

## Build Verification
After making changes:
```bash
npm run build
# Should complete with: ✓ built in X.XXs
```

---
**Last Updated**: February 1, 2026  
**Status**: ✅ All asset components fixed and building successfully
