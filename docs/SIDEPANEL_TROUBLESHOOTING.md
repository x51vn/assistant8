# Side Panel Troubleshooting Guide

## Issue: "Failed to open side panel" Error

### Root Causes

1. **Chrome Version Too Old**
   - **Required**: Chrome 114 or later
   - **Reason**: `chrome.sidePanel` API was introduced in Chrome 114
   - **Check**: `chrome://version/`

2. **User Gesture Context Expired** (FIXED)
   - **Error**: "`sidePanel.open()` may only be called in response to a user gesture."
   - **Cause**: Calling `await chrome.sidePanel.setOptions()` before `open()` causes the user gesture context to expire
   - **Solution**: Call `open()` directly without `setOptions()` since `side_panel.default_path` is already in manifest
   - **Fixed in**: Commit on Jan 24, 2026

3. **Side Panel Already Open**
   - Calling `chrome.sidePanel.open()` when the side panel is already visible
   - Not a critical error, just a no-op

4. **Invalid Tab Context**
   - Tab may have been closed or navigated away before the API call completed

### Solutions

#### 1. Verify Chrome Version
```bash
# In Chrome address bar
chrome://version/
```
If version < 114, update Chrome or use Chrome Canary/Dev channel.

#### 2. Check Extension Console
```bash
# Go to
chrome://extensions/
# Find "ChatGPT Assistant"
# Click "Inspect views: service worker"
# Check Console for detailed error logs
```

The improved error logging now shows:
- Chrome version
- Error message and stack trace
- Tab ID
- Full error object as JSON

#### 3. Reload Extension
```bash
chrome://extensions/
# Toggle extension off/on
# OR click "Reload" button
```

#### 4. Check Manifest
Verify `manifest.json` includes:
```json
{
  "minimum_chrome_version": "114",
  "permissions": ["sidePanel"],
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

### Recent Fixes (Jan 24, 2026)

1. **Enhanced Error Logging**
   - Now logs full error details including message, name, and stack
   - Serializes error object to JSON for better debugging
   - Checks for "already open" errors (non-critical)

2. **API Availability Check**
   - Verifies `chrome.sidePanel` exists before calling
   - Logs clear error message if not available

3. **Tab Validation**
   - Checks tab object is valid before attempting to open side panel

4. **Minimum Chrome Version**
   - Added `"minimum_chrome_version": "114"` to manifest
   - Chrome Web Store will now enforce this requirement

### Code Reference

**Location**: `src/background/index.js` (lines 70-120)

**Key Changes**:
```javascript
// Before (causes user gesture context to expire)
await chrome.sidePanel.setOptions({ 
  tabId: tab.id, 
  path: 'sidepanel.html', 
  enabled: true 
});
await chrome.sidePanel.open({ tabId: tab.id });

// After (preserves user gesture context)
await chrome.sidePanel.open({ tabId: tab.id });
// Note: setOptions() not needed since side_panel.default_path is in manifest
```

### Testing

1. **Chrome 114+**: Side panel should open successfully
2. **Chrome < 114**: Should see clear error about version requirement
3. **Already Open**: Should log info message, not fail
4. **Invalid Tab**: Should log error with tab details

### Related Issues

- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/sidePanel/
- Minimum Chrome Version: https://developer.chrome.com/docs/extensions/mv3/manifest/minimum_chrome_version/

### Contact

If issues persist after trying these solutions, collect:
1. Chrome version (`chrome://version/`)
2. Service worker console logs
3. Screenshot of error
4. Steps to reproduce

And file an issue in the project repository.
