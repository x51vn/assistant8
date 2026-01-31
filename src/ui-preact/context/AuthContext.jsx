/**
 * AuthContext - Centralized authentication state management
 * X51LABS-162: Build AuthContext & useAuth Custom Hook
 * 
 * Provides authentication state to entire Preact UI application
 * Uses Context API for state sharing across component tree
 */

import { createContext } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { checkAuthStatus, login, logout, listenAuthStateChanges } from '../api/authApi.js';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check initial auth status on mount
  useEffect(() => {
    const checkInitialAuth = async () => {
      setLoading(true);
      const result = await checkAuthStatus();
      setAuthenticated(result.authenticated);
      setUser(result.user);
      setError(result.error || null);
      setLoading(false);
    };

    checkInitialAuth();
  }, []);

  // Listen for auth state changes from background
  useEffect(() => {
    const cleanup = listenAuthStateChanges(({ authenticated, user }) => {
      setAuthenticated(authenticated);
      setUser(user);
      setError(null);
    });

    return cleanup;
  }, []);

  // Login handler
  const handleLogin = async (email, password) => {
    setLoading(true);
    setError(null);
    const result = await login(email, password);
    setAuthenticated(result.authenticated);
    setUser(result.user);
    setError(result.error || null);
    setLoading(false);
    return result;
  };

  // Logout handler
  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    const result = await logout();
    if (result.success) {
      setAuthenticated(false);
      setUser(null);
    } else {
      setError(result.error || null);
    }
    setLoading(false);
    return result;
  };

  // Check auth status handler
  const handleCheckAuthStatus = async () => {
    setLoading(true);
    const result = await checkAuthStatus();
    setAuthenticated(result.authenticated);
    setUser(result.user);
    setError(result.error || null);
    setLoading(false);
    return result;
  };

  const value = {
    authenticated,
    user,
    loading,
    error,
    login: handleLogin,
    logout: handleLogout,
    checkAuthStatus: handleCheckAuthStatus
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
