/**
 * RegisterForm.jsx - New user registration form
 * XST-752: Email Verification on Registration
 * XST-756: Unified Auth Components
 * 
 * Features:
 * - Email, password, name inputs
 * - Password strength validation (8+, upper, lower, digit, special)
 * - Password strength indicator
 * - Confirm password matching
 * - Back to login navigation
 * - Vietnamese messages
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { register } from '../../api/authApi.js';
import { getPasswordStrength, PASSWORD_REGEX } from '../../utils/passwordStrength.js';
import { ProgressBar } from '../ProgressBar.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm({ onBackToLogin, onRegistered }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Client-side validation
    const newErrors = {};
    
    if (!email.trim()) {
      newErrors.email = 'Email là bắt buộc';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      newErrors.email = 'Email không hợp lệ';
    }
    
    if (!password) {
      newErrors.password = 'Mật khẩu là bắt buộc';
    } else if (password.length < 8) {
      newErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    } else if (!PASSWORD_REGEX.test(password)) {
      newErrors.password = 'Mật khẩu phải có: 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt';
    }
    
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setApiError('');
    setIsSubmitting(true);
    
    try {
      const result = await register(email.trim(), password, name.trim());
      
      if (result.success) {
        if (result.needsEmailVerification) {
          // Navigate to email verification pending screen
          onRegistered?.(email.trim());
        } else {
          // No email verification needed - auto logged in
          // AuthContext will handle via auth state listener
          console.log('[RegisterForm] Registration successful, no email verification needed');
        }
      } else {
        setApiError(result.error || 'Đăng ký thất bại');
      }
    } catch (err) {
      setApiError('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div class="register-form">
      <div class="auth-header">
        <h1>Tạo tài khoản</h1>
        <p>Đăng ký để sử dụng Assistant8</p>
      </div>
      
      {apiError && (
        <div class="auth-error">
          <i class="fas fa-exclamation-circle"></i> {apiError}
        </div>
      )}
      
      <form onSubmit={handleSubmit} class="auth-form">
        {/* Name (optional) */}
        <div class="form-group">
          <label for="regName" class="form-label">
            <i class="fas fa-user"></i> Tên hiển thị
          </label>
          <input
            type="text"
            id="regName"
            value={name}
            onInput={(e) => setName(e.target.value)}
            placeholder="Tên của bạn (tùy chọn)"
            disabled={isSubmitting}
            autocomplete="name"
            class="form-control"
          />
        </div>
        
        {/* Email */}
        <div class="form-group">
          <label for="regEmail" class="form-label">
            <i class="fas fa-envelope"></i> Email
          </label>
          <input
            type="email"
            id="regEmail"
            value={email}
            onInput={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors({ ...errors, email: null });
            }}
            placeholder="your@email.com"
            disabled={isSubmitting}
            autocomplete="email"
            class={`form-control ${errors.email ? 'input-error' : ''}`}
            required
          />
          {errors.email && (
            <div class="form-error">
              <i class="fas fa-exclamation-circle"></i> {errors.email}
            </div>
          )}
        </div>
        
        {/* Password */}
        <div class="form-group">
          <label for="regPassword" class="form-label">
            <i class="fas fa-lock"></i> Mật khẩu
          </label>
          <div class="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              id="regPassword"
              value={password}
              onInput={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: null });
              }}
              placeholder="Ít nhất 8 ký tự"
              disabled={isSubmitting}
              autocomplete="new-password"
              class={`form-control ${errors.password ? 'input-error' : ''}`}
              required
            />
            <button
              type="button"
              class="toggle-password-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              <i class={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
          {password && (
            <div class="password-strength">
              <ProgressBar
                ariaLabel="Độ mạnh mật khẩu"
                value={strength.score}
                max={6}
                tone={strength.score <= 2 ? 'danger' : strength.score <= 4 ? 'warning' : 'success'}
                size="sm"
              />
              <span class="strength-label" style={`color: ${strength.color};`}>
                {strength.label}
              </span>
            </div>
          )}
          {errors.password && (
            <div class="form-error">
              <i class="fas fa-exclamation-circle"></i> {errors.password}
            </div>
          )}
          <div class="password-requirements">
            <small>Yêu cầu: 8+ ký tự, chữ hoa, chữ thường, chữ số, ký tự đặc biệt</small>
          </div>
        </div>
        
        {/* Confirm Password */}
        <div class="form-group">
          <label for="regConfirmPassword" class="form-label">
            <i class="fas fa-lock"></i> Xác nhận mật khẩu
          </label>
          <input
            type="password"
            id="regConfirmPassword"
            value={confirmPassword}
            onInput={(e) => {
              setConfirmPassword(e.target.value);
              if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: null });
            }}
            placeholder="Nhập lại mật khẩu"
            disabled={isSubmitting}
            autocomplete="new-password"
            class={`form-control ${errors.confirmPassword ? 'input-error' : ''}`}
            required
          />
          {errors.confirmPassword && (
            <div class="form-error">
              <i class="fas fa-exclamation-circle"></i> {errors.confirmPassword}
            </div>
          )}
        </div>
        
        {/* Submit */}
        <button
          type="submit"
          class="btn btn-primary btn-lg btn-block"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <i class="fas fa-spinner fa-spin"></i>{' '}Đang đăng ký...
            </>
          ) : (
            <>
              <i class="fas fa-user-plus"></i>{' '}Đăng ký
            </>
          )}
        </button>
      </form>
      
      {/* Back to login */}
      <div class="register-link" style="text-align: center; margin-top: 12px;">
        <span>Đã có tài khoản? </span>
        <button
          type="button"
          class="link-btn"
          onClick={onBackToLogin}
        >
          Đăng nhập
        </button>
      </div>
    </div>
  );
}
