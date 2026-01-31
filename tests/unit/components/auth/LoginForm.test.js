/**
 * LoginForm.test.js - Unit tests for LoginForm component
 * 
 * Test Coverage:
 * - Component rendering
 * - Email validation
 * - Password validation
 * - Form submission
 * - Error display
 * - Loading state
 * 
 * X51LABS-163: Build LoginForm Component
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { LoginForm } from '../../../../src/ui-preact/components/auth/LoginForm.jsx';
import { useAuth } from '../../../../src/ui-preact/hooks/useAuth.js';

// Mock useAuth hook
vi.mock('../../../../src/ui-preact/hooks/useAuth.js', () => ({
  useAuth: vi.fn()
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

describe('LoginForm', () => {
  let mockLogin;

  beforeEach(() => {
    // Reset mocks before each test
    mockLogin = vi.fn();
    useAuth.mockReturnValue({
      login: mockLogin,
      loading: false,
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
    fireEvent.input(emailInput, { target: { value: 'invalid-email' } });
    
    // Submit form
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(container.textContent).toContain('Email không hợp lệ');
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
    fireEvent.input(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.input(passwordInput, { target: { value: '12345' } });
    
    // Submit form
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(container.textContent).toContain('Mật khẩu phải có ít nhất 6 ký tự');
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
    fireEvent.input(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.input(passwordInput, { target: { value: 'password123' } });
    
    // Submit form
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  test('displays API error message', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      loading: false,
      error: 'Sai email hoặc mật khẩu'
    });
    
    const { container } = render(h(LoginForm));
    
    const errorMessage = container.querySelector('[data-testid="api-error"]');
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.textContent).toBe('Sai email hoặc mật khẩu');
  });

  test('disables button during loading', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      loading: true,
      error: null
    });
    
    const { container } = render(h(LoginForm));
    
    const submitButton = container.querySelector('[data-testid="submit-button"]');
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toContain('Đang đăng nhập');
  });

  test('changes button text during loading', () => {
    useAuth.mockReturnValue({
      login: mockLogin,
      loading: true,
      error: null
    });
    
    const { container } = render(h(LoginForm));
    
    const submitButton = container.querySelector('[data-testid="submit-button"]');
    expect(submitButton.textContent).toBe('Đang đăng nhập...');
  });

  test('clears validation error on input change', async () => {
    const { container } = render(h(LoginForm));
    
    const emailInput = container.querySelector('[data-testid="email-input"]');
    const form = container.querySelector('[data-testid="login-form"]');
    
    // Trigger validation error
    fireEvent.input(emailInput, { target: { value: 'invalid' } });
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(container.textContent).toContain('Email không hợp lệ');
    });
    
    // Change email (should clear error)
    fireEvent.input(emailInput, { target: { value: 'user@example.com' } });
    
    await waitFor(() => {
      expect(container.textContent).not.toContain('Email không hợp lệ');
    });
  });
});
