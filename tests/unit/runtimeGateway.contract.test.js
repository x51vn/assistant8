import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendRuntimeMessage } from '../../src/ui-preact/api/runtimeGateway.js';
import { MESSAGE_TYPES } from '../../src/shared/messageSchema.js';

describe('runtimeGateway contract', () => {
  beforeEach(() => {
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: true }),
      },
    };
  });

  it('sends standardized envelope for settings message', async () => {
    await sendRuntimeMessage(MESSAGE_TYPES.SETTINGS_GET);
    const sent = chrome.runtime.sendMessage.mock.calls[0][0];

    expect(sent.type).toBe(MESSAGE_TYPES.SETTINGS_GET);
    expect(sent.v).toBe(1);
    expect(typeof sent.correlationId).toBe('string');
    expect(typeof sent.timestamp).toBe('number');
    expect(sent.domainVersion).toBe('settings@1');
  });

  it('attaches payload and stockResearch domain version', async () => {
    await sendRuntimeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, {
      data: { symbol: 'FPT' },
      correlationId: 'manual-cid',
    });
    const sent = chrome.runtime.sendMessage.mock.calls[0][0];

    expect(sent.type).toBe(MESSAGE_TYPES.STOCK_RESEARCH_RUN);
    expect(sent.data).toEqual({ symbol: 'FPT' });
    expect(sent.correlationId).toBe('manual-cid');
    expect(sent.domainVersion).toBe('stockResearch@1');
  });
});

