import { describe, it, expect, beforeEach } from 'vitest';
import { registerHandler, clearHandlers, route } from '../../src/background/messageRouter.js';
import { MESSAGE_TYPES, createMessage, createResponse } from '../../src/shared/messageSchema.js';

describe('message router', () => {
  beforeEach(() => {
    clearHandlers();
  });

  it('routes messages to registered handlers', async () => {
    registerHandler('TEST_TYPE', async (message) => {
      return createResponse(message, 'TEST_RESPONSE', { payload: { ok: true } });
    });

    const message = createMessage('TEST_TYPE');
    const response = await route(message, {});

    expect(response.type).toBe('TEST_RESPONSE');
    expect(response.correlationId).toBe(message.correlationId);
    expect(response.inResponseTo).toBe(message.type);
    expect(response.payload).toEqual({ ok: true });
  });

  it('returns an error when no handler is registered', async () => {
    const message = createMessage('UNKNOWN_TYPE');
    const response = await route(message, {});

    expect(response.type).toBe(MESSAGE_TYPES.ERROR);
    expect(response.error.message).toContain('No handler registered for message type');
  });
});
