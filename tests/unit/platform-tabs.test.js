import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  queryTabs,
  getTab,
  createTab,
  updateTab,
  closeTabs,
  reloadTab,
  executeScript,
  onTabUpdated,
  onTabActivated,
  onTabRemoved
} from '../../src/platform/tabs.js';

// Mock chrome.tabs and chrome.scripting APIs
const mockTabs = {
  query: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reload: vi.fn(),
  onUpdated: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  },
  onActivated: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  },
  onRemoved: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  }
};

const mockScripting = {
  executeScript: vi.fn()
};

global.chrome = {
  tabs: mockTabs,
  scripting: mockScripting
};

describe('platform/tabs.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('queryTabs', () => {
    it('should query tabs with parameters', async () => {
      const tabs = [
        { id: 1, url: 'https://example.com' },
        { id: 2, url: 'https://google.com' }
      ];
      mockTabs.query.mockResolvedValue(tabs);

      const result = await queryTabs({ active: true });

      expect(result.success).toBe(true);
      expect(result.data.tabs).toEqual(tabs);
      expect(result.data.count).toBe(2);
      expect(mockTabs.query).toHaveBeenCalledWith({ active: true });
    });

    it('should query all tabs when no parameters', async () => {
      mockTabs.query.mockResolvedValue([]);

      const result = await queryTabs();

      expect(result.success).toBe(true);
      expect(result.data.tabs).toEqual([]);
      expect(result.data.count).toBe(0);
    });

    it('should handle errors', async () => {
      mockTabs.query.mockRejectedValue(new Error('Query failed'));

      const result = await queryTabs();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getTab', () => {
    it('should get tab by ID', async () => {
      const tab = { id: 123, url: 'https://example.com' };
      mockTabs.get.mockResolvedValue(tab);

      const result = await getTab(123);

      expect(result.success).toBe(true);
      expect(result.data.tab).toEqual(tab);
      expect(mockTabs.get).toHaveBeenCalledWith(123);
    });

    it('should handle tab not found', async () => {
      mockTabs.get.mockRejectedValue(new Error('Tab not found'));

      const result = await getTab(999);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TAB_NOT_FOUND');
    });
  });

  describe('createTab', () => {
    it('should create new tab', async () => {
      const newTab = { id: 456, url: 'https://example.com' };
      mockTabs.create.mockResolvedValue(newTab);

      const result = await createTab({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.data.tab).toEqual(newTab);
    });

    it('should handle creation error', async () => {
      mockTabs.create.mockRejectedValue(new Error('Create failed'));

      const result = await createTab({});

      expect(result.success).toBe(false);
    });
  });

  describe('updateTab', () => {
    it('should update tab properties', async () => {
      const updatedTab = { id: 123, url: 'https://new-url.com' };
      mockTabs.update.mockResolvedValue(updatedTab);

      const result = await updateTab(123, { url: 'https://new-url.com' });

      expect(result.success).toBe(true);
      expect(result.data.tab).toEqual(updatedTab);
    });

    it('should handle update error', async () => {
      mockTabs.update.mockRejectedValue(new Error('Update failed'));

      const result = await updateTab(123, {});

      expect(result.success).toBe(false);
    });
  });

  describe('closeTabs', () => {
    it('should close single tab', async () => {
      mockTabs.remove.mockResolvedValue(undefined);

      const result = await closeTabs(123);

      expect(result.success).toBe(true);
      expect(result.data.closed).toBe(1);
      expect(mockTabs.remove).toHaveBeenCalledWith(123);
    });

    it('should close multiple tabs', async () => {
      mockTabs.remove.mockResolvedValue(undefined);

      const result = await closeTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.data.closed).toBe(3);
    });

    it('should handle close error', async () => {
      mockTabs.remove.mockRejectedValue(new Error('Close failed'));

      const result = await closeTabs(123);

      expect(result.success).toBe(false);
    });
  });

  describe('reloadTab', () => {
    it('should reload tab', async () => {
      mockTabs.reload.mockResolvedValue(undefined);

      const result = await reloadTab(123);

      expect(result.success).toBe(true);
      expect(result.data.message).toBe('Tab reloaded');
    });

    it('should reload with bypass cache', async () => {
      mockTabs.reload.mockResolvedValue(undefined);

      const result = await reloadTab(123, { bypassCache: true });

      expect(result.success).toBe(true);
      expect(mockTabs.reload).toHaveBeenCalledWith(123, { bypassCache: true });
    });

    it('should handle reload error', async () => {
      mockTabs.reload.mockRejectedValue(new Error('Reload failed'));

      const result = await reloadTab(123);

      expect(result.success).toBe(false);
    });
  });

  describe('executeScript', () => {
    it('should execute script in tab', async () => {
      const results = [{ result: 'executed' }];
      mockScripting.executeScript.mockResolvedValue(results);

      const result = await executeScript(123, { func: () => {} });

      expect(result.success).toBe(true);
      expect(result.data.results).toEqual(results);
    });

    it('should handle execution error', async () => {
      mockScripting.executeScript.mockRejectedValue(new Error('Execution failed'));

      const result = await executeScript(123, {});

      expect(result.success).toBe(false);
    });
  });

  describe('onTabUpdated', () => {
    it('should register tab update listener', () => {
      const callback = vi.fn();

      const unsubscribe = onTabUpdated(callback);

      expect(mockTabs.onUpdated.addListener).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback on tab update', () => {
      const callback = vi.fn();
      onTabUpdated(callback);

      const listener = mockTabs.onUpdated.addListener.mock.calls[0][0];
      listener(123, { status: 'complete' }, { id: 123, url: 'https://example.com' });

      expect(callback).toHaveBeenCalledWith(123, { status: 'complete' }, expect.any(Object));
    });

    it('should unsubscribe listener', () => {
      const callback = vi.fn();
      const unsubscribe = onTabUpdated(callback);

      unsubscribe();

      expect(mockTabs.onUpdated.removeListener).toHaveBeenCalled();
    });
  });

  describe('onTabActivated', () => {
    it('should register tab activated listener', () => {
      const callback = vi.fn();

      const unsubscribe = onTabActivated(callback);

      expect(mockTabs.onActivated.addListener).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback on tab activation', () => {
      const callback = vi.fn();
      onTabActivated(callback);

      const listener = mockTabs.onActivated.addListener.mock.calls[0][0];
      listener({ tabId: 123, windowId: 456 });

      expect(callback).toHaveBeenCalledWith({ tabId: 123, windowId: 456 });
    });

    it('should unsubscribe listener', () => {
      const callback = vi.fn();
      const unsubscribe = onTabActivated(callback);

      unsubscribe();

      expect(mockTabs.onActivated.removeListener).toHaveBeenCalled();
    });
  });

  describe('onTabRemoved', () => {
    it('should register tab removed listener', () => {
      const callback = vi.fn();

      const unsubscribe = onTabRemoved(callback);

      expect(mockTabs.onRemoved.addListener).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback on tab removal', () => {
      const callback = vi.fn();
      onTabRemoved(callback);

      const listener = mockTabs.onRemoved.addListener.mock.calls[0][0];
      listener(123, { windowId: 456, isWindowClosing: false });

      expect(callback).toHaveBeenCalledWith(123, expect.any(Object));
    });

    it('should unsubscribe listener', () => {
      const callback = vi.fn();
      const unsubscribe = onTabRemoved(callback);

      unsubscribe();

      expect(mockTabs.onRemoved.removeListener).toHaveBeenCalled();
    });
  });
});
