import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StorageArea,
  storageGet,
  storageSet,
  storageRemove,
  storageClear,
  storageGetBytesInUse,
  onStorageChanged
} from '../../src/platform/storage.js';

// Mock chrome.storage API
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getBytesInUse: vi.fn()
  },
  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getBytesInUse: vi.fn()
  },
  session: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn()
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn()
  }
};

global.chrome = {
  storage: mockStorage
};

describe('platform/storage.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('StorageArea', () => {
    it('should define all storage areas', () => {
      expect(StorageArea.LOCAL).toBe('local');
      expect(StorageArea.SYNC).toBe('sync');
      expect(StorageArea.SESSION).toBe('session');
    });
  });

  describe('storageGet', () => {
    it('should get items from local storage', async () => {
      mockStorage.local.get.mockResolvedValue({ key1: 'value1' });

      const result = await storageGet('key1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key1: 'value1' });
      expect(mockStorage.local.get).toHaveBeenCalledWith('key1');
    });

    it('should get multiple items', async () => {
      mockStorage.local.get.mockResolvedValue({ key1: 'value1', key2: 'value2' });

      const result = await storageGet(['key1', 'key2']);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should get all items when null is passed', async () => {
      mockStorage.local.get.mockResolvedValue({ all: 'data' });

      const result = await storageGet(null);

      expect(result.success).toBe(true);
      expect(mockStorage.local.get).toHaveBeenCalledWith(null);
    });

    it('should get from sync storage', async () => {
      mockStorage.sync.get.mockResolvedValue({ syncKey: 'syncValue' });

      const result = await storageGet('syncKey', StorageArea.SYNC);

      expect(result.success).toBe(true);
      expect(mockStorage.sync.get).toHaveBeenCalled();
    });

    it('should get from session storage', async () => {
      mockStorage.session.get.mockResolvedValue({ sessionKey: 'sessionValue' });

      const result = await storageGet('sessionKey', StorageArea.SESSION);

      expect(result.success).toBe(true);
      expect(mockStorage.session.get).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await storageGet('key');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Storage error');
    });

    it('should handle invalid storage area', async () => {
      const result = await storageGet('key', 'invalid');

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Invalid storage area');
    });
  });

  describe('storageSet', () => {
    it('should set items in local storage', async () => {
      mockStorage.local.set.mockResolvedValue(undefined);

      const result = await storageSet({ key: 'value' });

      expect(result.success).toBe(true);
      expect(result.data.keysSet).toBe(1);
      expect(mockStorage.local.set).toHaveBeenCalledWith({ key: 'value' });
    });

    it('should set multiple items', async () => {
      mockStorage.local.set.mockResolvedValue(undefined);

      const result = await storageSet({ key1: 'value1', key2: 'value2' });

      expect(result.success).toBe(true);
      expect(result.data.keysSet).toBe(2);
    });

    it('should set in sync storage', async () => {
      mockStorage.sync.set.mockResolvedValue(undefined);

      const result = await storageSet({ key: 'value' }, StorageArea.SYNC);

      expect(result.success).toBe(true);
      expect(mockStorage.sync.set).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockStorage.local.set.mockRejectedValue(new Error('Quota exceeded'));

      const result = await storageSet({ key: 'value' });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Quota exceeded');
    });
  });

  describe('storageRemove', () => {
    it('should remove single key', async () => {
      mockStorage.local.remove.mockResolvedValue(undefined);

      const result = await storageRemove('key');

      expect(result.success).toBe(true);
      expect(result.data.keysRemoved).toBe(1);
      expect(mockStorage.local.remove).toHaveBeenCalledWith('key');
    });

    it('should remove multiple keys', async () => {
      mockStorage.local.remove.mockResolvedValue(undefined);

      const result = await storageRemove(['key1', 'key2']);

      expect(result.success).toBe(true);
      expect(result.data.keysRemoved).toBe(2);
    });

    it('should handle errors', async () => {
      mockStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      const result = await storageRemove('key');

      expect(result.success).toBe(false);
    });
  });

  describe('storageClear', () => {
    it('should clear local storage', async () => {
      mockStorage.local.clear.mockResolvedValue(undefined);

      const result = await storageClear();

      expect(result.success).toBe(true);
      expect(result.data.message).toBe('Storage cleared');
      expect(mockStorage.local.clear).toHaveBeenCalled();
    });

    it('should clear sync storage', async () => {
      mockStorage.sync.clear.mockResolvedValue(undefined);

      const result = await storageClear(StorageArea.SYNC);

      expect(result.success).toBe(true);
      expect(mockStorage.sync.clear).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockStorage.local.clear.mockRejectedValue(new Error('Clear failed'));

      const result = await storageClear();

      expect(result.success).toBe(false);
    });
  });

  describe('storageGetBytesInUse', () => {
    it('should get bytes in use for keys', async () => {
      mockStorage.local.getBytesInUse.mockResolvedValue(1024);

      const result = await storageGetBytesInUse('key');

      expect(result.success).toBe(true);
      expect(result.data.bytes).toBe(1024);
    });

    it('should get total bytes when null is passed', async () => {
      mockStorage.local.getBytesInUse.mockResolvedValue(2048);

      const result = await storageGetBytesInUse(null);

      expect(result.success).toBe(true);
      expect(result.data.bytes).toBe(2048);
    });

    it('should handle unsupported storage area', async () => {
      delete mockStorage.session.getBytesInUse;

      const result = await storageGetBytesInUse('key', StorageArea.SESSION);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('not supported');
    });

    it('should handle errors', async () => {
      mockStorage.local.getBytesInUse.mockRejectedValue(new Error('Query failed'));

      const result = await storageGetBytesInUse('key');

      expect(result.success).toBe(false);
    });
  });

  describe('onStorageChanged', () => {
    it('should register storage change listener', () => {
      const callback = vi.fn();

      const unsubscribe = onStorageChanged(callback);

      expect(mockStorage.onChanged.addListener).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback on storage change', () => {
      const callback = vi.fn();
      onStorageChanged(callback);

      const listener = mockStorage.onChanged.addListener.mock.calls[0][0];
      const changes = { key: { newValue: 'new', oldValue: 'old' } };
      listener(changes, 'local');

      expect(callback).toHaveBeenCalledWith(changes, 'local');
    });

    it('should unsubscribe listener', () => {
      const callback = vi.fn();
      const unsubscribe = onStorageChanged(callback);

      unsubscribe();

      expect(mockStorage.onChanged.removeListener).toHaveBeenCalled();
    });
  });
});
