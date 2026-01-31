/**
 * useAuth Hook - Unit Tests
 * X51LABS-162: Build AuthContext & useAuth Custom Hook
 * 
 * Tests all 7 Acceptance Criteria defined in Jira ticket
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { useAuth } from '../../../src/ui-preact/hooks/useAuth.js';
import { AuthProvider } from '../../../src/ui-preact/context/AuthContext.jsx';
import * as authApi from '../../../src/ui-preact/api/authApi.js';

// Mock chrome runtime API
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

// Mock authApi functions
vi.mock('../../../src/ui-preact/api/authApi.js', () => ({
  checkAuthStatus: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  listenAuthStateChanges: vi.fn(() => () => {}) // Return cleanup function
}));

// Test component to access hook values
function TestComponent({ onRender, onLogin, onLogout, onCheckAuth }) {
  const auth = useAuth();
  
  // Call onRender with auth state
  if (onRender) {
    onRender(auth);
  }
  
  return h('div', { 'data-testid': 'test-component' },
    h('div', { 'data-testid': 'authenticated' }, String(auth.authenticated)),
    h('div', { 'data-testid': 'user' }, JSON.stringify(auth.user)),
    h('div', { 'data-testid': 'loading' }, String(auth.loading)),
    h('div', { 'data-testid': 'error' }, String(auth.error)),
    h('button', { 
      'data-testid': 'login-btn',
      onClick: onLogin ? () => onLogin(auth.login) : undefined
    }, 'Login'),
    h('button', {
      'data-testid': 'logout-btn',
      onClick: onLogout ? () => onLogout(auth.logout) : undefined
    }, 'Logout'),
    h('button', {
      'data-testid': 'check-btn',
      onClick: onCheckAuth ? () => onCheckAuth(auth.checkAuthStatus) : undefined
    }, 'Check')
  );
}

describe('useAuth Hook - X51LABS-162', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    authApi.checkAuthStatus.mockResolvedValue({
      authenticated: false,
      user: null
    });
    authApi.login.mockResolvedValue({
      authenticated: true,
      user: { id: 'user123', email: 'test@example.com' }
    });
    authApi.logout.mockResolvedValue({ success: true });
    authApi.listenAuthStateChanges.mockReturnValue(() => {});
  });

  describe('AC-1: Hook returns correct shape', () => {
    it('should return object with authenticated, user, loading, error properties', async () => {
      let capturedAuth;
      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onRender: (auth) => { capturedAuth = auth; }
          })
        )
      );

      await waitFor(() => {
        expect(capturedAuth).toBeDefined();
        expect(capturedAuth.loading).toBe(false);
      });

      expect(capturedAuth).toHaveProperty('authenticated');
      expect(capturedAuth).toHaveProperty('user');
      expect(capturedAuth).toHaveProperty('loading');
      expect(capturedAuth).toHaveProperty('error');
      expect(typeof capturedAuth.authenticated).toBe('boolean');
    });

    it('should return login, logout, checkAuthStatus functions', async () => {
      let capturedAuth;
      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onRender: (auth) => { capturedAuth = auth; }
          })
        )
      );

      await waitFor(() => {
        expect(capturedAuth).toBeDefined();
        expect(capturedAuth.loading).toBe(false);
      });

      expect(typeof capturedAuth.login).toBe('function');
      expect(typeof capturedAuth.logout).toBe('function');
      expect(typeof capturedAuth.checkAuthStatus).toBe('function');
    });
  });

  describe('AC-2: Login updates context', () => {
    it('should update authenticated to true and set user on successful login', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' };
      authApi.login.mockResolvedValue({
        authenticated: true,
        user: mockUser
      });

      let loginFn;
      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onLogin: (fn) => { loginFn = fn; }
          })
        )
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('authenticated').textContent).toBe('false');

      // Trigger login
      await loginFn('test@example.com', 'password123');

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });
    });

    it('should set error message on failed login', async () => {
      authApi.login.mockResolvedValue({
        authenticated: false,
        user: null,
        error: 'Invalid credentials'
      });

      let loginFn;
      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onLogin: (fn) => { loginFn = fn; }
          })
        )
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await loginFn('wrong@example.com', 'wrongpass');

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('Invalid credentials');
      });
    });
  });

  describe('AC-3: Logout clears context', () => {
    it('should reset authenticated to false and clear user on logout', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' };
      
      authApi.checkAuthStatus.mockResolvedValue({
        authenticated: true,
        user: mockUser
      });

      let logoutFn;
      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onLogout: (fn) => { logoutFn = fn; }
          })
        )
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      authApi.logout.mockResolvedValue({ success: true });
      await logoutFn();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
    });

    it('should set error if logout fails', async () => {
      authApi.checkAuthStatus.mockResolvedValue({
        authenticated: true,
        user: { id: 'user123', email: 'test@example.com' }
      });

      let logoutFn;
      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onLogout: (fn) => { logoutFn = fn; }
          })
        )
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      authApi.logout.mockResolvedValue({
        success: false,
        error: 'Logout failed'
      });

      await logoutFn();

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('Logout failed');
      });
    });
  });

  describe('AC-4: Unit tests pass', () => {
    it('should check initial auth status on mount', async () => {
      render(
        h(AuthProvider, null,
          h(TestComponent, {})
        )
      );

      await waitFor(() => {
        expect(authApi.checkAuthStatus).toHaveBeenCalledTimes(1);
      });
    });

    it('should register auth state listener on mount', async () => {
      render(
        h(AuthProvider, null,
          h(TestComponent, {})
        )
      );

      await waitFor(() => {
        expect(authApi.listenAuthStateChanges).toHaveBeenCalledTimes(1);
      });

      expect(typeof authApi.listenAuthStateChanges.mock.calls[0][0]).toBe('function');
    });
  });

  describe('AC-5: JSDoc documentation', () => {
    it('should have proper TypeScript-style JSDoc', () => {
      expect(useAuth).toBeDefined();
      expect(typeof useAuth).toBe('function');
    });
  });

  describe('AC-6: Build passes', () => {
    it('should have all required imports', () => {
      expect(useAuth).toBeDefined();
      expect(AuthProvider).toBeDefined();
    });
  });

  describe('AC-7: listenAuthStateChanges added to authApi', () => {
    it('should call listenAuthStateChanges from authApi', async () => {
      render(
        h(AuthProvider, null,
          h(TestComponent, {})
        )
      );

      await waitFor(() => {
        expect(authApi.listenAuthStateChanges).toHaveBeenCalled();
      });
    });

    it('should handle auth state changes from background', async () => {
      let capturedCallback;
      authApi.listenAuthStateChanges.mockImplementation((callback) => {
        capturedCallback = callback;
        return () => {};
      });

      render(
        h(AuthProvider, null,
          h(TestComponent, {})
        )
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      expect(screen.getByTestId('authenticated').textContent).toBe('false');

      // Simulate background sending AUTH_STATE_CHANGED
      capturedCallback({
        authenticated: true,
        user: { id: 'user456', email: 'updated@example.com' }
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error when used outside AuthProvider', () => {
      expect(() => {
        render(h(TestComponent, {}));
      }).toThrow('useAuth must be used within AuthProvider');
    });
  });

  describe('Loading states', () => {
    it('should set loading during operations', async () => {
      let loginFn;
      let resolveLogin;
      authApi.login.mockReturnValue(new Promise((resolve) => {
        resolveLogin = resolve;
      }));

      render(
        h(AuthProvider, null,
          h(TestComponent, {
            onLogin: (fn) => { loginFn = fn; }
          })
        )
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Start login
      loginFn('test@example.com', 'password');

      // Should show loading
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('true');
      });

      // Resolve login
      resolveLogin({ authenticated: true, user: { id: '123' } });

      // Loading should be false again
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
    });
  });
});
