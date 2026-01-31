/**
 * UserSection - User info + logout action
 * X51LABS-151: User section integration
 * 
 * ✅ FIX: Uses AuthContext for logout (single source of truth)
 * ✅ FIX: No window.location.reload() - AuthContext handles state
 * ✅ FIX: No duplicate checkAuthStatus - get user from AuthContext
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { showStatus, showConfirm, userEmail, userName, isSaving } from '../state/settingsState.js';
import { useAuth } from '../hooks/useAuth.js';

const MAX_EMAIL_LENGTH = 30;

export function UserSection() {
  // ✅ FIX: Use AuthContext as single source of truth
  const { user, logout } = useAuth();

  // Sync user info to settings state signals (for display only)
  useEffect(() => {
    if (user) {
      const displayName = user.user_metadata?.full_name || user.full_name || '';
      userName.value = displayName;
      userEmail.value = user.email || '';
    } else {
      userName.value = '';
      userEmail.value = 'Not logged in';
    }
  }, [user]);

  const handleLogout = () => {
    if (isSaving.value) {
      showStatus('Đang lưu cài đặt. Vui lòng thử lại sau.', 'info');
      return;
    }

    showConfirm({
      title: 'Xác nhận đăng xuất',
      message: 'Bạn có chắc muốn đăng xuất?',
      confirmText: 'Đăng xuất',
      cancelText: 'Hủy',
      onConfirm: async () => {
        // ✅ FIX: Just call AuthContext logout - it handles loading state
        // NO setGlobalLoading here (AuthContext does it)
        // NO window.location.reload() (AuthContext state change triggers re-render)
        try {
          const result = await logout();
          if (result.success) {
            showStatus('Đăng xuất thành công', 'success');
            // ✅ AuthContext will update authenticated=false
            // ✅ App.jsx will re-render to show LoginForm
            // ✅ No reload needed!
          } else {
            showStatus(result.error || 'Đăng xuất thất bại', 'error');
          }
        } catch (error) {
          console.error('[UserSection] Logout failed:', error);
          showStatus('Không thể đăng xuất. Vui lòng thử lại.', 'error');
        }
      }
    });
  };

  const maskedEmail = maskEmail(userEmail.value);

  return (
    <section class="user-section">
      <div class="user-info">
        <i class="fas fa-user-circle user-avatar" aria-hidden="true"></i>
        <div class="user-details">
          {userName.value ? <div class="user-name">{userName.value}</div> : null}
          <div class="user-email" title={userEmail.value}>{maskedEmail}</div>
        </div>
      </div>
      <button
        type="button"
        class="secondary-btn"
        onClick={handleLogout}
      >
        <i class="fas fa-sign-out-alt"></i> Đăng xuất
      </button>
    </section>
  );
}

function maskEmail(email) {
  if (!email) return '';
  if (email.length <= MAX_EMAIL_LENGTH) return email;
  return `${email.slice(0, MAX_EMAIL_LENGTH - 3)}...`;
}
