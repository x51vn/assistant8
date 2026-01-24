DONE

# GPT-008-002 Add password visibility toggle

## Project Context (MUST READ)
Login form has password input but no way to show/hide password, making it harder to verify typos.

## Parent Ticket
GPT-008 (UI auth gate + login UX)

## Priority
P2 (Nice-to-have for better UX)

## Timebox
15 minutes

## Goal
Add eye icon button to toggle password visibility in login form.

## Inputs
- src/ui/auth.js (renderLoginScreen function)
- Font Awesome icons (already imported in sidepanel.html)

## Requirements
1. Add eye icon button next to password input
2. Toggle between `type="password"` and `type="text"`
3. Change icon from eye to eye-slash when visible
4. Accessible: proper ARIA labels

## Current Code
```javascript
<input 
  type="password" 
  id="loginPassword" 
  class="form-input" 
  placeholder="••••••••"
  required
  autocomplete="current-password"
/>
```

## Recommended Implementation
```javascript
<div class="form-group" style="position: relative;">
  <label for="loginPassword">Mật khẩu</label>
  <div style="position: relative;">
    <input 
      type="password" 
      id="loginPassword" 
      class="form-input" 
      placeholder="••••••••"
      required
      autocomplete="current-password"
      style="padding-right: 40px;"
    />
    <button 
      type="button"
      id="togglePassword"
      class="password-toggle-btn"
      aria-label="Hiện/ẩn mật khẩu"
      style="
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        cursor: pointer;
        color: #666;
        padding: 5px;
      "
    >
      <i class="fas fa-eye"></i>
    </button>
  </div>
</div>

// In JavaScript setup
const passwordInput = container.querySelector('#loginPassword');
const toggleBtn = container.querySelector('#togglePassword');
const toggleIcon = toggleBtn.querySelector('i');

toggleBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  toggleIcon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
});
```

## CSS Addition
```css
.password-toggle-btn:hover {
  color: #667eea;
}

.password-toggle-btn:focus {
  outline: 2px solid #667eea;
  outline-offset: 2px;
  border-radius: 4px;
}
```

## Test Cases
- Click eye icon → password becomes visible
- Click again → password hidden
- Icon changes: eye ↔ eye-slash
- Focus state accessible (keyboard navigation)

## Acceptance Criteria
- Eye icon renders next to password field
- Click toggles password visibility
- Icon updates correctly
- No layout shift when toggling
- Accessible via keyboard

## DoD
- Build successful
- Manual test: toggle password visibility
- Works on both login forms (if signup added later)

## Dependencies
None

## Risks
Very low - common UI pattern

## Notes
- Standard UX pattern for password inputs
- Improves usability especially on mobile
- Can reuse pattern for signup form later
