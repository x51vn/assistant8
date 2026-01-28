/**
 * Auth UI Module - Login/Logout UX
 * GPT-008: UI auth gate + login UX
 * 
 * Responsibilities:
 * - Check auth status on UI load
 * - Render login screen if not authenticated
 * - Handle login form submission
 * - Handle logout action
 * - Broadcast auth state changes to other UI modules
 */

import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

/**
 * Check if user is authenticated
 * @returns {Promise<{authenticated: boolean, user: Object|null}>}
 */
export async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode) {
      console.error('[Auth] Auth check failed:', response.errorMessage);
      return { authenticated: false, user: null };
    }

    return {
      authenticated: response.data?.authenticated || false,
      user: response.data?.user || null
    };
  } catch (error) {
    console.error('[Auth] Failed to check auth status:', error);
    return { authenticated: false, user: null };
  }
}

/**
 * Login with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function login(email, password) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { email, password }
    });

    if (response.errorCode) {
      console.error('[Auth] Login failed:', response.errorMessage);
      return {
        success: false,
        error: response.errorMessage || 'Đăng nhập thất bại'
      };
    }

    return {
      success: true,
      user: response.data?.user
    };
  } catch (error) {
    console.error('[Auth] Login request failed:', error);
    return {
      success: false,
      error: 'Không thể kết nối. Vui lòng thử lại.'
    };
  }
}

/**
 * Logout current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logout() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode) {
      console.error('[Auth] Logout failed:', response.errorMessage);
      return {
        success: false,
        error: response.errorMessage || 'Đăng xuất thất bại'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[Auth] Logout request failed:', error);
    return {
      success: false,
      error: 'Không thể kết nối. Vui lòng thử lại.'
    };
  }
}

/**
 * Render login screen
 * @param {HTMLElement} container - Container element to render login screen
 * @param {Function} onLoginSuccess - Callback when login succeeds
 */
export function renderLoginScreen(container, onLoginSuccess) {
  if (!container) {
    console.error('[Auth] No container provided for login screen');
    return;
  }

  container.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h1>ChatGPT Assistant</h1>
          <p>Vui lòng đăng nhập để tiếp tục</p>
        </div>
        
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input 
              type="email" 
              id="loginEmail" 
              class="form-input" 
              placeholder="your@email.com"
              required
              autocomplete="email"
            />
          </div>
          
          <div class="form-group">
            <label for="loginPassword">Mật khẩu</label>
            <input 
              type="password" 
              id="loginPassword" 
              class="form-input" 
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>
          
          <div id="loginError" class="error-message" style="display: none;"></div>
          
          <button type="submit" id="loginBtn" class="primary-btn">
            <span class="btn-text">Đăng nhập</span>
            <span class="btn-spinner" style="display: none;">
              <i class="fas fa-spinner fa-spin"></i>
            </span>
          </button>
        </form>
        
        <div class="auth-footer">
          <p class="auth-note"><i class="fas fa-info-circle"></i> made by x51.vn</p>
        </div>
      </div>
    </div>
  `;

  // Setup form handler
  const form = container.querySelector('#loginForm');
  const emailInput = container.querySelector('#loginEmail');
  const passwordInput = container.querySelector('#loginPassword');
  const loginBtn = container.querySelector('#loginBtn');
  const btnText = loginBtn.querySelector('.btn-text');
  const btnSpinner = loginBtn.querySelector('.btn-spinner');
  const errorDiv = container.querySelector('#loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }

    // Show loading state
    loginBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline';
    hideError();

    // Attempt login
    const result = await login(email, password);

    if (result.success) {
      console.log('[Auth] Login successful, user:', result.user);
      
      // Clear form
      form.reset();
      
      // Callback to reload UI
      if (onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } else {
      // Show error
      showError(result.error || 'Đăng nhập thất bại');
      
      // Reset button state
      loginBtn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
      
      // Focus password for retry
      passwordInput.select();
    }
  });

  function showError(message) {
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  function hideError() {
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  // Focus email input on render
  emailInput.focus();
}

/**
 * Hide login screen and show main UI
 * @param {HTMLElement} container - Container element
 */
export function hideLoginScreen(container) {
  if (container) {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

/**
 * Listen for auth state changes from background
 * @param {Function} callback - Called when auth state changes
 */
export function listenAuthStateChanges(callback) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
      console.log('[Auth] Auth state changed:', message.data);
      callback({
        user: message.data?.user || null,
        authenticated: !!message.data?.user
      });
    }
  });
}
