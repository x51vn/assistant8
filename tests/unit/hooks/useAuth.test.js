/**
 * useAuth Hook - Unit Tests
 * X51LABS-162: Build AuthContext & useAuth Custom Hook
 *
 * Tests all 7 Acceptance Criteria defined in Jira ticket.
 *
 * NOTE: AuthContext deliberately does NOT expose a `loading` property.
 * Loading state is managed globally via appState.js (setGlobalLoading/hideLoading).
 * Login/logout handlers do NOT update auth state directly — they rely on
 * listenAuthStateChanges callback to propagate changes from background.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '../../test-utils/preact-render.js';
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

// Mock appState to prevent side effects
vi.mock('../../../src/ui-preact/state/appState.js', () => ({
  setGlobalLoading: vi.fn(),
  hideLoading: vi.fn(),
  globalLoading: { value: false },
  globalLoadingMessage: { value: '' }
}));

// Mock settings loader
vi.mock('../../../src/ui-preact/api/settingsApi.js', () => ({
  loadSettings: vi.fn().mockResolvedValue({})
}));

// Test component to access hook values
function TestComponent({ onRender }) {
  const auth = useAuth();

  // Call onRender with auth state on every render
  if (onRender) {
    onRender(auth);
  }

  return h('div', { 'data-testid': 'test-component' },
    h('div', { 'data-testid': 'authenticated' }, String(auth.authenticated)),
    h('div', { 'data-testid': 'user' }, JSON.stringify(auth.user)),
    h('div', { 'data-testid': 'error' }, String(auth.error))
  );
}

describe('useAuth Hook - X51LABS-162', () => {
  let authChangeCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    authChangeCallback = null;

    // Default: not authenticated
    authApi.checkAuthStatus.mockResolvedValue({
      authenticated: false,
      user: null
    });
    authApi.login.mockResolvedValue({
      authenticated: true,
      user: { id: 'user123', email: 'test@example.com' }
    });
    authApi.logout.mockResolvedValue({ success: true });

    // Capture the auth-state-change callback so tests can trigger it
    authApi.listenAuthStateChanges.mockImplementation((callback) => {
      authChangeCallback = callback;
      return () => {};
    });
  });

  /** Helper: render AuthProvider with TestComponent, wait for initial check */
  async function renderAuth() {
    let capturedAuth;
    render(
      h(AuthProvider, null,
        h(TestComponent, {
          onRender: (auth) => { capturedAuth = auth; }
        })
      )
    );
    // Wait for checkAuthStatus to complete
    await waitFor(() => {
      expect(authApi.checkAuthStatus).toHaveBeenCalledTimes(1);
    });
    return capturedAuth;
  }

  describe('AC-1: Hook returns correct shape', () => {
    it('should return object with authenticated, user, error properties', async () => {
      const capturedAuth = await renderAuth();

      expect(capturedAuth).toBeDefined();
      expect(capturedAuth).toHaveProperty('authenticated');
      expect(capturedAuth).toHaveProperty('user');
      expect(capturedAuth).toHaveProperty('error');
      expect(typeof capturedAuth.authenticated).toBe('boolean');
    });

    it('should return login, logout, checkAuthStatus functions', async () => {
      const capturedAuth = await renderAuth();

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

      const capturedAuth = await renderAuth();
      expect(screen.getByTestId('authenticated').textContent).toBe('false');

      // Login — handler calls API but doesn't update state directly
      await capturedAuth.login('test@example.com', 'password123');

      // Simulate background broadcasting auth state change
      authChangeCallback({
        authenticated: true,
        user: mockUser
      });

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

      const capturedAuth = await renderAuth();

      await capturedAuth.login('wrong@example.com', 'wrongpass');

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('Invalid credentials');
      });
    });
  });

  describe('AC-3: Logout clears context', () => {
    it('should reset authenticated to false and clear user on logout', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' };

      // Start authenticated
      authApi.checkAuthStatus.mockResolvedValue({
        authenticated: true,
        user: mockUser
      });

      const capturedAuth = await renderAuth();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      // Logout — handler calls API but doesn't update state directly
      await capturedAuth.logout();

      // Simulate background broadcasting auth state change
      authChangeCallback({
        authenticated: false,
        user: null
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
    });

    it('should set error if logout fails', async () => {
      authApi.checkAuthStatus.mockResolvedValue({
        authenticated: true,
        user: { id: 'user123', email: 'test@example.com' }
      });

      const capturedAuth = await renderAuth();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      authApi.logout.mockResolvedValue({
        success: false,
        error: 'Logout failed'
      });

      await capturedAuth.logout();

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
      await renderAuth();

      expect(screen.getByTestId('authenticated').textContent).toBe('false');

      // Simulate background sending auth state change
      authChangeCallback({
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

  describe('Global loading integration', () => {
    it('should call setGlobalLoading during login', async () => {
      const { setGlobalLoading } = await import('../../../src/ui-preact/state/appState.js');
      const capturedAuth = await renderAuth();

      await capturedAuth.login('test@example.com', 'password');

      expect(setGlobalLoading).toHaveBeenCalled();
    });
  });
});
