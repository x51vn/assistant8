# GPT-008-001 Add "Remember Me" checkbox

## Project Context (MUST READ)
Login form requires email/password every time. Adding persistent session would improve UX but needs security considerations.

## Parent Ticket
GPT-008 (UI auth gate + login UX)

## Priority
P3 (Nice-to-have - Supabase already persists session via chromeStorageAdapter)

## Timebox
30 minutes

## Goal
Add optional "Remember Me" checkbox to control session persistence duration.

## Inputs
- src/ui/auth.js (renderLoginScreen function)
- Supabase Auth docs for session configuration

## Requirements
1. Add checkbox to login form
2. Pass `persistSession` option to login
3. Default: true (current behavior)
4. When unchecked: short-lived session

## Current Behavior
```javascript
// Supabase already persists session indefinitely
const supabase = createClient(url, key, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: true, // ← Always on
    autoRefreshToken: true
  }
});
```

## Recommended Implementation
**Option 1: UI Control (Simple)**
```javascript
// In renderLoginScreen()
<div class="form-group">
  <label style="display: flex; align-items: center;">
    <input 
      type="checkbox" 
      id="rememberMe" 
      checked 
      style="margin-right: 8px;"
    />
    Duy trì đăng nhập
  </label>
</div>

// In login handler
const rememberMe = document.getElementById('rememberMe')?.checked;
// Pass to background via message data
```

**Option 2: Session Timeout (Advanced)**
- Set session expiry based on checkbox
- Require re-auth after X hours if unchecked
- More complex, needs background timer

## Test Cases
- Checked → login persists across extension restarts
- Unchecked → session expires after browser close
- Default state: checked

## Acceptance Criteria
- Checkbox renders in login form
- Session behavior changes based on checkbox
- Clear user messaging about what "Remember Me" means

## DoD
- Build successful
- Manual test: login with/without remember me
- Session persists correctly

## Dependencies
None

## Risks
Low - Supabase handles session management, just need to expose UI control

## Notes
- Current implementation already persists sessions (checkbox would be default checked)
- This is more about giving users control than changing behavior
- Consider adding "Logout from all devices" feature later
