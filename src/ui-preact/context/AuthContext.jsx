/**
 * AuthContext - Centralized authentication state management
 * X51LABS-162: Build AuthContext & useAuth Custom Hook
 * X51LABS: Use global loading state (NO local loading)
 * 
 * Provides authentication state to entire Preact UI application
 * Uses Context API for state sharing across component tree
 */

import { createContext } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { checkAuthStatus, login, logout, listenAuthStateChanges } from '../api/authApi.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';

/**
 * Auth context shape:
 * @typedef {Object} AuthContextValue
 * @property {boolean} authenticated - Whether user is logged in
 * @property {Object|null} user - Current user object (id, email, metadata)
 * @property {boolean} loading - Loading state during auth operations
 * @property {string|null} error - Error message if auth operation failed
 * @property {Function} login - Login function
 * @property {Function} logout - Logout function
 * @property {Function} checkAuthStatus - Check current auth status
 */

export const AuthContext = createContext(null);

/**
 * AuthProvider - Wraps app to provide auth state
 * @param {Object} props
 * @param {import('preact').ComponentChildren} props.children - Child components
 */
export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  // NOTE: NO local loading state - use global loading from appState.js
  const [error, setError] = useState(null);
  
  // ✅ Track if initial auth check is done to avoid duplicate states
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // Check initial auth status on mount
  // This runs ONCE on mount to check if user is already logged in
  useEffect(() => {
    const checkInitialAuth = async () => {
      setGlobalLoading(true, 'Đang kiểm tra đăng nhập...');
      const result = await checkAuthStatus();
      
      // Only update state if listener hasn't already done it
      if (!initialCheckDone) {
        setAuthenticated(result.authenticated);
        setUser(result.user);
        setError(result.error || null);
        setInitialCheckDone(true);
      }
      
      hideLoading();
    };

    checkInitialAuth();
  }, []);

  // Listen for auth state changes from background
  // This handles: login, logout, token refresh, session restore
  useEffect(() => {
    const cleanup = listenAuthStateChanges(({ authenticated, user }) => {
      console.log('[AuthContext] Auth state changed via listener:', { authenticated, hasUser: !!user });
      setAuthenticated(authenticated);
      setUser(user);
      setError(null);
      setInitialCheckDone(true); // Mark as done so initial check won't override
    });

    return cleanup;
  }, []);

  // Login handler
  const handleLogin = async (email, password) => {
    console.log('[AuthContext] Starting login...');
    setGlobalLoading(true, 'Đang đăng nhập...');
    setError(null);
    const result = await login(email, password);
    console.log('[AuthContext] Login result:', { authenticated: result.authenticated, user: result.user, error: result.error });
    
    // ✅ FIX: Don't set state here - listenAuthStateChanges will handle it
    // This prevents double render/flash on login
    // Only set error if login failed
    if (result.error) {
      setError(result.error);
    }
    
    hideLoading();
    console.log('[AuthContext] Login complete, waiting for auth state broadcast');
    return result;
  };

  // Logout handler
  const handleLogout = async () => {
    setGlobalLoading(true, 'Đang đăng xuất...');
    setError(null);
    const result = await logout();
    
    // ✅ FIX: Don't set state here - listenAuthStateChanges will handle it
    // This prevents double render/flash on logout
    // Only set error if logout failed
    if (!result.success) {
      setError(result.error || null);
    }
    
    hideLoading();
    return result;
  };

  // Check auth status handler
  const handleCheckAuthStatus = async () => {
    setGlobalLoading(true, 'Đang kiểm tra trạng thái...');
    const result = await checkAuthStatus();
    setAuthenticated(result.authenticated);
    setUser(result.user);
    setError(result.error || null);
    hideLoading();
    return result;
  };

  const value = {
    authenticated,
    user,
    // NOTE: loading removed - use globalLoading from appState.js
    error,
    login: handleLogin,
    logout: handleLogout,
    checkAuthStatus: handleCheckAuthStatus
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
