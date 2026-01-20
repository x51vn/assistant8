import { describe, it, expect } from 'vitest';
import {
  ERROR_CODES,
  createSuccessResponse,
  createErrorResponse,
  exceptionToErrorResponse
} from '../../src/types.js';

describe('types.js', () => {
  describe('ERROR_CODES', () => {
    it('should define all error codes', () => {
      expect(ERROR_CODES.TAB_NOT_FOUND).toBe('TAB_NOT_FOUND');
      expect(ERROR_CODES.CONTENT_SCRIPT_NOT_READY).toBe('CONTENT_SCRIPT_NOT_READY');
      expect(ERROR_CODES.MESSAGE_SEND_FAILED).toBe('MESSAGE_SEND_FAILED');
      expect(ERROR_CODES.SESSION_CREATE_FAILED).toBe('SESSION_CREATE_FAILED');
      expect(ERROR_CODES.INPUT_SEND_FAILED).toBe('INPUT_SEND_FAILED');
      expect(ERROR_CODES.OUTPUT_FETCH_FAILED).toBe('OUTPUT_FETCH_FAILED');
      expect(ERROR_CODES.TIMEOUT).toBe('TIMEOUT');
      expect(ERROR_CODES.OPERATION_FAILED).toBe('OPERATION_FAILED');
      expect(ERROR_CODES.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ERROR_CODES.EMPTY_PROMPT).toBe('EMPTY_PROMPT');
      expect(ERROR_CODES.INVALID_TAB_ID).toBe('INVALID_TAB_ID');
      expect(ERROR_CODES.AUTH_FAILED).toBe('AUTH_FAILED');
      expect(ERROR_CODES.AUTH_EXPIRED).toBe('AUTH_EXPIRED');
      expect(ERROR_CODES.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ERROR_CODES.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
      expect(ERROR_CODES.STORAGE_ERROR).toBe('STORAGE_ERROR');
      expect(ERROR_CODES.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
    });

    it('should have unique error codes', () => {
      const values = Object.values(ERROR_CODES);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response with data', () => {
      const data = { value: 123, text: 'test' };
      const response = createSuccessResponse(data);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.error).toBeUndefined();
    });

    it('should handle null data', () => {
      const response = createSuccessResponse(null);
      
      expect(response.success).toBe(true);
      expect(response.data).toBe(null);
    });

    it('should handle undefined data', () => {
      const response = createSuccessResponse(undefined);
      
      expect(response.success).toBe(true);
      expect(response.data).toBe(undefined);
    });

    it('should handle empty object', () => {
      const response = createSuccessResponse({});
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual({});
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const response = createSuccessResponse(data);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with required fields', () => {
      const response = createErrorResponse(
        ERROR_CODES.INVALID_INPUT,
        'Invalid input provided'
      );
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.INVALID_INPUT);
      expect(response.error.message).toBe('Invalid input provided');
      expect(response.data).toBeUndefined();
    });

    it('should include optional context', () => {
      const response = createErrorResponse(
        ERROR_CODES.TIMEOUT,
        'Operation timed out',
        'getUserData'
      );
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.TIMEOUT);
      expect(response.error.message).toBe('Operation timed out');
      expect(response.error.context).toBe('getUserData');
    });

    it('should include optional details', () => {
      const details = { tabId: 123, attempt: 3 };
      const response = createErrorResponse(
        ERROR_CODES.TAB_NOT_FOUND,
        'Tab not found',
        'getTab',
        details
      );
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.TAB_NOT_FOUND);
      expect(response.error.message).toBe('Tab not found');
      expect(response.error.context).toBe('getTab');
      expect(response.error.details).toEqual(details);
    });

    it('should handle undefined context and details', () => {
      const response = createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Something went wrong',
        undefined,
        undefined
      );
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBe('Something went wrong');
      expect(response.error.context).toBeUndefined();
      expect(response.error.details).toBeUndefined();
    });
  });

  describe('exceptionToErrorResponse', () => {
    it('should convert Error object to error response', () => {
      const error = new Error('Test error');
      const response = exceptionToErrorResponse(error);
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBe('Test error');
      expect(response.error.details).toBeDefined();
    });

    it('should include context when provided', () => {
      const error = new Error('Test error');
      const response = exceptionToErrorResponse(error, 'testFunction');
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBe('Test error');
      expect(response.error.context).toBe('testFunction');
    });

    it('should handle error without message', () => {
      const error = {};
      const response = exceptionToErrorResponse(error);
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBe('[object Object]');
    });

    it('should handle string error', () => {
      const error = 'Something went wrong';
      const response = exceptionToErrorResponse(error);
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBe('Something went wrong');
    });

    it('should handle null error', () => {
      const response = exceptionToErrorResponse(null);
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBeDefined();
    });

    it('should handle undefined error', () => {
      const response = exceptionToErrorResponse(undefined);
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(response.error.message).toBeDefined();
    });

    it('should include stack trace in details', () => {
      const error = new Error('Test error');
      const response = exceptionToErrorResponse(error);
      
      expect(response.error.details).toBeDefined();
      expect(typeof response.error.details).toBe('string');
    });
  });
});
