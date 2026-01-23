# GPT-008-004 Add loading state to auth gate

## Project Context (MUST READ)
On extension open, there's a flash of blank screen while checking auth status (checkAuthStatus() is async). Adding loading state improves perceived performance.

## Parent Ticket
GPT-008 (UI auth gate + login UX)

## Priority
P2 (Nice-to-have for better UX)

## Timebox
20 minutes

## Goal
Add loading spinner during initial auth check to avoid blank screen flash.

## Inputs
- src/ui/index.js (init function)
- src/ui/auth.js (checkAuthStatus function)

## Requirements
1. Show loading spinner immediately on page load
2. Hide spinner after auth check completes
3. Then render either login or main UI
4. Timeout fallback (max 5s wait)

## Current Code
```javascript
async function init() {
  // ... setup containers ...
  
  // Check auth status (takes ~500ms)
  const { authenticated, user } = await checkAuthStatus();
  
  if (!authenticated) {
    showLoginScreen(); // ← Flash if slow
  } else {
    hideLoginAndInitializeApp();
  }
}
```

## Recommended Implementation

**HTML (add to sidepanel.html)**:
```html
<div id="appLoader" class="app-loader">
  <div class="loader-content">
    <div class="spinner"></div>
    <p>Đang kiểm tra đăng nhập...</p>
  </div>
</div>
```

**CSS (add to styles.css)**:
```css
.app-loader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.3s ease;
}

.loader-content {
  text-align: center;
  color: white;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loader-content p {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}
```

**JavaScript (index.js)**:
```javascript
async function init() {
  const loader = document.getElementById('appLoader');
  
  // Create auth container
  authContainer = document.createElement('div');
  authContainer.id = 'authContainer';
  document.body.appendChild(authContainer);

  // Get main container
  mainContainer = document.querySelector('.container');

  // Hide main UI initially
  if (mainContainer) {
    mainContainer.style.display = 'none';
  }

  try {
    // Check auth status with timeout
    const authCheckPromise = checkAuthStatus();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth check timeout')), 5000)
    );
    
    const { authenticated, user } = await Promise.race([
      authCheckPromise,
      timeoutPromise
    ]);

    // Hide loader
    if (loader) {
      loader.style.display = 'none';
    }

    if (!authenticated) {
      showLoginScreen();
    } else {
      hideLoginAndInitializeApp();
    }
  } catch (error) {
    console.error('[Auth] Auth check failed:', error);
    
    // Hide loader
    if (loader) {
      loader.style.display = 'none';
    }
    
    // Default to login screen on error
    showLoginScreen();
  }

  // Listen for auth state changes...
}
```

## Test Cases
- Normal load → spinner shows < 1s, then login/main UI
- Slow network → spinner shows up to 5s, then timeout
- Auth check fails → spinner hides, shows login
- Fast auth check → minimal spinner flash (acceptable)

## Acceptance Criteria
- Loader shows immediately on page load
- Loader hides after auth check completes
- Timeout at 5 seconds if auth check hangs
- No blank screen flash during init
- Smooth transition to login/main UI

## DoD
- HTML loader element added
- CSS styles added
- JavaScript updated to show/hide loader
- Timeout protection added
- Build successful
- Manual test: extension load feels smooth

## Dependencies
None

## Risks
Very low - pure UI enhancement

## Notes
- Keep spinner timeout reasonable (5s max)
- Consider adding retry button if timeout occurs
- Loader uses same gradient as auth screen for consistency
