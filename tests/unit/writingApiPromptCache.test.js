import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPES } from '../../src/shared/messageSchema.js';
import { sendWritingJob } from '../../src/ui-preact/api/writingApi.js';

describe('writingApi prompt loading', () => {
  beforeEach(() => {
    global.chrome = {
      runtime: {
        sendMessage: vi.fn()
      }
    };
  });

  function mockTemplateAndSend(templateContent = 'Write: {{keyPoints}}') {
    chrome.runtime.sendMessage
      .mockResolvedValueOnce({
        prompts: {
          'writing.email': {
            key: 'writing.email',
            content: templateContent
          }
        }
      })
      .mockResolvedValueOnce({ success: true, text: 'ok' });
  }

  it('requests writing templates through the cache-aware prompt handler', async () => {
    mockTemplateAndSend();

    const result = await sendWritingJob('email', { keyPoints: 'A' }, {});

    expect(result.success).toBe(true);
    const templateRequest = chrome.runtime.sendMessage.mock.calls[0][0];
    expect(templateRequest.type).toBe(MESSAGE_TYPES.PROMPTS_GET_BY_TYPE);
    expect(templateRequest.data).toEqual({ promptType: 'writing', preferCache: true });
  });

  it('does not keep a long-lived local template cache between writing jobs', async () => {
    mockTemplateAndSend('First: {{keyPoints}}');
    mockTemplateAndSend('Second: {{keyPoints}}');

    await sendWritingJob('email', { keyPoints: 'A' }, {});
    await sendWritingJob('email', { keyPoints: 'B' }, {});

    const templateRequests = chrome.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === MESSAGE_TYPES.PROMPTS_GET_BY_TYPE);
    expect(templateRequests).toHaveLength(2);
  });
});
