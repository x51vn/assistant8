/**
 * SupabaseAuthForm.jsx - Supabase Authentication Component
 *
 * Features:
 * - Login form (email, password)
 * - Register form (email, password, name, language, timezone)
 * - Form validation (password strength, email format)
 * - Token display/copy UI (access_token, refresh_token)
 * - User profile section (email, name, last login, user status)
 * - Logout button with confirmation modal
 * - Error message display (Vietnamese)
 * - Token persistence via chrome.storage.local
 *
 * XST-740: Build Settings Authentication UI Page
 */

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { MESSAGE_TYPES } from '../../../shared/messageSchema.js';

// Validation constants
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$/;

/**
 * Validate email format
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
 * Validate password strength (min 8 chars, 1 upper, 1 lower, 1 digit, 1 special)
 */
function validatePassword(password) {
  if (!password || password.length === 0) {
    return 'Mật khẩu là bắt buộc';
  }
  if (password.length < 8) {
    return 'Mật khẩu phải có ít nhất 8 ký tự';
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'Mật khẩu phải có: 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt (!@#$...)';
  }
  return null;
}

/**
 * Send message to background handler
 */
async function sendMessage(type, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        v: 1,
        type,
        data,
        correlationId: `${type}-${Date.now()}`,
        timestamp: Date.now()
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.errorCode) {
          reject(new Error(response.message || 'Lỗi khi xác thực'));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * SupabaseAuthForm - Supabase authentication UI component
 */
export function SupabaseAuthForm() {
  // Tab state (login vs register)
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState({});
  
  // Register form state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
  const [regName, setRegName] = useState('');
  const [regLanguage, setRegLanguage] = useState('vi');
  const [regTimezone, setRegTimezone] = useState('Asia/Ho_Chi_Minh');
  const [regErrors, setRegErrors] = useState({});
  
  // Loading and error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // User profile state
  const [userProfile, setUserProfile] = useState({
    email: '',
    accessToken: '',
    refreshToken: '',
    lastLogin: null
  });
  
  // Confirmation dialog state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const tokenCopyRef = useRef(null);
  
  // Load auth state on mount
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const items = await new Promise((resolve) => {
          chrome.storage.local.get([
            'xneews_access_token',
            'xneews_refresh_token',
            'xneews_user_email',
            'xneews_last_login'
          ], resolve);
        });
        
        if (items.xneews_access_token && items.xneews_user_email) {
          setIsAuthenticated(true);
          setUserProfile({
            email: items.xneews_user_email,
            accessToken: items.xneews_access_token,
            refreshToken: items.xneews_refresh_token,
            lastLogin: items.xneews_last_login
          });
        }
      } catch (error) {
        console.error('[XneewsAuthForm] Failed to load auth state:', error);
      }
    };
    
    loadAuthState();
  }, []);
  
  // Handle login form submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    setSuccessMessage(null);
    
    // Client-side validation
    const errors = {};
    const emailErr = validateEmail(loginEmail);
    if (emailErr) errors.email = emailErr;
    if (!loginPassword) errors.password = 'Mật khẩu là bắt buộc';
    
    setLoginErrors(errors);
    if (Object.keys(errors).length > 0) return;
    
    setIsSubmitting(true);
    try {
      const response = await sendMessage(MESSAGE_TYPES.XNEEWS_AUTH_LOGIN, {
        email: loginEmail.trim(),
        password: loginPassword
      });
      
      if (response && response.type === MESSAGE_TYPES.XNEEWS_AUTH_SUCCESS) {
        setSuccessMessage('Đăng nhập thành công! ✅');
        setIsAuthenticated(true);
        setUserProfile({
          email: response.email,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          lastLogin: new Date().toISOString()
        });
        
        // Clear form
        setLoginEmail('');
        setLoginPassword('');
        setLoginErrors({});
        
        // Hide message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (error) {
      setApiError(error.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
      console.error('[XneewsAuthForm] Login error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle register form submission
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    setSuccessMessage(null);
    
    // Client-side validation
    const errors = {};
    const emailErr = validateEmail(regEmail);
    if (emailErr) errors.email = emailErr;

    const passwordErr = validatePassword(regPassword);
    if (passwordErr) errors.password = passwordErr;
    
    if (regPassword !== regPasswordConfirm) {
      errors.passwordConfirm = 'Mật khẩu xác nhận không khớp';
    }
    
    if (!regName || regName.trim().length === 0) {
      errors.name = 'Tên là bắt buộc';
    }
    
    setRegErrors(errors);
    if (Object.keys(errors).length > 0) return;
    
    setIsSubmitting(true);
    try {
      const response = await sendMessage(MESSAGE_TYPES.XNEEWS_AUTH_REGISTER, {
        email: regEmail.trim(),
        password: regPassword,
        name: regName.trim(),
        language: regLanguage,
        timezone: regTimezone
      });
      
      if (response && response.type === MESSAGE_TYPES.XNEEWS_AUTH_SUCCESS) {
        setSuccessMessage('Đăng ký thành công! ✅');
        setIsAuthenticated(true);
        setUserProfile({
          email: response.email,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          lastLogin: new Date().toISOString()
        });
        
        // Clear form
        setRegEmail('');
        setRegPassword('');
        setRegPasswordConfirm('');
        setRegName('');
        setRegLanguage('vi');
        setRegTimezone('Asia/Ho_Chi_Minh');
        setRegErrors({});
        
        // Hide message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (error) {
      setApiError(error.message || 'Đăng ký thất bại. Vui lòng thử lại.');
      console.error('[XneewsAuthForm] Register error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle logout
  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setApiError(null);
    setSuccessMessage(null);
    
    setIsSubmitting(true);
    try {
      await sendMessage(MESSAGE_TYPES.XNEEWS_AUTH_LOGOUT, {});
      
      setSuccessMessage('Đã đăng xuất ✅');
      setIsAuthenticated(false);
      setUserProfile({
        email: '',
        accessToken: '',
        refreshToken: '',
        lastLogin: null
      });
      
      // Switch back to login tab
      setActiveTab('login');
      
      // Hide message after 2 seconds
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      setApiError(error.message || 'Đăng xuất thất bại. Vui lòng thử lại.');
      console.error('[XneewsAuthForm] Logout error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle copy to clipboard
  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      const reference = field === 'access' ? tokenCopyRef.current : null;
      if (reference) {
        reference.textContent = 'Đã sao chép ✓';
        setTimeout(() => {
          reference.textContent = 'Sao chép';
        }, 2000);
      }
    }).catch(() => {
      setApiError('Không thể sao chép. Vui lòng thử lại.');
    });
  };
  
  // Render unauthenticated UI (forms)
  if (!isAuthenticated) {
    return (
      <div class="xneews-auth-form">
        <div class="auth-tabs">
          <button
            class={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('login');
              setApiError(null);
              setSuccessMessage(null);
            }}
          >
            <i class="fas fa-sign-in-alt"></i> Đăng nhập
          </button>
          <button
            class={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('register');
              setApiError(null);
              setSuccessMessage(null);
            }}
          >
            <i class="fas fa-user-plus"></i> Đăng ký
          </button>
        </div>
        
        {/* Success Message */}
        {successMessage && (
          <div class="alert alert-success">
            <i class="fas fa-check-circle"></i> {successMessage}
          </div>
        )}
        
        {/* API Error */}
        {apiError && (
          <div class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i> {apiError}
          </div>
        )}
        
        {/* Login Form */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} class="auth-form">
            <div class="form-group">
              <label for="login-email">
                <i class="fas fa-envelope"></i> Email
              </label>
              <input
                type="email"
                id="login-email"
                value={loginEmail}
                onInput={(e) => {
                  setLoginEmail(e.target.value);
                  if (loginErrors.email) setLoginErrors({ ...loginErrors, email: null });
                }}
                placeholder="your@email.com"
                disabled={isSubmitting}
                class={loginErrors.email ? 'input-error' : ''}
              />
              {loginErrors.email && (
                <span class="form-error-text">{loginErrors.email}</span>
              )}
            </div>
            
            <div class="form-group">
              <label for="login-password">
                <i class="fas fa-lock"></i> Mật khẩu
              </label>
              <input
                type="password"
                id="login-password"
                value={loginPassword}
                onInput={(e) => {
                  setLoginPassword(e.target.value);
                  if (loginErrors.password) setLoginErrors({ ...loginErrors, password: null });
                }}
                placeholder="••••••••"
                disabled={isSubmitting}
                class={loginErrors.password ? 'input-error' : ''}
              />
              {loginErrors.password && (
                <span class="form-error-text">{loginErrors.password}</span>
              )}
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting}
              class="btn btn-primary btn-block"
            >
              {isSubmitting ? (
                <><i class="fas fa-spinner fa-spin"></i> Đang đăng nhập...</>
              ) : (
                <><i class="fas fa-sign-in-alt"></i> Đăng nhập</>
              )}
            </button>
          </form>
        )}
        
        {/* Register Form */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} class="auth-form">
            <div class="form-group">
              <label for="reg-email">
                <i class="fas fa-envelope"></i> Email
              </label>
              <input
                type="email"
                id="reg-email"
                value={regEmail}
                onInput={(e) => {
                  setRegEmail(e.target.value);
                  if (regErrors.email) setRegErrors({ ...regErrors, email: null });
                }}
                placeholder="your@email.com"
                disabled={isSubmitting}
                class={regErrors.email ? 'input-error' : ''}
              />
              {regErrors.email && (
                <span class="form-error-text">{regErrors.email}</span>
              )}
            </div>
            
            <div class="form-group">
              <label for="reg-name">
                <i class="fas fa-user"></i> Tên
              </label>
              <input
                type="text"
                id="reg-name"
                value={regName}
                onInput={(e) => {
                  setRegName(e.target.value);
                  if (regErrors.name) setRegErrors({ ...regErrors, name: null });
                }}
                placeholder="Tên của bạn"
                disabled={isSubmitting}
                class={regErrors.name ? 'input-error' : ''}
              />
              {regErrors.name && (
                <span class="form-error-text">{regErrors.name}</span>
              )}
            </div>
            
            <div class="form-group">
              <label for="reg-password">
                <i class="fas fa-lock"></i> Mật khẩu
              </label>
              <input
                type="password"
                id="reg-password"
                value={regPassword}
                onInput={(e) => {
                  setRegPassword(e.target.value);
                  if (regErrors.password) setRegErrors({ ...regErrors, password: null });
                }}
                placeholder="••••••••"
                disabled={isSubmitting}
                class={regErrors.password ? 'input-error' : ''}
              />
              <small class="form-help">
                Tối thiểu 8 ký tự: 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt
              </small>
              {regErrors.password && (
                <span class="form-error-text">{regErrors.password}</span>
              )}
            </div>
            
            <div class="form-group">
              <label for="reg-password-confirm">
                <i class="fas fa-lock"></i> Xác nhận mật khẩu
              </label>
              <input
                type="password"
                id="reg-password-confirm"
                value={regPasswordConfirm}
                onInput={(e) => {
                  setRegPasswordConfirm(e.target.value);
                  if (regErrors.passwordConfirm) setRegErrors({ ...regErrors, passwordConfirm: null });
                }}
                placeholder="••••••••"
                disabled={isSubmitting}
                class={regErrors.passwordConfirm ? 'input-error' : ''}
              />
              {regErrors.passwordConfirm && (
                <span class="form-error-text">{regErrors.passwordConfirm}</span>
              )}
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="reg-language">Ngôn ngữ</label>
                <select
                  id="reg-language"
                  value={regLanguage}
                  onChange={(e) => setRegLanguage(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                  <option value="zh">中文</option>
                  <option value="ko">한국어</option>
                </select>
              </div>
              <div class="form-group">
                <label for="reg-timezone">Múi giờ</label>
                <select
                  id="reg-timezone"
                  value={regTimezone}
                  onChange={(e) => setRegTimezone(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho Chi Minh (Việt Nam)</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (Nhật)</option>
                  <option value="Asia/Shanghai">Asia/Shanghai (Trung)</option>
                </select>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting}
              class="btn btn-primary btn-block"
            >
              {isSubmitting ? (
                <><i class="fas fa-spinner fa-spin"></i> Đang đăng ký...</>
              ) : (
                <><i class="fas fa-user-plus"></i> Đăng ký</>
              )}
            </button>
          </form>
        )}
      </div>
    );
  }
  
  // Render authenticated UI (profile + tokens)
  return (
    <div class="xneews-auth-form authenticated">
      <div class="profile-section">
        <div class="profile-header">
          <div class="profile-avatar">
            <i class="fas fa-user-circle"></i>
          </div>
          <div class="profile-info">
            <h3 class="profile-email">{userProfile.email}</h3>
            <small class="profile-timestamp">
              {userProfile.lastLogin ? 
                `Đăng nhập: ${new Date(userProfile.lastLogin).toLocaleString('vi-VN')}` :
                'Vừa đăng nhập'}
            </small>
          </div>
        </div>
        
        {/* Token Display */}
        <div class="token-section">
          <h4>Access Token</h4>
          <div class="token-display">
            <code class="token-value">
              {userProfile.accessToken.substring(0, 20)}...
            </code>
            <button
              type="button"
              class="btn-copy"
              onClick={() => copyToClipboard(userProfile.accessToken, 'access')}
              ref={tokenCopyRef}
              title="Sao chép token"
            >
              <i class="fas fa-copy"></i> Sao chép
            </button>
          </div>
        </div>
        
        {/* Logout Button */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => setShowLogoutConfirm(true)}
          class="btn btn-danger btn-block"
        >
          {isSubmitting ? (
            <><i class="fas fa-spinner fa-spin"></i> Đang đăng xuất...</>
          ) : (
            <><i class="fas fa-sign-out-alt"></i> Đăng xuất</>
          )}
        </button>
      </div>
      
      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div class="modal-overlay" onClick={() => !isSubmitting && setShowLogoutConfirm(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Xác nhận đăng xuất</h3>
              <button
                type="button"
                class="modal-close"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>
            <div class="modal-body">
              <p>Bạn có chắc chắn muốn đăng xuất không?</p>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-default"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="button"
                class="btn btn-danger"
                onClick={handleLogout}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Đang xử lýy...' : 'Đăng xuất'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
