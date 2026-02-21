/**
 * EmailVerificationPending.jsx - Email verification pending screen
 * XST-752: Email Verification on Registration
 * 
 * Features:
 * - Pending verification status display
 * - Resend confirmation email with 60s cooldown
 * - Back to login navigation
 * - Vietnamese messages
 */

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { resendConfirmation } from '../../api/authApi.js';

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationPending({ email, onBackToLogin }) {
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownRef = useRef(null);

  // Cleanup cooldown timer
  useEffect(() => {
    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
      }
    };
  }, []);

  const startCooldown = () => {
    setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (cooldownSeconds > 0 || isResending) return;
    
    setIsResending(true);
    setResendMessage(null);
    
    try {
      const result = await resendConfirmation(email);
      
      if (result.success) {
        setResendMessage({ type: 'success', text: 'Email xác nhận đã được gửi lại!' });
        startCooldown();
      } else {
        setResendMessage({ type: 'error', text: result.error || 'Gửi lại thất bại' });
      }
    } catch (err) {
      setResendMessage({ type: 'error', text: 'Đã có lỗi xảy ra. Vui lòng thử lại.' });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div class="email-verification-pending">
      <div class="verification-icon">
        <i class="fas fa-envelope-open-text"></i>
      </div>
      
      <h2>Xác nhận email</h2>
      
      <p class="verification-message">
        Chúng tôi đã gửi email xác nhận đến:
      </p>
      <p class="verification-email">
        <strong>{email}</strong>
      </p>
      <p class="verification-instruction">
        Vui lòng kiểm tra hộp thư và nhấn vào link xác nhận để kích hoạt tài khoản.
      </p>
      
      <div class="verification-tips">
        <p>
          <i class="fas fa-info-circle"></i>
          {' '}Kiểm tra cả thư mục <strong>Spam</strong> nếu không thấy email.
        </p>
      </div>
      
      {resendMessage && (
        <div class={`status-message status-${resendMessage.type}`}>
          <i class={`fas ${resendMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          {' '}{resendMessage.text}
        </div>
      )}
      
      <div class="verification-actions">
        <button
          type="button"
          class="btn btn-secondary"
          onClick={handleResend}
          disabled={isResending || cooldownSeconds > 0}
        >
          {isResending ? (
            <>
              <i class="fas fa-spinner fa-spin"></i>{' '}Đang gửi...
            </>
          ) : cooldownSeconds > 0 ? (
            <>
              <i class="fas fa-clock"></i>{' '}Gửi lại ({cooldownSeconds}s)
            </>
          ) : (
            <>
              <i class="fas fa-redo"></i>{' '}Gửi lại email xác nhận
            </>
          )}
        </button>
        
        <button
          type="button"
          class="link-btn back-to-login"
          onClick={onBackToLogin}
        >
          <i class="fas fa-arrow-left"></i> Quay lại đăng nhập
        </button>
      </div>
    </div>
  );
}
