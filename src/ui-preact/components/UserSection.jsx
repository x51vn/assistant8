/**
 * UserSection - User info + logout action
 * X51LABS-151: User section integration
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { checkAuthStatus, logout } from '../api/authApi.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { showStatus, showConfirm, userEmail, userName, isAuthLoading, isSaving } from '../state/settingsState.js';

const MAX_EMAIL_LENGTH = 30;

export function UserSection() {
  useEffect(() => {
    const loadUser = async () => {
      isAuthLoading.value = true;
      try {
        const { authenticated, user } = await checkAuthStatus();
        if (authenticated && user) {
          const displayName = user.user_metadata?.full_name || user.full_name || '';
          userName.value = displayName;
          userEmail.value = user.email || '';
        } else {
          userName.value = '';
          userEmail.value = 'Not logged in';
        }
      } catch (error) {
        console.error('[UserSection] Failed to load user info:', error);
        userName.value = '';
        userEmail.value = 'Error loading user';
      } finally {
        isAuthLoading.value = false;
      }
    };

    loadUser();

    const handleAuthChange = (message) => {
      if (message?.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
        const user = message.data?.user || null;
        if (user) {
          const displayName = user.user_metadata?.full_name || user.full_name || '';
          userName.value = displayName;
          userEmail.value = user.email || '';
        } else {
          userName.value = '';
          userEmail.value = 'Not logged in';
          // Auth gate may reload UI; force refresh to ensure clean state
          setTimeout(() => {
            window.location.reload();
          }, 200);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleAuthChange);

    return () => {
      chrome.runtime.onMessage.removeListener(handleAuthChange);
    };
  }, []);

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
        isAuthLoading.value = true;
        try {
          const result = await logout();
          if (result.success) {
            showStatus('Đăng xuất thành công', 'success');
          } else {
            showStatus(result.error || 'Đăng xuất thất bại', 'error');
          }
        } catch (error) {
          console.error('[UserSection] Logout failed:', error);
          showStatus('Không thể đăng xuất. Vui lòng thử lại.', 'error');
        } finally {
          isAuthLoading.value = false;
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
        class="secondary-btn logout-btn"
        onClick={handleLogout}
        disabled={isAuthLoading.value}
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
