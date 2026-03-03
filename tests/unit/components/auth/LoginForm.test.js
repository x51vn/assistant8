/**
 * LoginForm.test.js - Unit tests for LoginForm component
 *
 * Test Coverage:
 * - Component rendering
 * - Email validation
 * - Password validation
 * - Form submission
 * - Error display
 *
 * X51LABS-163: Build LoginForm Component
 *
 * NOTE: LoginForm does NOT read `loading` from useAuth(). Submit button's
 * disabled state is driven by hasValidationErrors only. Loading state is
 * managed globally via appState.js.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '../../../test-utils/preact-render.js';
import { act } from 'preact/test-utils';
import { h } from 'preact';
import { LoginForm } from '../../../../src/ui-preact/components/auth/LoginForm.jsx';
import { useAuth } from '../../../../src/ui-preact/hooks/useAuth.js';

// Mock useAuth hook
vi.mock('../../../../src/ui-preact/hooks/useAuth.js', () => ({
  useAuth: vi.fn()
}));

// Mock authApi (imported by LoginForm for signInWithGoogle)
vi.mock('../../../../src/ui-preact/api/authApi.js', () => ({
  signInWithGoogle: vi.fn()
}));

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

/** Helper: set input value and fire input event within act() */
function setInputValue(input, value) {
  input.value = value;
  act(() => {
    fireEvent.input(input, { target: { value } });
  });
}

describe('LoginForm', () => {
  let mockLogin;

  beforeEach(() => {
    // Reset mocks before each test
    mockLogin = vi.fn();
    useAuth.mockReturnValue({
      login: mockLogin,
      checkAuthStatus: vi.fn(),
      error: null
    });
  });

  test('renders email and password inputs', () => {
    const { container } = render(h(LoginForm));

    const emailInput = container.querySelector('[data-testid="email-input"]');
    const passwordInput = container.querySelector('[data-testid="password-input"]');
    const submitButton = container.querySelector('[data-testid="submit-button"]');

    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(submitButton).toBeTruthy();
  });

  test('shows email validation error on invalid format', async () => {
    const { container } = render(h(LoginForm));

    const emailInput = container.querySelector('[data-testid="email-input"]');
    const form = container.querySelector('[data-testid="login-form"]');

    // Enter invalid email
    setInputValue(emailInput, 'invalid-email');

    // Submit form
    act(() => { fireEvent.submit(form); });

    await waitFor(() => {
      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError.textContent).toContain('Email không hợp lệ');
    });

    // Login should not be called
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('shows password validation error when too short', async () => {
    const { container } = render(h(LoginForm));

    const emailInput = container.querySelector('[data-testid="email-input"]');
    const passwordInput = container.querySelector('[data-testid="password-input"]');
    const form = container.querySelector('[data-testid="login-form"]');

    // Enter valid email but short password
    setInputValue(emailInput, 'user@example.com');
    setInputValue(passwordInput, '12345');

    // Submit form
    act(() => { fireEvent.submit(form); });

    await waitFor(() => {
      const passwordError = container.querySelector('[data-testid="password-error"]');
      expect(passwordError).toBeTruthy();
      expect(passwordError.textContent).toContain('Mật khẩu phải có ít nhất 6 ký tự');
    });

    // Login should not be called
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('calls login function on valid submission', async () => {
    mockLogin.mockResolvedValue({ authenticated: true, user: { email: 'user@example.com' } });

    const { container } = render(h(LoginForm));

    const emailInput = container.querySelector('[data-testid="email-input"]');
    const passwordInput = container.querySelector('[data-testid="password-input"]');
    const form = container.querySelector('[data-testid="login-form"]');

    // Enter valid credentials
    setInputValue(emailInput, 'user@example.com');
    setInputValue(passwordInput, 'password123');

    // Submit form
    act(() => { fireEvent.submit(form); });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  test('displays API error message', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      checkAuthStatus: vi.fn(),
      error: 'Sai email hoặc mật khẩu'
    });

    const { container } = render(h(LoginForm));

    const errorMessage = container.querySelector('[data-testid="api-error"]');
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.textContent.trim()).toBe('Sai email hoặc mật khẩu');
  });

  test('submit button has correct text', () => {
    const { container } = render(h(LoginForm));

    const submitButton = container.querySelector('[data-testid="submit-button"]');
    expect(submitButton.textContent).toContain('Đăng nhập');
  });

  test('renders Google login button', () => {
    const { container } = render(h(LoginForm));

    const googleButton = container.querySelector('[data-testid="google-login-button"]');
    expect(googleButton).toBeTruthy();
    expect(googleButton.textContent).toContain('Đăng nhập bằng Google');
  });

  test('clears validation error on input change', async () => {
    const { container } = render(h(LoginForm));

    const emailInput = container.querySelector('[data-testid="email-input"]');
    const form = container.querySelector('[data-testid="login-form"]');

    // Trigger validation error by submitting empty
    act(() => { fireEvent.submit(form); });

    await waitFor(() => {
      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError.textContent).toContain('Email là bắt buộc');
    });

    // Change email (should clear error)
    setInputValue(emailInput, 'user@example.com');

    await waitFor(() => {
      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeFalsy();
    });
  });
});
