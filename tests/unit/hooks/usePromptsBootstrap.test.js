import { beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { waitFor } from '../../test-utils/preact-render.js';
import { render } from '../../test-utils/preact-render.js';

const { allPromptsMock, loadAllPromptsMock } = vi.hoisted(() => ({
  allPromptsMock: { value: {} },
  loadAllPromptsMock: vi.fn()
}));

vi.mock('../../../src/ui-preact/state/settingsState.js', () => ({
  allPrompts: allPromptsMock
}));

vi.mock('../../../src/ui-preact/api/settingsApi.js', () => ({
  loadAllPrompts: loadAllPromptsMock
}));

import { usePromptsBootstrap } from '../../../src/ui-preact/hooks/usePromptsBootstrap.js';

function Harness({ user }) {
  usePromptsBootstrap(user);
  return h('div', { 'data-testid': 'harness' }, user?.id || 'none');
}

describe('usePromptsBootstrap', () => {
  beforeEach(() => {
    allPromptsMock.value = {};
    loadAllPromptsMock.mockReset();
    loadAllPromptsMock.mockResolvedValue({
      'prompt.master': { key: 'prompt.master', content: 'loaded' }
    });
  });

  it('loads prompts once for an authenticated user and writes allPrompts', async () => {
    render(h(Harness, { user: { id: 'user-a' } }));

    await waitFor(() => {
      expect(loadAllPromptsMock).toHaveBeenCalledWith({ preferCache: true });
    });

    expect(loadAllPromptsMock).toHaveBeenCalledTimes(1);
    expect(allPromptsMock.value['prompt.master'].content).toBe('loaded');
  });

  it('does not reload for the same user after remount/rerender', async () => {
    const rendered = render(h(Harness, { user: { id: 'user-a' } }));

    await waitFor(() => {
      expect(loadAllPromptsMock).toHaveBeenCalledTimes(1);
    });

    rendered.rerender(h(Harness, { user: { id: 'user-a' } }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadAllPromptsMock).toHaveBeenCalledTimes(1);
  });

  it('clears prompts when user logs out', async () => {
    const rendered = render(h(Harness, { user: { id: 'user-a' } }));

    await waitFor(() => {
      expect(allPromptsMock.value['prompt.master']).toBeDefined();
    });

    rendered.rerender(h(Harness, { user: null }));

    await waitFor(() => {
      expect(allPromptsMock.value).toEqual({});
    });
  });

  it('reloads prompts when user id changes', async () => {
    const rendered = render(h(Harness, { user: { id: 'user-a' } }));

    await waitFor(() => {
      expect(loadAllPromptsMock).toHaveBeenCalledTimes(1);
    });

    loadAllPromptsMock.mockResolvedValueOnce({
      'prompt.master': { key: 'prompt.master', content: 'user-b' }
    });

    rendered.rerender(h(Harness, { user: { id: 'user-b' } }));

    await waitFor(() => {
      expect(loadAllPromptsMock).toHaveBeenCalledTimes(2);
    });

    expect(allPromptsMock.value['prompt.master'].content).toBe('user-b');
  });
});
