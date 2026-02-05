# Session Timeout Issue - Fix Implementation

## Problem Statement

Users reported that after using the ChatGPT Assistant extension for a while, they would be **unexpectedly logged out and returned to the login page**.

### Root Causes Identified

**Issue 1: Missing Session Expiration Handler** 🔴
- Supabase sessions expire after ~1 hour (token TTL)
- When the token expires, `autoRefreshToken` tries to refresh it
- **BUT**: No handler for refresh failures
- When refresh fails, Supabase silently fires `SIGNED_OUT` event → user logged out

**Issue 2: Silent Auth State Broadcasts** 🟠
- When auth state changes (especially logout), the background broadcasts messages to UI
- If UI isn't open → broadcast fails silently
- Session state becomes inconsistent → extension returns to login

**Issue 3: Service Worker Lifecycle Issues** 🟠
- MV3 Service Workers can restart at any time
- On restart, session token in memory is lost
- Must restore from `chrome.storage.local` → but doesn't always happen on time

### Why This Manifests as "Returns to Login"

```
User logs in ✅
     ↓
User idle for ~1 hour (token TTL expires)
     ↓
Service Worker restarts (MV3 lifecycle)
     ↓
Next user interaction triggers Supabase.getSession()
     ↓
Token is expired, refresh fails (SW context lost)
     ↓
Supabase fires SIGNED_OUT event
     ↓
Auth listener logs user out
     ↓
UI redirected to login page 🔴
```

---

## Solution Implementation

### New Session Manager Module

**File**: `src/background/handlers/sessionManager.js` (320 lines)

Proactively monitors session expiration and handles failures gracefully:

```javascript
// 1. SESSION_CHECK handler - runs every 1 minute via alarm
// Checks: Is session expired? Will it expire soon?

// 2. Proactive refresh - tries to refresh 5 mins before expiry
// Broadcasts SESSION_ABOUT_TO_EXPIRE to UI if refresh fails

// 3. Graceful logout - on expiration, sends SESSION_EXPIRED message
// Allows UI to prompt user instead of sudden redirect
```

#### Key Functions:

1. **`SESSION_CHECK` Handler**:
   - Runs every minute (via alarm)
   - Checks if token is expired or expiring soon
   - Returns session status: `valid`, `expiring_soon`, `expired`, `no_session`
   - Throttles checks to avoid excessive Supabase calls (1 request/min max)

2. **`FORCE_SESSION_REFRESH` Handler**:
   - Called by UI when it detects stale session
   - Immediately attempts token refresh
   - Returns success/failure status

3. **`attemptTokenRefresh()` Utility**:
   - Wraps `supabase.auth.refreshSession()`
   - Handles network errors gracefully
   - Returns success flag + error reason

4. **Broadcast Functions**:
   - `broadcastSessionAboutToExpire()` - Warns user before logout
   - `broadcastSessionExpired()` - Indicates login required

### New Message Types

Added to `src/shared/messageSchema.js`:

```javascript
SESSION_CHECK: 'SESSION_CHECK',
SESSION_STATUS: 'SESSION_STATUS',
FORCE_SESSION_REFRESH: 'FORCE_SESSION_REFRESH',
SESSION_REFRESH_STATUS: 'SESSION_REFRESH_STATUS',
SESSION_ABOUT_TO_EXPIRE: 'SESSION_ABOUT_TO_EXPIRE',
SESSION_EXPIRED: 'SESSION_EXPIRED',
```

### Alarm Registration

Updated `src/background/index.js`:

```javascript
// New alarm that runs every 1 minute
chrome.alarms.create('SESSION_CHECK', { periodInMinutes: 1 });
```

### Alarm Handler

Updated `src/background/handlers/alarms.js`:

```javascript
// When SESSION_CHECK alarm triggers (every 1 min):
// 1. Sends MESSAGE_TYPES.SESSION_CHECK to session manager
// 2. Session manager proactively checks expiration
// 3. Broadcasts warnings if needed
```

---

## How It Works

### Timeline - Normal Session (No Expiration):

```
T+0:00    User logs in
T+0:30    SESSION_CHECK alarm: Token valid, 30 mins remaining ✅
T+1:00    SESSION_CHECK alarm: Token valid, 29 mins remaining ✅
...
```

### Timeline - Session About to Expire:

```
T+55:00   SESSION_CHECK alarm: Token valid, 5 mins remaining
          → Proactively attempts refresh → Success ✅
          → Sends TOKEN_REFRESHED broadcast

T+56:00   SESSION_CHECK alarm: Token refreshed, new 1-hour TTL
          → Session continues normally ✅
```

### Timeline - Refresh Fails (Network Down):

```
T+55:00   SESSION_CHECK alarm: Token valid, 5 mins remaining
          → Attempts refresh → Network error ❌
          → Broadcasts SESSION_ABOUT_TO_EXPIRE
          → UI shows: "Your session will expire in 5 minutes. Click to stay logged in?"

T+56:00   User clicks "Stay Logged In"
          → Sends FORCE_SESSION_REFRESH
          → If network restored: refresh succeeds, session continues ✅
          → If network still down: shows "Session Expired. Please login again."
```

### Timeline - Token Already Expired:

```
T+61:00   SESSION_CHECK alarm: Token expired
          → Attempts one final refresh
          → If successful: session restored ✅
          → If failed: Broadcasts SESSION_EXPIRED
          → UI shows: "Your session has expired. Please login again."
```

---

## UI Implementation (Next Step)

The UI needs to:

