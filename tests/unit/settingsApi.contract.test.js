import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/ui-preact/api/writingApi.js', () => ({
  clearTemplateCache: vi.fn(),
}));

vi.mock('../../src/ui-preact/state/settingsState.js', () => ({
  allPrompts: { value: { 'prompt.master': { content: 'test prompt' } } },
  autoRun: { value: false },
  evaluatePrevious: { value: false },
  reviewPrompt: { value: false },
  realtimeEnabled: { value: false },
  interval: { value: 5 },
  atlassianBaseUrl: { value: '' },
  atlassianEmail: { value: '' },
  atlassianApiToken: { value: '' },
}));

import { loadAllPrompts, loadSettings, saveSettings } from '../../src/ui-preact/api/settingsApi.js';
import { MESSAGE_TYPES } from '../../src/shared/messageSchema.js';

describe('settingsApi request contract', () => {
  beforeEach(() => {
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ config: {} }),
      },
    };
  });

  it('loadSettings sends SETTINGS_GET with required envelope fields', async () => {
    await loadSettings();
    const sent = chrome.runtime.sendMessage.mock.calls[0][0];

    expect(sent.type).toBe(MESSAGE_TYPES.SETTINGS_GET);
    expect(sent.v).toBe(1);
    expect(typeof sent.correlationId).toBe('string');
    expect(typeof sent.timestamp).toBe('number');
  });

  it('saveSettings sends SETTINGS_UPDATE with data.config', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true });
    await saveSettings();
    const sent = chrome.runtime.sendMessage.mock.calls[0][0];

    expect(sent.type).toBe(MESSAGE_TYPES.SETTINGS_UPDATE);
    expect(sent.data).toBeDefined();
    expect(sent.data.config).toBeDefined();
  });

  it('loadAllPrompts forwards cache options to PROMPTS_GET_ALL', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ success: true, prompts: {} });

    await loadAllPrompts({ preferCache: true, forceRefresh: true });
    const sent = chrome.runtime.sendMessage.mock.calls[0][0];

    expect(sent.type).toBe(MESSAGE_TYPES.PROMPTS_GET_ALL);
    expect(sent.data).toEqual({ preferCache: true, forceRefresh: true });
  });
});
