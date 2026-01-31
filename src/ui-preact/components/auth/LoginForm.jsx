/**
 * LoginForm.jsx - Authentication form component
 * 
 * Features:
 * - Email and password inputs with validation
 * - Client-side validation (email format, password length)
 * - Error message display (validation + API errors)
 * - Loading state during submission
 * - Integration with useAuth hook
 * 
 * X51LABS-163: Build LoginForm Component
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useAuth } from '../../hooks/useAuth.js';

// Validation constants
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {string|null} - Error message or null if valid
 */
function validateEmail(email) {
  if (!email || email.trim().length === 0) {
    return 'Email là bắt buộc';
  }
  
  if (!EMAIL_REGEX.test(email)) {
    return 'Email không hợp lệ';
  }
  
  return null;
}

/**
 * Validate password
 * @param {string} password - Password to validate
 * @returns {string|null} - Error message or null if valid
 */
function validatePassword(password) {
  if (!password || password.length === 0) {
    return 'Mật khẩu là bắt buộc';
  }
  
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`;
  }
  
  return null;
}

/**
 * LoginForm - Reusable authentication form component
 * 
 * No props required - component is self-contained
 * Must be used within AuthProvider context
 * 
 * @example
 * <AuthProvider>
 *   <LoginForm />
 * </AuthProvider>
 */
export function LoginForm() {
  // Auth hook
  const { login, checkAuthStatus, error } = useAuth();  // NOTE: NO loading, use globalLoading
  
  // Local form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  
  /**
   * Handle form submission
   * @param {Event} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Client-side validation
    const errors = {};
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    
    setValidationErrors(errors);
    
    // Stop if validation errors
    if (Object.keys(errors).length > 0) {
      return;
    }
    
    // Call login API
    const result = await login(email.trim(), password);
    
    // On success, the AuthContext will update and App will re-render
    // No need to manually check status again
    if (result.authenticated) {
      console.log('[LoginForm] Login successful, waiting for App re-render');
      // Clear form
      setEmail('');
      setPassword('');
      setValidationErrors({});
    } else {
      // Error is already set in useAuth hook via handleLogin
      console.error('[LoginForm] Login failed:', result.error);
    }
  };
  
  /**
   * Handle email input change
   */
  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    // Clear validation error on change
    if (validationErrors.email) {
      setValidationErrors({ ...validationErrors, email: null });
    }
  };
  
  /**
   * Handle password input change
   */
  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    // Clear validation error on change
    if (validationErrors.password) {
      setValidationErrors({ ...validationErrors, password: null });
    }
  };
  
  // Compute if form has validation errors
  const hasValidationErrors = Object.values(validationErrors).some(err => err !== null && err !== undefined);
  
  return (
    <form onSubmit={handleSubmit} data-testid="login-form" class="auth-form">
      {/* Email Input */}
      <div class="form-group">
        <label for="email" class="form-label">
          <i class="fas fa-envelope"></i> Email
        </label>
        <input
          type="email"
          id="email"
          data-testid="email-input"
          value={email}
          onInput={handleEmailChange}
          autocomplete="email"
          class="form-control"
          placeholder="your@email.com"
          required
        />
        {validationErrors.email && (
          <div class="form-error" data-testid="email-error">
            <i class="fas fa-exclamation-circle"></i> {validationErrors.email}
          </div>
        )}
      </div>
      
      {/* Password Input */}
      <div class="form-group">
        <label for="password" class="form-label">
          <i class="fas fa-lock"></i> Mật khẩu
        </label>
        <input
          type="password"
          id="password"
          data-testid="password-input"
          value={password}
          onInput={handlePasswordChange}
          autocomplete="current-password"
          class="form-control"
          placeholder="••••••••"
          required
        />
        {validationErrors.password && (
          <div class="form-error" data-testid="password-error">
            <i class="fas fa-exclamation-circle"></i> {validationErrors.password}
          </div>
        )}
      </div>
      
      {/* API Error Display */}
      {error && (
        <div class="form-error form-error-api" data-testid="api-error">
          <i class="fas fa-alert-circle"></i> {error}
        </div>
      )}
      
      {/* Submit Button */}
      <button
        type="submit"
        data-testid="submit-button"
        disabled={hasValidationErrors}
        class="btn btn-primary btn-lg btn-block"
      >
        <i class="fas fa-sign-in-alt"></i> Đăng nhập
      </button>
    </form>
  );
}
