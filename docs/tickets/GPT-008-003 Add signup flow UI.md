DONE

# GPT-008-003 Add signup flow UI

## Project Context (MUST READ)
Currently only login exists. Users cannot sign up from extension UI - must create account elsewhere (Supabase dashboard or separate signup page).

## Parent Ticket
GPT-008 (UI auth gate + login UX)

## Priority
P2 (Should-have for self-service onboarding)

## Timebox
1.5 hours

## Goal
Add signup form UI and integrate with Supabase signup API.

## Inputs
- src/ui/auth.js (renderLoginScreen function)
- src/background/handlers/supabaseAuth.js (may need SIGNUP handler)
- Supabase Auth docs for signUp()

## Requirements
1. Add "Chưa có tài khoản? Đăng ký" link on login screen
2. Render signup form when clicked
3. Fields: email, password, confirm password
4. Password strength indicator (optional)
5. Send SUPABASE_AUTH_SIGNUP message to background
6. Handle email confirmation flow
7. Link back to login after successful signup

## Recommended Implementation

**UI Changes (auth.js)**:
```javascript
// Add to login screen
<div class="auth-footer">
  <p class="auth-note">
    Chưa có tài khoản? 
    <a href="#" id="showSignupLink" style="color: #667eea; text-decoration: none; font-weight: 600;">
      Đăng ký ngay
    </a>
  </p>
</div>

// New function
export function renderSignupScreen(container, onSignupSuccess) {
  container.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1>Tạo tài khoản mới</h1>
          <p>Đăng ký để sử dụng ChatGPT Assistant</p>
        </div>
        
        <form id="signupForm" class="auth-form">
          <div class="form-group">
            <label for="signupEmail">Email</label>
            <input type="email" id="signupEmail" class="form-input" required />
          </div>
          
          <div class="form-group">
            <label for="signupPassword">Mật khẩu</label>
            <input type="password" id="signupPassword" class="form-input" required />
            <p class="help-text">Tối thiểu 6 ký tự</p>
          </div>
          
          <div class="form-group">
            <label for="confirmPassword">Xác nhận mật khẩu</label>
            <input type="password" id="confirmPassword" class="form-input" required />
          </div>
          
          <div id="signupError" class="error-message" style="display: none;"></div>
          
          <button type="submit" id="signupBtn" class="primary-btn">
            <span class="btn-text">Đăng ký</span>
            <span class="btn-spinner" style="display: none;">
              <i class="fas fa-spinner fa-spin"></i>
            </span>
          </button>
        </form>
        
        <div class="auth-footer">
          <p class="auth-note">
            Đã có tài khoản? 
            <a href="#" id="showLoginLink" style="color: #667eea;">Đăng nhập</a>
          </p>
        </div>
      </div>
    </div>
  `;
  
  // Setup handlers...
}
```

**Backend Handler (supabaseAuth.js)**:
```javascript
registerHandler(MESSAGE_TYPES.SUPABASE_AUTH_SIGNUP, async (message) => {
  try {
    const { email, password } = message.data;
    
    // Validate input
    if (!email || !password) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 
        'Email và mật khẩu là bắt buộc');
    }
    
    // Call Supabase signup
    const result = await supabaseWithRetry(async () => {
      const authResult = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: chrome.runtime.getURL('sidepanel.html')
        }
      });
      
      if (authResult.error) throw authResult.error;
      return authResult;
    }, { maxRetries: 2 });
    
    // Check if email confirmation required
    if (result.data.user && !result.data.session) {
      return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_SIGNUP_SUCCESS, {
        user: result.data.user,
        emailConfirmationRequired: true
      });
    }
    
    return createResponse(message, MESSAGE_TYPES.SUPABASE_AUTH_SIGNUP_SUCCESS, {
      user: result.data.user
    });
  } catch (error) {
    // Map common errors
    if (error.message?.includes('User already registered')) {
      return createErrorResponse(message, ERROR_CODES.AUTH_USER_EXISTS,
        'Email này đã được đăng ký. Vui lòng đăng nhập.');
    }
    
    return createErrorResponse(message, ERROR_CODES.AUTH_ERROR,
      'Đăng ký thất bại. Vui lòng thử lại.',
      { technicalError: error.message });
  }
});
```

**Message Types (messageSchema.js)**:
```javascript
SUPABASE_AUTH_SIGNUP: 'SUPABASE_AUTH_SIGNUP',
SUPABASE_AUTH_SIGNUP_SUCCESS: 'SUPABASE_AUTH_SIGNUP_SUCCESS',
```

**Error Codes (errorCodes.js)**:
```javascript
AUTH_USER_EXISTS: {
  code: 'AUTH_USER_EXISTS',
  message: 'Email này đã được đăng ký'
},
AUTH_WEAK_PASSWORD: {
  code: 'AUTH_WEAK_PASSWORD',
  message: 'Mật khẩu quá yếu'
}
```

## Test Cases
**Validation**:
- Empty email → error
- Invalid email format → error
- Password < 6 chars → error
- Passwords don't match → error

**Happy Path**:
- Valid signup → email confirmation message
- Click confirmation link → auto-login
- Already registered email → "Đã có tài khoản" error

**Edge Cases**:
- Network error during signup → retry
- Supabase rate limiting → clear error message

## Acceptance Criteria
- Signup form renders correctly
- Input validation works
- Email confirmation flow handled
- User can switch between login/signup
- Clear error messages in Vietnamese
- Successful signup shows confirmation message

## DoD
- MESSAGE_TYPES updated
- ERROR_CODES updated
- Background handler implemented
- UI signup form implemented
- Build successful
- Manual test: complete signup flow

## Dependencies
- GPT-008 (base auth UI complete)
- May need GPT-006 update (add message types)

## Risks
Medium - email confirmation flow needs careful UX design

## Notes
- Supabase sends confirmation email by default
- Need to handle "Check your email" state gracefully
- Consider adding resend confirmation link
- May want to auto-login after confirmation (requires URL handling)
