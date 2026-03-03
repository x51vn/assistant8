/**
 * ForgotPasswordForm.jsx - Password reset request form
 * XST-751: Implement Password Reset Flow
 * 
 * Features:
 * - Email input for reset request
 * - Security: always shows success (don't reveal if email exists)
 * - Back to login link
 * - Vietnamese messages
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { resetPasswordRequest } from '../../api/authApi.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate email
    if (!email.trim()) {
      setError('Email là bắt buộc');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Email không hợp lệ');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPasswordRequest(email.trim());
      
      if (result.success) {
        setIsSent(true);
      } else {
        // Still show success for security (don't reveal if email exists)
        setIsSent(true);
      }
    } catch (err) {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state - email sent
  if (isSent) {
    return (
      <div class="forgot-password-form">
        <div class="reset-sent-message">
          <i class="fas fa-envelope-open-text reset-icon"></i>
          <h3>Kiểm tra email của bạn</h3>
          <p>
            Nếu email <strong>{email}</strong> tồn tại trong hệ thống, 
            bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.
          </p>
          <p class="reset-note">
            <i class="fas fa-info-circle"></i>
            {' '}Kiểm tra cả thư mục spam nếu không thấy email.
          </p>
        </div>
        <button
          type="button"
          class="link-btn back-to-login"
          onClick={onBackToLogin}
        >
          <i class="fas fa-arrow-left"></i> Quay lại đăng nhập
        </button>
      </div>
    );
  }

  return (
    <div class="forgot-password-form">
      <div class="forgot-header">
        <i class="fas fa-unlock-alt forgot-icon"></i>
        <h3>Quên mật khẩu?</h3>
        <p>Nhập email để nhận link đặt lại mật khẩu</p>
      </div>
      
      {error && (
        <div class="auth-error">
          <i class="fas fa-exclamation-circle"></i> {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div class="form-group">
          <label for="resetEmail">Email</label>
          <input
            type="email"
            id="resetEmail"
            value={email}
            onInput={(e) => setEmail(e.target.value)}
            placeholder="Nhập email đã đăng ký"
            disabled={isSubmitting}
            autocomplete="email"
            autofocus
          />
        </div>
        
        <button
          type="submit"
          class="primary-btn full-width"
          disabled={isSubmitting || !email.trim()}
        >
          {isSubmitting ? (
            <>
              <i class="fas fa-spinner fa-spin"></i>{' '}Đang gửi...
            </>
          ) : (
            <>
              <i class="fas fa-paper-plane"></i>{' '}Gửi email đặt lại
            </>
          )}
        </button>
      </form>
      
      <button
        type="button"
        class="link-btn back-to-login"
        onClick={onBackToLogin}
      >
        <i class="fas fa-arrow-left"></i> Quay lại đăng nhập
      </button>
    </div>
  );
}
