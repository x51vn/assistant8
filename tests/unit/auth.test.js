/**
 * @fileoverview Unit Tests for Authentication Utility
 * Tests requireAuth and related auth helper functions
 * 
 * Ticket: GPT-005
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ERROR_CODES } from '../../src/shared/errorCodes.js';
import { MESSAGE_VERSION } from '../../src/shared/messageSchema.js';

// Mock logger first
vi.mock('../../src/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })),
  generateCorrelationId: vi.fn(() => 'auto-generated-id')
}));

// Use vi.hoisted() to declare mock functions before vi.mock hoisting
const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn()
}));

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser
    }
  }
}));

// Now import the functions to test
import { requireAuth, getCurrentUserId, isAuthenticated, getCurrentUser } from '../../src/background/utils/auth.js';

describe('requireAuth', () => {
  const mockMessage = {
    v: MESSAGE_VERSION,
    type: 'TEST_MESSAGE',
    correlationId: 'test-123',
    timestamp: Date.now()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful authentication', () => {
    it('should return user ID when user is authenticated', async () => {
      const mockUserId = '12345678-1234-1234-1234-123456789abc';
      
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: mockUserId,
            email: 'test@example.com'
          }
        },
        error: null
      });

      const userId = await requireAuth(mockMessage);

      expect(userId).toBe(mockUserId);
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });

    it('should work with different user IDs', async () => {
      const mockUserId = 'abcdef12-abcd-abcd-abcd-abcdefabcdef';
      
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: mockUserId,
            email: 'another@example.com',
            app_metadata: {},
            user_metadata: {}
          }
        },
        error: null
      });

      const userId = await requireAuth(mockMessage);

      expect(userId).toBe(mockUserId);
    });
  });

  describe('No authenticated user', () => {
    it('should throw AUTH_REQUIRED when user is null', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_REQUIRED,
        correlationId: mockMessage.correlationId,
        inResponseTo: mockMessage.type
      });
    });

    it('should throw AUTH_REQUIRED when user is undefined', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: undefined },
        error: null
      });

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_REQUIRED
      });
    });

    it('should include user-friendly message', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      try {
        await requireAuth(mockMessage);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.errorCode).toBe(ERROR_CODES.AUTH_REQUIRED);
        expect(error.errorMessage).toBeTruthy();
        expect(error.errorMessage).toContain('đăng nhập'); // Vietnamese message
      }
    });
  });

  describe('Authentication errors', () => {
    it('should throw AUTH_EXPIRED when token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Invalid JWT token',
          code: 'invalid_jwt'
        }
      });

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_EXPIRED
      });
    });

    it('should throw AUTH_EXPIRED when session expired', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'Session expired',
          code: 'session_expired'
        }
      });

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_EXPIRED
      });
    });

    it('should include technical error in details', async () => {
      const technicalError = 'Token signature verification failed';
      
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          message: technicalError,
          code: 'jwt_error'
        }
      });

      try {
        await requireAuth(mockMessage);
        expect.fail('Should have thrown');
      } catch (error) {
      expect(error.error.details).toBeDefined();
      expect(error.error.details.technicalError).toBe(technicalError);
      }
    });
  });

  describe('User without ID (edge case)', () => {
    it('should throw AUTH_ERROR when user exists but has no ID', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: null, // No ID
            email: 'test@example.com'
          }
        },
        error: null
      });

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_ERROR
      });
    });

    it('should throw AUTH_ERROR when user.id is empty string', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: '', // Empty ID
            email: 'test@example.com'
          }
        },
        error: null
      });

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_ERROR
      });
    });
  });

  describe('Unexpected errors', () => {
    it('should throw AUTH_ERROR on network failure', async () => {
      mockGetUser.mockRejectedValue(
        new Error('Network request failed')
      );

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_ERROR
      });
    });

    it('should throw AUTH_ERROR on Supabase SDK error', async () => {
      mockGetUser.mockRejectedValue(
        new Error('Supabase client initialization failed')
      );

      await expect(requireAuth(mockMessage)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_ERROR
      });
    });
  });

  describe('Error response format', () => {
    it('should return properly formatted error response', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      try {
        await requireAuth(mockMessage);
        expect.fail('Should have thrown');
      } catch (error) {
        // Check standard error response structure
        expect(error).toHaveProperty('v');
        expect(error).toHaveProperty('type', 'ERROR');
        expect(error).toHaveProperty('correlationId', mockMessage.correlationId);
        expect(error).toHaveProperty('inResponseTo', mockMessage.type);
        expect(error).toHaveProperty('errorCode');
        expect(error).toHaveProperty('errorMessage');
        expect(error).toHaveProperty('timestamp');
      }
    });
  });

  describe('Message parameter handling', () => {
    it('should handle message without correlationId', async () => {
      const messageNoCorrelation = {
        v: MESSAGE_VERSION,
        type: 'TEST_MESSAGE',
        timestamp: Date.now()
      };

      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      await expect(requireAuth(messageNoCorrelation)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_REQUIRED
      });
    });

    it('should handle null message parameter', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      await expect(requireAuth(null)).rejects.toMatchObject({
        errorCode: ERROR_CODES.AUTH_REQUIRED
      });
    });
  });
});

describe('getCurrentUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user ID when authenticated', async () => {
    const mockUserId = '12345678-1234-1234-1234-123456789abc';
    
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: mockUserId,
          email: 'test@example.com'
        }
      },
      error: null
    });

    const userId = await getCurrentUserId();

    expect(userId).toBe(mockUserId);
  });

  it('should return null when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null
    });

    const userId = await getCurrentUserId();

    expect(userId).toBeNull();
  });

  it('should return null on error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth error' }
    });

    const userId = await getCurrentUserId();

    expect(userId).toBeNull();
  });

  it('should return null on exception', async () => {
    mockGetUser.mockRejectedValue(
      new Error('Network error')
    );

    const userId = await getCurrentUserId();

    expect(userId).toBeNull();
  });
});

describe('isAuthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when user is authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: '12345678-1234-1234-1234-123456789abc',
          email: 'test@example.com'
        }
      },
      error: null
    });

    const result = await isAuthenticated();

    expect(result).toBe(true);
  });

  it('should return false when user is null', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null
    });

    const result = await isAuthenticated();

    expect(result).toBe(false);
  });

  it('should return false when error occurs', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token expired' }
    });

    const result = await isAuthenticated();

    expect(result).toBe(false);
  });

  it('should return false on exception', async () => {
    mockGetUser.mockRejectedValue(
      new Error('Network error')
    );

    const result = await isAuthenticated();

    expect(result).toBe(false);
  });
});

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return full user object when authenticated', async () => {
    const mockUser = {
      id: '12345678-1234-1234-1234-123456789abc',
      email: 'test@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { name: 'Test User' }
    };
    
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });

    const user = await getCurrentUser();

    expect(user).toEqual(mockUser);
    expect(user.id).toBe(mockUser.id);
    expect(user.email).toBe(mockUser.email);
    expect(user.user_metadata).toEqual(mockUser.user_metadata);
  });

  it('should return null when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null
    });

    const user = await getCurrentUser();

    expect(user).toBeNull();
  });

  it('should return null on error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth error' }
    });

    const user = await getCurrentUser();

    expect(user).toBeNull();
  });

  it('should return null on exception', async () => {
    mockGetUser.mockRejectedValue(
      new Error('Network error')
    );

    const user = await getCurrentUser();

    expect(user).toBeNull();
  });
});
