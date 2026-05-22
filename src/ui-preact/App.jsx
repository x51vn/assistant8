/**
 * App.jsx - Root component with authentication gate
 * 
 * Decides whether to show LoginForm, RegisterForm, ForgotPassword, or MainApp
 * 
 * X51LABS-170: Auth gate for Preact UI
 * X51LABS: Single global loading indicator for entire extension
 * XST-751: Password Reset Flow
 * XST-752: Email Verification
 * XST-756: Unified Auth (Login + Register)
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useAuth } from './hooks/useAuth.js';
import { LoginForm } from './components/auth/LoginForm.jsx';
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm.jsx';
import { RegisterForm } from './components/auth/RegisterForm.jsx';
import { EmailVerificationPending } from './components/auth/EmailVerificationPending.jsx';
import { MainApp } from './components/MainApp.jsx';
import { SubscriptionProvider } from './context/SubscriptionContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { globalLoading, loadingMessage } from './state/appState.js';

/**
 * Auth view states
 * @type {'login' | 'forgot-password' | 'register' | 'email-verification'}
 */

/**
 * App - Root component
 * 
 * Flow:
 * 1. Load auth state from background (via useAuth)
 * 2. If not authenticated → show auth flow (login/register/forgot)
 * 3. If authenticated → show MainApp (with navigation & pages)
 * 4. Global loading overlay shown on top when globalLoading.value === true
 */
export function App() {
  const { authenticated } = useAuth();
  const [authView, setAuthView] = useState('login');
  const [pendingEmail, setPendingEmail] = useState('');
  
  console.log('[App] Render - authenticated:', authenticated, 'authView:', authView, 'globalLoading:', globalLoading.value);

  /**
   * Render auth view based on current state
   */
  const renderAuthView = () => {
    switch (authView) {
      case 'forgot-password':
        return (
          <div class="auth-card">
            <ForgotPasswordForm 
              onBackToLogin={() => setAuthView('login')} 
            />
          </div>
        );
      
      case 'register':
        return (
          <div class="auth-card">
            <RegisterForm 
              onBackToLogin={() => setAuthView('login')}
              onRegistered={(email) => {
                setPendingEmail(email);
                setAuthView('email-verification');
              }}
            />
          </div>
        );
      
      case 'email-verification':
        return (
          <div class="auth-card">
            <EmailVerificationPending 
              email={pendingEmail}
              onBackToLogin={() => setAuthView('login')}
            />
          </div>
        );
      
      default: // 'login'
        return (
          <div class="auth-card">
            <div class="auth-header">
              <h1>Assistant8</h1>
              <p>Đăng nhập để tiếp tục</p>
            </div>
            <LoginForm 
              onForgotPassword={() => setAuthView('forgot-password')}
              onRegister={() => setAuthView('register')}
            />
          </div>
        );
    }
  };

  return (
    <>
      {!authenticated ? (
        <div class="auth-container">
          {renderAuthView()}
        </div>
      ) : (
        <ThemeProvider>
          <ToastProvider>
            <SubscriptionProvider>
              <MainApp />
            </SubscriptionProvider>
          </ToastProvider>
        </ThemeProvider>
      )}
      
      {/* SINGLE global loading overlay */}
      {globalLoading.value && (
        <div class="global-loading-overlay">
          <i class="fas fa-spinner fa-spin loading-spinner"></i>
          <p class="loading-message">{loadingMessage.value}</p>
        </div>
      )}
    </>
  );
}
