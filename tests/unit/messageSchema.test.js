import { describe, it, expect } from 'vitest';
import {
  MESSAGE_TYPES,
  MESSAGE_VERSION,
  createMessage,
  createResponse,
  createErrorResponse,
  isValidMessage,
  isPingMessage,
  isChatGPTMessage,
  isErrorMessage
} from '../../src/shared/messageSchema.js';

describe('messageSchema.js', () => {
  describe('MESSAGE_VERSION', () => {
    it('should be defined as number', () => {
      expect(typeof MESSAGE_VERSION).toBe('number');
      expect(MESSAGE_VERSION).toBe(1);
    });
  });

  describe('MESSAGE_TYPES', () => {
    it('should define all message types', () => {
      expect(MESSAGE_TYPES.PING).toBe('PING');
      expect(MESSAGE_TYPES.PONG).toBe('PONG');
      expect(MESSAGE_TYPES.SESSION_CREATE).toBe('SESSION_CREATE');
      expect(MESSAGE_TYPES.SESSION_CREATED).toBe('SESSION_CREATED');
      expect(MESSAGE_TYPES.CHATGPT_SEND_INPUT).toBe('CHATGPT_SEND_INPUT');
      expect(MESSAGE_TYPES.CHATGPT_INPUT_SENT).toBe('CHATGPT_INPUT_SENT');
      expect(MESSAGE_TYPES.CHATGPT_GET_OUTPUT).toBe('CHATGPT_GET_OUTPUT');
      expect(MESSAGE_TYPES.CHATGPT_OUTPUT_READY).toBe('CHATGPT_OUTPUT_READY');
      expect(MESSAGE_TYPES.CHATGPT_FILL_PROMPT).toBe('CHATGPT_FILL_PROMPT');
      expect(MESSAGE_TYPES.ERROR).toBe('ERROR');
    });

    it('should have unique message type values', () => {
      const values = Object.values(MESSAGE_TYPES);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('createMessage', () => {
    it('creates a base message with required fields', () => {
      const msg = createMessage(MESSAGE_TYPES.PING, { payload: { ok: true } });

      expect(msg.v).toBe(MESSAGE_VERSION);
      expect(msg.type).toBe(MESSAGE_TYPES.PING);
      expect(typeof msg.correlationId).toBe('string');
      expect(typeof msg.timestamp).toBe('number');
      expect(msg.payload).toEqual({ ok: true });
      expect(isValidMessage(msg)).toBe(true);
    });

    it('should create message without payload', () => {
      const msg = createMessage(MESSAGE_TYPES.PING);

      expect(msg.v).toBe(MESSAGE_VERSION);
      expect(msg.type).toBe(MESSAGE_TYPES.PING);
      expect(msg.correlationId).toBeDefined();
      expect(msg.timestamp).toBeDefined();
    });

    it('should generate unique correlation IDs', () => {
      const msg1 = createMessage(MESSAGE_TYPES.PING);
      const msg2 = createMessage(MESSAGE_TYPES.PING);

      expect(msg1.correlationId).not.toBe(msg2.correlationId);
    });

    it('should set timestamp to current time', () => {
      const before = Date.now();
      const msg = createMessage(MESSAGE_TYPES.PING);
      const after = Date.now();

      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });

    it('should merge payload properties', () => {
      const msg = createMessage(MESSAGE_TYPES.PING, { 
        custom1: 'value1',
        custom2: 123
      });

      expect(msg.custom1).toBe('value1');
      expect(msg.custom2).toBe(123);
    });
  });

  describe('createResponse', () => {
    it('creates a response message linked to the original', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createResponse(original, MESSAGE_TYPES.PONG, { payload: { pong: true } });

      expect(response.v).toBe(MESSAGE_VERSION);
      expect(response.type).toBe(MESSAGE_TYPES.PONG);
      expect(response.correlationId).toBe(original.correlationId);
      expect(response.inResponseTo).toBe(original.type);
    });

    it('should preserve correlation ID from original', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createResponse(original, MESSAGE_TYPES.PONG);

      expect(response.correlationId).toBe(original.correlationId);
    });

    it('should set inResponseTo field', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createResponse(original, MESSAGE_TYPES.PONG);

      expect(response.inResponseTo).toBe(MESSAGE_TYPES.PING);
    });

    it('should merge payload', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createResponse(original, MESSAGE_TYPES.PONG, {
        data: 'test',
        success: true
      });

      expect(response.data).toBe('test');
      expect(response.success).toBe(true);
    });
  });

  describe('createErrorResponse', () => {
    it('creates an error response with error metadata', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createErrorResponse(original, 'E_TEST', 'bad things', { detail: true });

      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(response.error.code).toBe('E_TEST');
      expect(response.error.message).toBe('bad things');
      expect(response.error.details).toEqual({ detail: true });
    });

    it('should preserve correlation ID', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createErrorResponse(original, 'E_TEST', 'error');

      expect(response.correlationId).toBe(original.correlationId);
    });

    it('should set inResponseTo field', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createErrorResponse(original, 'E_TEST', 'error');

      expect(response.inResponseTo).toBe(MESSAGE_TYPES.PING);
    });

    it('should handle null details', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createErrorResponse(original, 'E_TEST', 'error', null);

      expect(response.error.details).toBe(null);
    });

    it('should handle undefined details', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createErrorResponse(original, 'E_TEST', 'error');

      expect(response.error.details).toBe(null);
    });

    it('should include error structure', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const response = createErrorResponse(original, 'CODE', 'message', { extra: 'data' });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('CODE');
      expect(response.error.message).toBe('message');
      expect(response.error.details).toEqual({ extra: 'data' });
    });
  });

  describe('isValidMessage', () => {
    it('validates message structure and type guards', () => {
      expect(isValidMessage(null)).toBe(false);
      expect(isValidMessage({})).toBe(false);
      expect(isValidMessage({ v: 1, type: 'X', correlationId: '' })).toBe(false);

      const chatMsg = createMessage(MESSAGE_TYPES.CHATGPT_SEND_INPUT);
      expect(isChatGPTMessage(chatMsg)).toBe(true);

      const errorMsg = createErrorResponse(chatMsg, 'E', 'err');
      expect(isErrorMessage(errorMsg)).toBe(true);
    });

    it('should reject non-object messages', () => {
      expect(isValidMessage(null)).toBe(false);
      expect(isValidMessage(undefined)).toBe(false);
      expect(isValidMessage('string')).toBe(false);
      expect(isValidMessage(123)).toBe(false);
      expect(isValidMessage(true)).toBe(false);
    });

    it('should reject messages without version', () => {
      expect(isValidMessage({ type: 'TEST', correlationId: 'id' })).toBe(false);
    });

    it('should reject messages with wrong version', () => {
      expect(isValidMessage({ v: 999, type: 'TEST', correlationId: 'id' })).toBe(false);
    });

    it('should reject messages without type', () => {
      expect(isValidMessage({ v: MESSAGE_VERSION, correlationId: 'id' })).toBe(false);
    });

    it('should reject messages with empty type', () => {
      expect(isValidMessage({ v: MESSAGE_VERSION, type: '', correlationId: 'id' })).toBe(false);
    });

    it('should reject messages without correlationId', () => {
      expect(isValidMessage({ v: MESSAGE_VERSION, type: 'TEST' })).toBe(false);
    });

    it('should reject messages with empty correlationId', () => {
      expect(isValidMessage({ v: MESSAGE_VERSION, type: 'TEST', correlationId: '' })).toBe(false);
    });

    it('should accept valid message', () => {
      const msg = createMessage(MESSAGE_TYPES.PING);
      expect(isValidMessage(msg)).toBe(true);
    });
  });

  describe('isPingMessage', () => {
    it('should identify PING messages', () => {
      const msg = createMessage(MESSAGE_TYPES.PING);
      expect(isPingMessage(msg)).toBe(true);
    });

    it('should reject non-PING messages', () => {
      const msg = createMessage(MESSAGE_TYPES.PONG);
      expect(isPingMessage(msg)).toBe(false);
    });

    it('should reject invalid messages', () => {
      expect(isPingMessage(null)).toBe(false);
      expect(isPingMessage({})).toBe(false);
    });
  });

  describe('isChatGPTMessage', () => {
    it('should identify CHATGPT messages', () => {
      const msg1 = createMessage(MESSAGE_TYPES.CHATGPT_SEND_INPUT);
      const msg2 = createMessage(MESSAGE_TYPES.CHATGPT_GET_OUTPUT);
      const msg3 = createMessage(MESSAGE_TYPES.CHATGPT_FILL_PROMPT);
      
      expect(isChatGPTMessage(msg1)).toBe(true);
      expect(isChatGPTMessage(msg2)).toBe(true);
      expect(isChatGPTMessage(msg3)).toBe(true);
    });

    it('should reject non-CHATGPT messages', () => {
      const msg = createMessage(MESSAGE_TYPES.PING);
      expect(isChatGPTMessage(msg)).toBe(false);
    });

    it('should reject invalid messages', () => {
      expect(isChatGPTMessage(null)).toBe(false);
      expect(isChatGPTMessage({})).toBe(false);
    });
  });

  describe('isErrorMessage', () => {
    it('should identify ERROR messages', () => {
      const original = createMessage(MESSAGE_TYPES.PING);
      const errorMsg = createErrorResponse(original, 'E', 'err');
      
      expect(isErrorMessage(errorMsg)).toBe(true);
    });

    it('should reject non-ERROR messages', () => {
      const msg = createMessage(MESSAGE_TYPES.PING);
      expect(isErrorMessage(msg)).toBe(false);
    });

    it('should reject invalid messages', () => {
      expect(isErrorMessage(null)).toBe(false);
      expect(isErrorMessage({})).toBe(false);
    });
  });
});
