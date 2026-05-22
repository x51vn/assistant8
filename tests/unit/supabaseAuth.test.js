/**
 * @fileoverview Tests for Supabase Auth Handlers
 * Tests login, logout, and auth check functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MESSAGE_TYPES } from '../../src/shared/messageSchema.js';
import { ERROR_CODES } from '../../src/shared/errorCodes.js';

// Mock chrome API
global.chrome = {
  runtime: {
    getURL: vi.fn((path = '') => `chrome-extension://test-extension/${path}`),
    sendMessage: vi.fn().mockResolvedValue({})
  }
};

// Use vi.hoisted() to declare mock functions before vi.mock hoisting
const { mockSignInWithPassword, mockSignOut, mockGetUser, mockOnAuthStateChange, handlers } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  handlers: new Map()
}));

// Mock Supabase
vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange
    }
  }
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}));

// Mock supabaseWithRetry to just call the operation
vi.mock('../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn((operation) => operation())
}));

// Mock contextMenu (invalidatePromptCache called on login success)
vi.mock('../../src/background/handlers/contextMenu.js', () => ({
  invalidatePromptCache: vi.fn()
}));

// Mock chatHistoryService (flushChatHistoryOutbox called on auth events)
vi.mock('../../src/background/services/chatHistoryService.js', () => ({
  flushChatHistoryOutbox: vi.fn()
}));

// Mock message router
vi.mock('../../src/background/messageRouter.js', () => ({
  registerHandler: vi.fn((type, handler) => {
    handlers.set(type, handler);
  })
}));

// Import handler module (will register handlers)
await import('../../src/background/handlers/supabaseAuth.js');

describe('Supabase Auth Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('SUPABASE_AUTH_LOGIN', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
        correlationId: 'test123',
        data: {
          email: 'test@example.com',
          password: 'password123'
        }
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.SUPABASE_AUTH_SUCCESS);
      expect(response.user).toEqual({
        id: 'user123',
        email: 'test@example.com',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });
    
    it('should return error for missing email', async () => {
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
        correlationId: 'test123',
        data: {
          password: 'password123'
        }
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(response.error.code).toBe(ERROR_CODES.INVALID_INPUT);
      expect(response.error.message).toContain('Email');
    });
    
    it('should return error for missing password', async () => {
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
        correlationId: 'test123',
        data: {
          email: 'test@example.com'
        }
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(response.error.code).toBe(ERROR_CODES.INVALID_INPUT);
      expect(response.error.message).toContain('Mật khẩu');
    });
    
    it('should handle invalid credentials error', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' }
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
        correlationId: 'test123',
        data: {
          email: 'test@example.com',
          password: 'wrongpassword'
        }
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(response.error.code).toBe(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    });
    
    it('should handle email not confirmed error', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Email not confirmed' }
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGIN);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGIN,
        correlationId: 'test123',
        data: {
          email: 'test@example.com',
          password: 'password123'
        }
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(response.error.code).toBe(ERROR_CODES.AUTH_EMAIL_NOT_CONFIRMED);
    });
  });
  
  describe('SUPABASE_AUTH_LOGOUT', () => {
    it('should logout successfully', async () => {
      mockSignOut.mockResolvedValue({
        error: null
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT,
        correlationId: 'test123'
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.SUPABASE_AUTH_LOGGED_OUT);
      expect(response.success).toBe(true);
      expect(mockSignOut).toHaveBeenCalled();
    });
    
    it('should handle logout error', async () => {
      mockSignOut.mockResolvedValue({
        error: { message: 'Logout failed' }
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_LOGOUT,
        correlationId: 'test123'
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(response.error.code).toBe(ERROR_CODES.AUTH_ERROR);
    });
  });
  
  describe('SUPABASE_AUTH_CHECK', () => {
    it('should return authenticated for valid session', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      };
      
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_CHECK);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
        correlationId: 'test123'
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.SUPABASE_AUTH_STATUS);
      expect(response.authenticated).toBe(true);
      expect(response.user).toEqual({
        id: 'user123',
        email: 'test@example.com',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });
    });
    
    it('should return not authenticated for no user', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No user' }
      });
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_CHECK);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
        correlationId: 'test123'
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.SUPABASE_AUTH_STATUS);
      expect(response.authenticated).toBe(false);
      expect(response.user).toBe(null);
    });
    
    it('should return not authenticated on error', async () => {
      mockGetUser.mockRejectedValue(new Error('Network error'));
      
      const handler = handlers.get(MESSAGE_TYPES.SUPABASE_AUTH_CHECK);
      const message = {
        type: MESSAGE_TYPES.SUPABASE_AUTH_CHECK,
        correlationId: 'test123'
      };
      
      const response = await handler(message);
      
      expect(response.type).toBe(MESSAGE_TYPES.SUPABASE_AUTH_STATUS);
      expect(response.authenticated).toBe(false);
    });
  });
});

// NOTE: Duplicate describe block with undefined 'mockAuth' was removed.
// All tests are covered by the first describe block above using properly hoisted mocks.
