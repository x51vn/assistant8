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

// Password policy regex: 8+ chars, 1 upper, 1 lower, 1 digit, 1 special
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;

/**
 * Get password strength info for strength indicator
 * @param {string} password
 * @returns {{ score: number, label: string, color: string }}
 */
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score++;
  
  if (score <= 2) return { score, label: 'Yếu', color: '#e74c3c' };
  if (score <= 4) return { score, label: 'Trung bình', color: '#f39c12' };
  return { score, label: 'Mạnh', color: '#27ae60' };
}

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
              <div class="strength-bar">
                <div 
                  class="strength-fill" 
                  style={`width: ${(strength.score / 6) * 100}%; background-color: ${strength.color};`}
                ></div>
              </div>
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
