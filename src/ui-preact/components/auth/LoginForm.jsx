/**
 * LoginForm.jsx - Authentication form component
 * 
 * Features:
 * - Email and password inputs with validation
 * - Client-side validation (email format, password length)
 * - Error message display (validation + API errors)
 * - Loading state during submission
 * - Integration with useAuth hook
 * - "Quên mật khẩu?" link (XST-751)
 * - Google OAuth button (XST-753)
 * 
 * X51LABS-163: Build LoginForm Component
 * XST-751: Password Reset Flow
 * XST-753: Google OAuth Social Login
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useAuth } from '../../hooks/useAuth.js';
import { signInWithGoogle } from '../../api/authApi.js';

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
export function LoginForm({ onForgotPassword, onRegister }) {
  // Auth hook
  const { login, checkAuthStatus, error } = useAuth();  // NOTE: NO loading, use globalLoading
  
  // Local form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(null);
  
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
  
  /**
   * Handle Google OAuth login (XST-753)
   */
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const result = await signInWithGoogle();
      if (!result.authenticated) {
        setGoogleError(result.error || 'Đăng nhập Google thất bại');
      }
      // On success, AuthContext will update via auth state listener
    } catch (err) {
      setGoogleError('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setGoogleLoading(false);
    }
  };
  
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
      
      {/* Forgot Password Link (XST-751) */}
      {onForgotPassword && (
        <div class="forgot-password-link">
          <button
            type="button"
            class="link-btn"
            onClick={onForgotPassword}
            data-testid="forgot-password-link"
          >
            Quên mật khẩu?
          </button>
        </div>
      )}
      
      {/* API Error Display */}
      {error && (
        <div class="form-error form-error-api" data-testid="api-error">
          <i class="fas fa-exclamation-circle"></i> {error}
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
      
      {/* Divider */}
      <div class="auth-divider">
        <span>hoặc</span>
      </div>
      
      {/* Google OAuth Button (XST-753) */}
      <button
        type="button"
        class="btn btn-google btn-lg btn-block"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        data-testid="google-login-button"
      >
        {googleLoading ? (
          <>
            <i class="fas fa-spinner fa-spin"></i>{' '}Đang kết nối...
          </>
        ) : (
          <>
            <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {' '}Đăng nhập bằng Google
          </>
        )}
      </button>
      
      {/* Google OAuth Error */}
      {googleError && (
        <div class="form-error form-error-api" data-testid="google-error">
          <i class="fas fa-exclamation-circle"></i> {googleError}
        </div>
      )}
      
      {/* Register Link (XST-756) */}
      {onRegister && (
        <div class="register-link">
          <span>Chưa có tài khoản? </span>
          <button
            type="button"
            class="link-btn"
            onClick={onRegister}
            data-testid="register-link"
          >
            Đăng ký
          </button>
        </div>
      )}
    </form>
  );
}
