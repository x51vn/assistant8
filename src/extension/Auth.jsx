/**
 * GPT-047: Auth component (entry point for auth.js)
 * Wraps app with auth checking and login UI
 */
import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
import App from './app.jsx';

function AuthWrapper() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkAuth();

    // Listen for auth state changes
    const listener = (message) => {
      if (message.type === MESSAGE_TYPES.AUTH_STATE_CHANGED) {
        if (message.data?.user) {
          setAuthenticated(true);
          setUser(message.data.user);
        } else {
          setAuthenticated(false);
          setUser(null);
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function checkAuth() {
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (response.data?.authenticated && response.data?.user) {
        setAuthenticated(true);
        setUser(response.data.user);
      } else {
        setAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');

    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setLoginError('Vui lòng nhập email và mật khẩu');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: {
          email: loginForm.email.trim(),
          password: loginForm.password.trim(),
        },
      });

      if (response.errorCode) {
        setLoginError(response.errorMessage || 'Lỗi đăng nhập. Vui lòng thử lại.');
        setLoginForm({ ...loginForm, password: '' });
      } else {
        setAuthenticated(true);
        setUser(response.user || response.data?.user);
        setLoginForm({ email: '', password: '' });
      }
    } catch (error) {
      setLoginError('Lỗi kết nối. Vui lòng thử lại.');
      console.error('Login error:', error);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '32px', color: '#667eea', marginBottom: '16px' }}></i>
          <p style={{ color: '#999', fontSize: '14px' }}>Đang kiểm tra đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', padding: '40px', width: '100%', maxWidth: '360px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '28px' }}>🚀 ChatGPT Assistant</h1>
            <p style={{ margin: '0', color: '#999', fontSize: '13px' }}>Quản lý danh mục & Chat với AI</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="email" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#333' }}>
                📧 Email
              </label>
              <input
                id="email"
                type="email"
                className="text-input"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                placeholder="your@email.com"
                style={{ width: '100%', padding: '10px', fontSize: '13px', boxSizing: 'border-box' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="password" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#333' }}>
                🔐 Mật khẩu
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="text-input"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '10px', fontSize: '13px', boxSizing: 'border-box' }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleLogin(e);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#667eea',
                    fontSize: '13px',
                    padding: '4px 8px',
                  }}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <i className={`fas fa-eye${showPassword ? '-slash' : ''}`}></i>
                </button>
              </div>
            </div>

            {loginError && (
              <div style={{ background: '#ffebee', border: '1px solid #ef5350', borderRadius: '4px', padding: '10px', marginBottom: '16px', fontSize: '12px', color: '#c62828' }}>
                <i className="fas fa-exclamation-circle"></i> {loginError}
              </div>
            )}

            <button
              type="submit"
              className="primary-btn"
              style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: '600' }}
            >
              <i className="fas fa-sign-in-alt"></i> Đăng nhập
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
            <p style={{ margin: '0 0 8px 0' }}>Chưa có tài khoản?</p>
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'none', fontWeight: '600' }}>
              Đăng ký tại Supabase →
            </a>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee', textAlign: 'center', fontSize: '11px', color: '#bbb' }}>
            🔒 Bảo mật bởi Supabase
          </div>
        </div>
      </div>
    );
  }

  // Authenticated - render main app
  return h(App, { user });
}

// Mount auth wrapper
const appContainer = document.getElementById('app');
if (appContainer) {
  render(h(AuthWrapper), appContainer);
}
