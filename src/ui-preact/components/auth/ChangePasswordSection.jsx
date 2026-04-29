/**
 * ChangePasswordSection.jsx - Change password form for Settings page
 * XST-754: Implement Change Password in Settings
 * 
 * Features:
 * - Current password verification
 * - New password with strength validation (8+, upper, lower, digit, special)
 * - Confirm password matching
 * - Hidden for Google OAuth users
 * - Vietnamese messages
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useAuth } from '../../hooks/useAuth.js';
import { changePassword } from '../../api/authApi.js';
import { getPasswordStrength, PASSWORD_REGEX } from '../../utils/passwordStrength.js';
import { ProgressBar } from '../ProgressBar.jsx';

/**
 * Validate password meets policy requirements
 * @param {string} password
 * @returns {string|null} Error message or null if valid
 */
function validateNewPassword(password) {
  if (!password) return 'Mật khẩu mới là bắt buộc';
  if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
  if (!PASSWORD_REGEX.test(password)) {
    return 'Mật khẩu phải có: 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt';
  }
  return null;
}

export function ChangePasswordSection() {
  const { user } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  // Hide for Google OAuth users (they don't have a password to change)
  const isOAuthUser = user?.app_metadata?.provider === 'google' 
    || user?.app_metadata?.providers?.includes('google')
    || user?.user_metadata?.iss?.includes('google');
  
  if (isOAuthUser) return null;
  
  const strength = getPasswordStrength(newPassword);
  
  const clearForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
    setShowCurrentPassword(false);
    setShowNewPassword(false);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Client-side validation
    const newErrors = {};
    
    if (!currentPassword) {
      newErrors.currentPassword = 'Mật khẩu hiện tại là bắt buộc';
    }
    
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      newErrors.newPassword = passwordError;
    }
    
    if (currentPassword && newPassword && currentPassword === newPassword) {
      newErrors.newPassword = 'Mật khẩu mới không được trùng với mật khẩu hiện tại';
    }
    
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu mới';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setStatusMessage(null);
    setIsSubmitting(true);
    
    try {
      const result = await changePassword(currentPassword, newPassword);
      
      if (result.success) {
        setStatusMessage({ type: 'success', text: 'Mật khẩu đã được đổi thành công!' });
        clearForm();
      } else {
        // Map backend error to specific field if possible
        if (result.error?.includes('hiện tại không đúng') || result.error?.includes('credentials')) {
          setErrors({ currentPassword: 'Mật khẩu hiện tại không đúng' });
        } else {
          setStatusMessage({ type: 'error', text: result.error || 'Đổi mật khẩu thất bại' });
        }
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: 'Đã có lỗi xảy ra. Vui lòng thử lại.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section class="change-password-section">
      <h3 class="section-title">
        <i class="fas fa-key" aria-hidden="true"></i>
        {' '}Đổi mật khẩu
      </h3>
      
      {statusMessage && (
        <div class={`status-message status-${statusMessage.type}`}>
          <i class={`fas ${statusMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          {' '}{statusMessage.text}
        </div>
      )}
      
      <form onSubmit={handleSubmit} class="change-password-form">
        {/* Current Password */}
        <div class="form-group">
          <label for="currentPassword">Mật khẩu hiện tại</label>
          <div class="password-input-wrapper">
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              id="currentPassword"
              value={currentPassword}
              onInput={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại"
              disabled={isSubmitting}
              class={errors.currentPassword ? 'input-error' : ''}
              autocomplete="current-password"
            />
            <button
              type="button"
              class="toggle-password-btn"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              title={showCurrentPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              <i class={`fas ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
          {errors.currentPassword && (
            <span class="field-error">{errors.currentPassword}</span>
          )}
        </div>
        
        {/* New Password */}
        <div class="form-group">
          <label for="newPassword">Mật khẩu mới</label>
          <div class="password-input-wrapper">
            <input
              type={showNewPassword ? 'text' : 'password'}
              id="newPassword"
              value={newPassword}
              onInput={(e) => setNewPassword(e.target.value)}
              placeholder="Ít nhất 8 ký tự"
              disabled={isSubmitting}
              class={errors.newPassword ? 'input-error' : ''}
              autocomplete="new-password"
            />
            <button
              type="button"
              class="toggle-password-btn"
              onClick={() => setShowNewPassword(!showNewPassword)}
              title={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              <i class={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
          {newPassword && (
            <div class="password-strength">
              <ProgressBar
                ariaLabel="Độ mạnh mật khẩu mới"
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
          {errors.newPassword && (
            <span class="field-error">{errors.newPassword}</span>
          )}
          <div class="password-requirements">
            <small>Yêu cầu: 8+ ký tự, chữ hoa, chữ thường, chữ số, ký tự đặc biệt</small>
          </div>
        </div>
        
        {/* Confirm Password */}
        <div class="form-group">
          <label for="confirmPassword">Xác nhận mật khẩu mới</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onInput={(e) => setConfirmPassword(e.target.value)}
            placeholder="Nhập lại mật khẩu mới"
            disabled={isSubmitting}
            class={errors.confirmPassword ? 'input-error' : ''}
            autocomplete="new-password"
          />
          {errors.confirmPassword && (
            <span class="field-error">{errors.confirmPassword}</span>
          )}
        </div>
        
        <button
          type="submit"
          class="primary-btn"
          disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
        >
          {isSubmitting ? (
            <>
              <i class="fas fa-spinner fa-spin"></i>{' '}Đang đổi...
            </>
          ) : (
            <>
              <i class="fas fa-lock"></i>{' '}Đổi mật khẩu
            </>
          )}
        </button>
      </form>
    </section>
  );
}
