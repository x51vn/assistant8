/**
 * @fileoverview Unit Tests for supabaseWithRetry Utility
 * Tests retry logic, exponential backoff, and error handling
 * 
 * Ticket: GPT-004
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabaseWithRetry, supabaseQuery, isSupabaseError } from '../../src/background/utils/supabaseRetry.js';
import { MAX_RETRIES, RETRY_DELAY_BASE_MS } from '../../src/shared/appConstants.js';

describe('supabaseWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Successful operations', () => {
    it('should return result on first try when operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue({ data: 'success' });

      const result = await supabaseWithRetry(operation, {
        operationName: 'testOperation',
        correlationId: 'test-123'
      });

      expect(result).toEqual({ data: 'success' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should succeed after retries when operation eventually works', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: 'success' });

      const promise = supabaseWithRetry(operation, {
        operationName: 'testOperation',
        maxRetries: 3
      });

      // Fast-forward through backoff delays
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2); // First retry (1s)
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4); // Second retry (2s)

      const result = await promise;

      expect(result).toEqual({ data: 'success' });
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Network errors - SHOULD RETRY', () => {
    it('should retry on network error', async () => {
      const operation = vi.fn()
        .mockRejectedValue(new Error('Failed to fetch'));

      const promise = supabaseWithRetry(operation, {
        operationName: 'testOperation',
        maxRetries: 3
      });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      // Fast-forward through all retries
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2); // 1s
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4); // 2s
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 8); // 4s (won't retry after this)

      await expect(promise).rejects.toThrow('Failed to fetch');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should retry on timeout error', async () => {
      const operation = vi.fn()
        .mockRejectedValue(new Error('Request timeout'));

      const promise = supabaseWithRetry(operation, {
        maxRetries: 2
      });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2); // First retry
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4); // Second attempt (exhausted)

      await expect(promise).rejects.toThrow('Request timeout');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on connection error', async () => {
      const operation = vi.fn()
        .mockRejectedValue(new Error('Connection refused'));

      const promise = supabaseWithRetry(operation, { maxRetries: 2 });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4);

      await expect(promise).rejects.toThrow('Connection refused');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('5xx Server errors - SHOULD RETRY', () => {
    it('should retry on 500 Internal Server Error', async () => {
      const error = new Error('Internal Server Error');
      error.status = 500;

      const operation = vi.fn().mockRejectedValue(error);

      const promise = supabaseWithRetry(operation, { maxRetries: 2 });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4);

      await expect(promise).rejects.toThrow('Internal Server Error');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 Service Unavailable', async () => {
      const error = new Error('Service Unavailable');
      error.status = 503;

      const operation = vi.fn().mockRejectedValue(error);

      const promise = supabaseWithRetry(operation, { maxRetries: 2 });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4);

      await expect(promise).rejects.toThrow('Service Unavailable');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('4xx Client errors - SHOULD NOT RETRY', () => {
    it('should NOT retry on 401 Unauthorized', async () => {
      const error = new Error('Unauthorized');
      error.status = 401;

      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        supabaseWithRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Unauthorized');

      // Should fail immediately without retries
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 403 Forbidden', async () => {
      const error = new Error('Forbidden');
      error.status = 403;

      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        supabaseWithRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Forbidden');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 404 Not Found', async () => {
      const error = new Error('Not Found');
      error.status = 404;

      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        supabaseWithRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Not Found');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 400 Bad Request', async () => {
      const error = new Error('Bad Request');
      error.status = 400;

      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        supabaseWithRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Bad Request');

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Postgres error codes - SHOULD NOT RETRY specific codes', () => {
    it('should NOT retry on PGRST116 (Not Found)', async () => {
      const error = new Error('Not Found');
      error.code = 'PGRST116';

      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        supabaseWithRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Not Found');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on PGRST301 (Auth error)', async () => {
      const error = new Error('Authentication required');
      error.code = 'PGRST301';

      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        supabaseWithRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Authentication required');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should RETRY on other Postgres error codes', async () => {
      const error = new Error('Connection pool exhausted');
      error.code = 'PGRST000'; // Generic error

      const operation = vi.fn().mockRejectedValue(error);

      const promise = supabaseWithRetry(operation, { maxRetries: 2 });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4);

      await expect(promise).rejects.toThrow('Connection pool exhausted');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Exponential backoff', () => {
    it('should use exponential backoff delays', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Network error'));
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const promise = supabaseWithRetry(operation, { maxRetries: 3 });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      // First retry delay: 1s
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 1);
      
      // Second retry delay: 2s
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2);
      
      // Third retry delay: 4s (won't happen since maxRetries=3)
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 4);

      await expect(promise).rejects.toThrow();

      // Verify setTimeout was called with correct delays
      const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
      expect(delays).toContain(RETRY_DELAY_BASE_MS * 1); // 1000ms
      expect(delays).toContain(RETRY_DELAY_BASE_MS * 2); // 2000ms
    });
  });

  describe('maxRetries configuration', () => {
    it('should respect custom maxRetries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Network error'));

      const promise = supabaseWithRetry(operation, { maxRetries: 5 });
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      // Fast-forward through all attempts
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * Math.pow(2, i));
      }

      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(5);
    });

    it('should use MAX_RETRIES from constants by default', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Network error'));

      const promise = supabaseWithRetry(operation);
      promise.catch(() => {}); // Prevent unhandled rejection during timer advancement

      for (let i = 0; i < MAX_RETRIES; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * Math.pow(2, i));
      }

      await expect(promise).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(MAX_RETRIES);
    });
  });
});

describe('supabaseQuery', () => {
  it('should extract data from successful query', async () => {
    const queryFn = vi.fn().mockResolvedValue({
      data: { id: 1, name: 'Test' },
      error: null
    });

    const result = await supabaseQuery(queryFn, {
      operationName: 'testQuery'
    });

    expect(result).toEqual({ id: 1, name: 'Test' });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('should throw error from failed query', async () => {
    const error = new Error('Query failed');
    error.status = 500;

    const queryFn = vi.fn().mockResolvedValue({
      data: null,
      error
    });

    await expect(
      supabaseQuery(queryFn, { maxRetries: 1 })
    ).rejects.toThrow('Query failed');
  });

  it('should retry transient query failures', async () => {
    vi.useFakeTimers(); // Need timers for retry logic
    
    const error = new Error('Network error');
    
    const queryFn = vi.fn()
      .mockResolvedValueOnce({ data: null, error })
      .mockResolvedValueOnce({ data: { success: true }, error: null });

    const promise = supabaseQuery(queryFn, { maxRetries: 2 });

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_BASE_MS * 2);

    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(queryFn).toHaveBeenCalledTimes(2);
    
    vi.useRealTimers();
  });
});

describe('isSupabaseError', () => {
  it('should identify Supabase errors by code', () => {
    const error = new Error('Query error');
    error.code = 'PGRST000';

    expect(isSupabaseError(error)).toBe(true);
  });

  it('should identify Supabase errors by message', () => {
    const error1 = new Error('supabase connection failed');
    const error2 = new Error('postgres query timeout');

    expect(isSupabaseError(error1)).toBe(true);
    expect(isSupabaseError(error2)).toBe(true);
  });

  it('should identify Supabase errors by hint field', () => {
    const error = new Error('Query error');
    error.hint = 'Check your RLS policies';

    expect(isSupabaseError(error)).toBe(true);
  });

  it('should identify Supabase errors by details field', () => {
    const error = new Error('Query error');
    error.details = 'Column does not exist';

    expect(isSupabaseError(error)).toBe(true);
  });

  it('should return false for non-Supabase errors', () => {
    const error = new Error('Generic error');

    expect(isSupabaseError(error)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isSupabaseError(null)).toBe(false);
    expect(isSupabaseError(undefined)).toBe(false);
  });
});