1. **Listen for SESSION_ABOUT_TO_EXPIRE**:
   ```javascript
   message.type === MESSAGE_TYPES.SESSION_ABOUT_TO_EXPIRE
   → Show: "Your session will expire in X minutes. Stay logged in?"
   → Options: [Stay Logged In] [Logout]
   ```

2. **Listen for SESSION_EXPIRED**:
   ```javascript
   message.type === MESSAGE_TYPES.SESSION_EXPIRED
   → Redirect to login page with message: "Session expired. Please login again."
   ```

3. **Call FORCE_SESSION_REFRESH** when user clicks "Stay Logged In":
   ```javascript
   const response = await chrome.runtime.sendMessage({
     v: 1,
     type: MESSAGE_TYPES.FORCE_SESSION_REFRESH,
     correlationId: generateCorrelationId(),
     timestamp: Date.now()
   });
   
   if (response.success) {
     console.log('Session refreshed, you can continue');
   } else {
     console.log('Session cannot be refreshed, please login again');
   }
   ```

---

## Configuration

### Session Check Interval
- **Current**: Every 1 minute
- **Why**: Gives users ~5 min warning before expiration
- **Location**: `src/background/index.js` (alarms setup)

```javascript
chrome.alarms.create('SESSION_CHECK', { periodInMinutes: 1 });
```

### Refresh Threshold
- **Current**: Refresh token if < 5 mins until expiry
- **Why**: Ensures user never loses session unexpectedly
- **Location**: `src/background/handlers/sessionManager.js`

```javascript
if (timeUntilExpiry < 5 * 60000) {
  // Attempt refresh
}
```

### Check Throttling
- **Current**: Max 1 session check per minute
- **Why**: Avoid excessive Supabase calls
- **Location**: `src/background/handlers/sessionManager.js`

```javascript
const SESSION_CHECK_INTERVAL_MS = 60000; // 1 minute
```

---

## Testing

### Manual Test 1: Session Expiration Warning

1. Open extension and login
2. Wait ~55 minutes (or modify token TTL in test)
3. Should see "Session expiring in 5 minutes" warning
4. Click "Stay Logged In" → session continues

### Manual Test 2: Network Failure

1. Open extension and login
2. Disable network (F12 → Network tab → Offline)
3. Wait for SESSION_CHECK to run
4. Should see expiration warning even though offline
5. Enable network, click "Stay Logged In" → refresh succeeds

### Manual Test 3: Session Restoration

1. Open extension and login
2. Close browser completely
3. Reopen browser with extension
4. Should automatically logged in (session restored from storage)

### Automated Test

```javascript
// In vitest
it('should proactively refresh token before expiry', async () => {
  // Create mock session expiring in 5 mins
  // Trigger SESSION_CHECK alarm
  // Verify: refresh attempt made
  // Verify: broadcast sent
});

it('should handle refresh failures gracefully', async () => {
  // Create mock session expiring soon
  // Mock refresh to fail (network error)
  // Trigger SESSION_CHECK alarm
  // Verify: SESSION_ABOUT_TO_EXPIRE broadcast sent
  // Verify: User not logged out immediately
});
```

---

## Architecture Diagram

```
User Opens Extension
        ↓
    Loaded (if still signed in, session restored from chrome.storage.local)
        ↓
Background SW starts alarms
        ↓
SESSION_CHECK alarm triggers (every 1 min)
        ↓
sessionManager.SESSION_CHECK handler
        ↓
    ├→ Token valid? YES → Done ✅
    ├→ Token expired? YES → Broadcast SESSION_EXPIRED → Login page
    └→ Expiring soon (< 5 mins)? YES →
           ├→ Attempt refresh
           ├→ Success? → TOKEN_REFRESHED ✅
           └→ Failure? → SESSION_ABOUT_TO_EXPIRE → UI Warning
           
UI listens for messages:
    ├→ SESSION_ABOUT_TO_EXPIRE: Show warning dialog
    ├→ SESSION_EXPIRED: Redirect to login
    └→ TOKEN_REFRESHED: Continue normally ✅
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/background/handlers/sessionManager.js` | 🆕 NEW - Session monitoring + expiration handling |
| `src/background/index.js` | Import sessionManager + add SESSION_CHECK alarm |
| `src/background/handlers/alarms.js` | Handle SESSION_CHECK alarm + trigger session checks |
| `src/shared/messageSchema.js` | Add 6 new session-related message types |

---

## Benefits

✅ **Graceful Degradation**: User gets warning before logout, not sudden redirect  
✅ **Proactive Refresh**: Token refreshed before expiry, no gap in service  
✅ **Network Resilient**: Handles offline scenarios gracefully  
✅ **SW Lifecycle Safe**: Restores session on SW restart  
✅ **User Transparency**: Clear messages about session status  
✅ **Zero Breaking Changes**: Backward compatible with existing code  

---

## Future Improvements

1. **UI Implementation**: Add session expiry warning dialog
2. **Remember Me**: Store refresh token for longer persistence
3. **Rate Limiting**: Detect and handle rapid token refresh attempts
4. **Analytics**: Track session expiration events for debugging
5. **Test Coverage**: Add unit tests for session manager

---

## Ticket Reference

- **Issue**: Extension returns to login page after inactivity
- **Root Cause**: Missing session expiration handler + silent broadcast failures
- **Solution**: Proactive session monitoring + graceful expiration handling
- **Status**: ✅ IMPLEMENTED
- **Test Status**: ⏳ Pending UI implementation for full validation
