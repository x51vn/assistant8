/**
 * Simple test to validate auth module imports
 */
import { describe, it, expect, vi } from 'vitest';

// Mock logger first (before any imports that need it)
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
  }))
}));

// Mock Supabase
vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-id' } },
        error: null
      })
    }
  }
}));

import { requireAuth } from '../../src/background/utils/auth.js';
import { ERROR_CODES } from '../../src/shared/errorCodes.js';

describe('requireAuth basic', () => {
  it('should be a function', () => {
    expect(typeof requireAuth).toBe('function');
  });
  
  it('should have ERROR_CODES', () => {
    expect(ERROR_CODES.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(ERROR_CODES.AUTH_ERROR).toBe('AUTH_ERROR');
  });
});
