import { describe, it, expect } from 'vitest';
import {
  MESSAGE_TYPES,
  MESSAGE_VERSION,
  createMessage,
  createResponse,
  createErrorResponse,
  isValidMessage,
  isChatGPTMessage,
  isErrorMessage
} from '../../src/shared/messageSchema.js';

describe('message schema', () => {
  it('creates a base message with required fields', () => {
    const msg = createMessage(MESSAGE_TYPES.PING, { payload: { ok: true } });

    expect(msg.v).toBe(MESSAGE_VERSION);
    expect(msg.type).toBe(MESSAGE_TYPES.PING);
    expect(typeof msg.correlationId).toBe('string');
    expect(typeof msg.timestamp).toBe('number');
    expect(msg.payload).toEqual({ ok: true });
    expect(isValidMessage(msg)).toBe(true);
  });

  it('creates a response message linked to the original', () => {
    const original = createMessage(MESSAGE_TYPES.PING);
    const response = createResponse(original, MESSAGE_TYPES.PONG, { payload: { pong: true } });

    expect(response.v).toBe(MESSAGE_VERSION);
    expect(response.type).toBe(MESSAGE_TYPES.PONG);
    expect(response.correlationId).toBe(original.correlationId);
    expect(response.inResponseTo).toBe(original.type);
  });

  it('creates an error response with error metadata', () => {
    const original = createMessage(MESSAGE_TYPES.PING);
    const response = createErrorResponse(original, 'E_TEST', 'bad things', { detail: true });

    expect(response.type).toBe(MESSAGE_TYPES.ERROR);
    expect(response.error.code).toBe('E_TEST');
    expect(response.error.message).toBe('bad things');
    expect(response.error.details).toEqual({ detail: true });
  });

  it('validates message structure and type guards', () => {
    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage({})).toBe(false);
    expect(isValidMessage({ v: 1, type: 'X', correlationId: '' })).toBe(false);

    const chatMsg = createMessage(MESSAGE_TYPES.CHATGPT_SEND_INPUT);
    expect(isChatGPTMessage(chatMsg)).toBe(true);

    const errorMsg = createErrorResponse(chatMsg, 'E', 'err');
    expect(isErrorMessage(errorMsg)).toBe(true);
  });
});
