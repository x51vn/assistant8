/**
 * useAuth - Custom hook for accessing authentication state
 * X51LABS-162: Build AuthContext & useAuth Custom Hook
 * 
 * Provides convenient access to auth state and operations
 * Must be used within AuthProvider component tree
 */

import { useContext } from 'preact/hooks';
import { AuthContext } from '../context/AuthContext.jsx';

/**
 * Access authentication state and operations
 * 
 * @returns {Object} Auth context value
 * @returns {boolean} .authenticated - Whether user is logged in
 * @returns {Object|null} .user - Current user object (id, email, metadata)
 * @returns {boolean} .loading - Loading state during auth operations
 * @returns {string|null} .error - Error message if auth operation failed
 * @returns {Function} .login - Login function (email, password) => Promise<{authenticated, user, error}>
 * @returns {Function} .logout - Logout function () => Promise<{success, error}>
 * @returns {Function} .checkAuthStatus - Check auth status () => Promise<{authenticated, user, error}>
 * 
 * @throws {Error} If used outside AuthProvider
 * 
 * @example
 * import { useAuth } from './hooks/useAuth.js';
 * 
 * function MyComponent() {
 *   const { authenticated, user, login, logout } = useAuth();
 *   
 *   if (!authenticated) {
 *     return <button onClick={() => login('user@example.com', 'password')}>Login</button>;
 *   }
 *   
 *   return <div>Welcome {user.email} <button onClick={logout}>Logout</button></div>;
 * }
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
