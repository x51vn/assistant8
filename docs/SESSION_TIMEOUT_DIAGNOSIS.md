# Session Timeout Issue - Root Cause Analysis

## Problem
System periodically requests login again for both Supabase and X-Neews, even though token refresh mechanisms exist.

## Root Causes

### 1. **Supabase: token refresh không proactive**

**Cơ chế hiện tại:**
- `autoRefreshToken: true` - Supabase chỉ refresh token **khi có API request** chứa token
- `persistSession: true` - Lưu session vào chrome.storage.local
- SESSION_CHECK alarm chạy mỗi 1 phút để check expiry

**Vấn đề:**
```
Timeline:
T+0:00      User logs in → Token saved (expires T+1h)
T+0:30      UI closes → No more API requests
T+55:00     SESSION_CHECK alarm tries to refresh
            BUT: chrome.runtime.sendMessage → response handler expects UI listener
            If UI is CLOSED → request HANGS with "Receiving end does not exist"
            Handler returns undefined → refresh không xảy ra
T+1:00      Token expires
T+1:05      User opens extension → expects watchlist/portfolio
            → Supabase returns 401 (session expired)
            → UI shows "LOGIN REQUIRED" ❌
```

**Why refresh during SESSION_CHECK fails:**
1. alarms.js sends `chrome.runtime.sendMessage(...)` to SESSION_CHECK handler
2. If UI is closed → no message listener active  
3. Message fails → handler never runs → no refresh
4. Even SESSION_CHECK handler isn't guaranteed to listen when SW restarts

### 2. **X-Neews: refresh chỉ on 401, không có background refresh**

**Cơ chế hiện tại:**
- xneewsFetch() chỉ refresh token khi nhận 401 response
- Không có proactive/background refresh
- Tokens lưu trong chrome.storage.local

**Vấn đề:**
```
Timeline:
T+0:00      User logs in → X-Neews token saved
            (X-Neews tokens thường có TTL: 1-24 giờ tùy API)
T+T_EXPIRY  Token expires
            No background check → refresh không xảy ra
T+T_EXPIRY+1  User opens watchlist
            → xneewsFetch() attempts call with expired token
            → API returns 401
            → Refresh attempt with EXPIRED refresh_token
            → Refresh fails → tokens cleared
            → UI shows "LOGIN REQUIRED" ❌
```

**Why background refresh không có:**
1. Không có proactive refresh mechanism (chỉ on 401)
2. SESSION_CHECK chỉ quản lý Supabase, không X-Neews
3. Watchlist chỉ được load khi UI mở → không có background keep-alive

### 3. **chrome.storage.local có thể bị clear**

- Browser tự động clear storage trong cases:
  - User clears browser cache/cookies
  - Browser shutdown & old session data pruned
  - Extension update/reinstall
  - Storage quota exceeded

**Impact:** 
- Tokens bị xóa → app expects them → must re-login

### 4. **Session check broadcast không reliable**

alarms.js:
```javascript
if (alarm.name === 'SESSION_CHECK') {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SESSION_CHECK,  // ← Gửi đến handler
      ...
    });
  } catch (error) {
    if (!error?.message?.includes('Receiving end does not exist')) {
      logger.warn('SESSION_CHECK alarm failed', { ... });
    }
  }
}
```

**Problem:**
- `chrome.runtime.sendMessage()` trong SW khó gửi đến danh sách listeners chắc chắn
- Nếu **SW đã terminate** trước SESSION_CHECK alarm trigger → handler không đăng ký
- Nếu **UI/content script closed** → no other listener → message fails silently

### 5. **Session check handler throttle quá mạnh**

sessionManager.js:
```javascript
const SESSION_CHECK_INTERVAL_MS = 60000; // 1 minute

// Throttle checks
if (now - lastSessionCheckTime < SESSION_CHECK_INTERVAL_MS) {
  return { status: 'throttled', ... };
}
```

**Problem:**
- Nếu SESSION_CHECK alarm fail → `lastSessionCheckTime` không update
- Next alarm (1 min later) → bị throttle
- Token không được refresh → eventually expires

---

## Why Both Supabase & X-Neews Fail Simultaneously

```
Sequence:
1. User opens extension
2. Supabase session valid (refreshed by Supabase's internal logic on last request)
3. X-Neews token expired lâu → không refresh background
4. But: Watchlist page depends on BOTH:
   - Supabase session (for RLS auth)
   - X-Neews token (for watchlist API calls)
5. When user opens Watchlist:
   - Supabase session OK (because last request auto-refreshed it)
   - X-Neews token 401 → refresh FAILS (too old)
   - xneewsFetch() clears ALL X-Neews tokens
   - UI shows "LOGIN REQUIRED for X-Neews"
6. User navigates away, comes back LATER:
   - Both tokens now expired (extended time passed)
   - Supabase refresh attempt fails (no active listener during SESSION_CHECK)
   - X-Neews tokens cleared earlier
   - UI shows "LOGIN REQUIRED for both" ❌
```

---

## Solution

### Short term (Fix Supabase refresh):
1. **Make SESSION_CHECK work during SW restarts**
   - Move refresh logic to a dedicated handler that doesn't need external listeners
   - Or: Implement polling instead of alarm-based checks

2. **Guarantee token refresh before expiry**
   - sessionManager: Remove throttle when expiry < 5 mins
   - Attempt refresh periodically: T+55min, T+59min, T+59:50, etc.
   
### Medium term (Add X-Neews background refresh):
1. **Implement X-Neews session check**
   - Add XNEEWS_SESSION_CHECK handler (similar to SESSION_CHECK)
   - Check token expiry every 5 minutes
   - Refresh proactively 2 minutes before expiry

2. **Store token expiry in chrome.storage.local**
   ```javascript
   // xneewsAuth.js - save token expiry
   saveTokens(accessToken, refreshToken, userId, email, expiresAt);
   ```

3. **Handle refresh failure gracefully**
   - If refresh fails: Don't clear tokens immediately
   - Set flag: `xneews_needs_reauth: true`
   - Show "X-Neews re-auth needed" but don't logout Supabase

### Long term (Architecture redesign):
1. **Separate credentials by system**
   - Supabase: Managed by sessionManager
   - X-Neews: Managed by xneewsSessionManager
   - Each has own refresh/check logic

2. **Use persistent background task**
   - Chrome persistent scripts (Manifest V3 future)
   - Or: Use service worker lifecycle hooks

3. **Client-side session recovery**
   - If any request fails with 401: auto-broadcast "need re-auth"
   - UI shows minimal "one-click re-auth" button
   - Don't clear tokens until refresh actually fails

---

## Immediate Recommendations

**Priority 1** (Fix critical): 
- Add robust retry logic to SESSION_CHECK broadcast
- If broadcast fails, store "needs_check" flag → check on next UI message

**Priority 2** (Fix X-Neews):
- Add XNEEWS_SESSION_CHECK handler
- Trigger from watchlistPriceUpdate alarm (already running)

**Priority 3** (Improve UX):
- Show "updating session..." instead of "LOGIN REQUIRED"
- Provide one-click "Re-authenticate" button instead of full login form
- Save partial state so users don't lose unsaved changes

