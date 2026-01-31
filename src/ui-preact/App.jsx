/**
 * App.jsx - Root component with authentication gate
 * 
 * Decides whether to show LoginForm or SettingsPage based on auth state
 * 
 * X51LABS-170: Auth gate for Preact UI
 * X51LABS: Single global loading bar for entire extension
 */

import { h } from 'preact';
import { useAuth } from './hooks/useAuth.js';
import { LoginForm } from './components/auth/LoginForm.jsx';
import { MainApp } from './components/MainApp.jsx';
import { globalLoading, loadingMessage } from './state/appState.js';

/**
 * App - Root component
 * 
 * Flow:
 * 1. Load auth state from background (via useAuth)
 * 2. If not authenticated → show LoginForm
 * 3. If authenticated → show MainApp (with navigation & pages)
 * 4. Global loading overlay shown on top when globalLoading.value === true
 */
export function App() {
  const { authenticated } = useAuth();  // NOTE: NO loading from useAuth, use globalLoading
  
  console.log('[App] Render - authenticated:', authenticated, 'globalLoading:', globalLoading.value);

  // ✅ Single global loading overlay (works for both login and MainApp)
  return (
    <>
      {/* Render login or main app based on auth state */}
      {!authenticated ? (
        <div class="auth-container">
          <div class="auth-card">
            <div class="auth-header">
              <h1>ChatGPT Assistant</h1>
              <p>Đăng nhập để tiếp tục</p>
            </div>
            <LoginForm />
          </div>
        </div>
      ) : (
        <MainApp />
      )}
      
      {/* ✅ SINGLE global loading overlay - NO DUPLICATE */}
      {globalLoading.value && (
        <div class="global-loading-overlay">
          <i class="fas fa-spinner fa-spin loading-spinner"></i>
          <p class="loading-message">{loadingMessage.value}</p>
        </div>
      )}
    </>
  );
}
