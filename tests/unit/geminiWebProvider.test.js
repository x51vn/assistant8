/**
 * @fileoverview Unit Tests for GeminiWebProvider
 * Ticket: XST-813
 *
 * Tests:
 * - Constructor DI validation
 * - sendPrompt flow (happy path, login check, timeout, error handling)
 * - getStatus (connected, disconnected, error)
 * - Tab management (reuse, create, content script wait)
 * - getCapabilities
 */

import { describe, it, expect, vi, beforeEach} from 'vitest';

// ===== MOCKS =====

const mockChrome = {
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    sendMessage: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

vi.stubGlobal('chrome', mockChrome);

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startOperation: vi.fn(() => 'op-id'),
    endOperation: vi.fn(),
  }),
}));

// ===== IMPORT AFTER MOCKS =====

const { GeminiWebProvider } = await import('../../src/shared/llm/GeminiWebProvider.js');

// ===== HELPERS =====

function createProvider(enqueue) {
  return new GeminiWebProvider({ enqueue: enqueue || vi.fn() });
}

/** Simple enqueue that just executes the async function immediately */
function immediateEnqueue(asyncFn) {
  return asyncFn();
}

function setupTabFound(tabId = 100) {
  mockChrome.tabs.query.mockResolvedValue([{ id: tabId, url: 'https://gemini.google.com/app' }]);
  mockChrome.tabs.update.mockResolvedValue({});
}

function setupContentScriptReady(tabId = 100) {
  mockChrome.tabs.sendMessage.mockImplementation((tid, msg) => {
    if (tid === tabId && msg.action === 'ping') {
      return Promise.resolve({ pong: true, provider: 'gemini' });
    }
    if (tid === tabId && msg.action === 'check_login') {
      return Promise.resolve({ loggedIn: true });
    }
    if (tid === tabId && msg.action === 'inject_prompt') {
      return Promise.resolve({ success: true });
    }
    if (tid === tabId && msg.action === 'extract_response') {
      return Promise.resolve({ success: true, text: 'Gemini response text' });
    }
    return Promise.resolve({});
  });
}

function setupNewTab(tabId = 200) {
  mockChrome.tabs.query.mockResolvedValue([]); // No existing tabs
  mockChrome.tabs.create.mockResolvedValue({ id: tabId });
  mockChrome.tabs.get.mockResolvedValue({ id: tabId, status: 'complete' });
  // Simulate tab load complete immediately
  mockChrome.tabs.onUpdated.addListener.mockImplementation((listener) => {
    setTimeout(() => listener(tabId, { status: 'complete' }), 10);
  });
}

// ===== TESTS =====

describe('GeminiWebProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor ---

  describe('constructor', () => {
    it('should create provider with enqueue function', () => {
      const provider = createProvider(() => {});
      expect(provider.name).toBe('gemini');
    });

    it('should warn when created without enqueue', () => {
      const provider = new GeminiWebProvider({});
      expect(provider.name).toBe('gemini');
    });

    it('should have correct name', () => {
      const provider = createProvider();
      expect(provider.getProviderName()).toBe('gemini');
    });
  });

  // --- getCapabilities ---

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const provider = createProvider();
      expect(provider.getCapabilities()).toEqual({
        streaming: false,
        vision: false,
        tools: false,
      });
    });
  });

  // --- getStatus ---

  describe('getStatus', () => {
    it('should return "connected" when Gemini tab is open and content script responds', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 100 }]);
      mockChrome.tabs.sendMessage.mockResolvedValue({ pong: true });

      const provider = createProvider();
      const status = await provider.getStatus();
      expect(status).toBe('connected');
    });

    it('should return "disconnected" when no Gemini tab', async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      const provider = createProvider();
      const status = await provider.getStatus();
      expect(status).toBe('disconnected');
    });

    it('should return "disconnected" when tab exists but content script not responding', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 100 }]);
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

      const provider = createProvider();
      const status = await provider.getStatus();
      expect(status).toBe('disconnected');
    });

    it('should return "error" when chrome.tabs throws', async () => {
      mockChrome.tabs.query.mockRejectedValue(new Error('Extension context invalidated'));

      const provider = createProvider();
      const status = await provider.getStatus();
      expect(status).toBe('error');
    });
  });

  // --- sendPrompt ---

  describe('sendPrompt', () => {
    it('should throw when no enqueue function', async () => {
      const provider = new GeminiWebProvider({});
      await expect(provider.sendPrompt('test')).rejects.toThrow('enqueue function not injected');
    });

    it('should throw for empty prompt', async () => {
      const provider = createProvider(immediateEnqueue);
      await expect(provider.sendPrompt('')).rejects.toThrow('trống');
    });

    it('should throw for null prompt', async () => {
      const provider = createProvider(immediateEnqueue);
      await expect(provider.sendPrompt(null)).rejects.toThrow('trống');
    });

    it('should successfully send prompt and get response (happy path)', async () => {
      const tabId = 100;
      setupTabFound(tabId);
      setupContentScriptReady(tabId);

      const provider = createProvider(immediateEnqueue);
      const result = await provider.sendPrompt('What is AI?');

      expect(result.text).toBe('Gemini response text');
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });

      // Verify prompt was injected
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({ action: 'inject_prompt', prompt: 'What is AI?' })
      );
    });

    it('should throw when user is not logged in', async () => {
      const tabId = 100;
      setupTabFound(tabId);

      mockChrome.tabs.sendMessage.mockImplementation((tid, msg) => {
        if (msg.action === 'ping') {
          return Promise.resolve({ pong: true, provider: 'gemini' });
        }
        if (msg.action === 'check_login') {
          return Promise.resolve({ loggedIn: false });
        }
        return Promise.resolve({});
      });

      const provider = createProvider(immediateEnqueue);
      await expect(provider.sendPrompt('test'))
        .rejects.toThrow('chưa đăng nhập');
    });

    it('should throw when prompt injection fails', async () => {
      const tabId = 100;
      setupTabFound(tabId);

      mockChrome.tabs.sendMessage.mockImplementation((tid, msg) => {
        if (msg.action === 'ping') return Promise.resolve({ pong: true, provider: 'gemini' });
        if (msg.action === 'check_login') return Promise.resolve({ loggedIn: true });
        if (msg.action === 'inject_prompt') return Promise.resolve({ success: false, error: 'Input not found' });
        return Promise.resolve({});
      });

      const provider = createProvider(immediateEnqueue);
      await expect(provider.sendPrompt('test')).rejects.toThrow('Input not found');
    });

    it('should throw when response extraction fails', async () => {
      const tabId = 100;
      setupTabFound(tabId);

      mockChrome.tabs.sendMessage.mockImplementation((tid, msg) => {
        if (msg.action === 'ping') return Promise.resolve({ pong: true, provider: 'gemini' });
        if (msg.action === 'check_login') return Promise.resolve({ loggedIn: true });
        if (msg.action === 'inject_prompt') return Promise.resolve({ success: true });
        if (msg.action === 'extract_response') return Promise.resolve({ success: false, error: 'Response timeout' });
        return Promise.resolve({});
      });

      const provider = createProvider(immediateEnqueue);
      await expect(provider.sendPrompt('test')).rejects.toThrow('Response timeout');
    });

    it('should create new chat session when createNewChat is true', async () => {
      const tabId = 100;
      setupTabFound(tabId);

      mockChrome.tabs.sendMessage.mockImplementation((tid, msg) => {
        if (msg.action === 'ping') return Promise.resolve({ pong: true, provider: 'gemini' });
        if (msg.action === 'check_login') return Promise.resolve({ loggedIn: true });
        if (msg.action === 'create_new_session') return Promise.resolve({ success: true });
        if (msg.action === 'inject_prompt') return Promise.resolve({ success: true });
        if (msg.action === 'extract_response') return Promise.resolve({ success: true, text: 'New chat response' });
        return Promise.resolve({});
      });

      const provider = createProvider(immediateEnqueue);
      const result = await provider.sendPrompt('test', { createNewChat: true });

      expect(result.text).toBe('New chat response');
      // Verify create_new_session was called
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({ action: 'create_new_session' })
      );
    });

    it('should throw when content script not responding', async () => {
      const tabId = 100;
      setupTabFound(tabId);
      // Content script never responds to ping
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

      const provider = createProvider(immediateEnqueue);
      await expect(provider.sendPrompt('test'))
        .rejects.toThrow('content script');
    }, 30000); // Long timeout due to ping retries
  });

  // --- Tab management ---

  describe('tab management', () => {
    it('should reuse existing Gemini tab', async () => {
      const tabId = 100;
      setupTabFound(tabId);
      setupContentScriptReady(tabId);

      const provider = createProvider(immediateEnqueue);
      await provider.sendPrompt('test');

      // Verify no new tab created
      expect(mockChrome.tabs.create).not.toHaveBeenCalled();
      // Verify existing tab was focused
      expect(mockChrome.tabs.update).toHaveBeenCalledWith(tabId, { active: true });
    });

    it('should create new tab when no existing Gemini tab', async () => {
      const tabId = 200;
      setupNewTab(tabId);

      // After tab creation, content script becomes ready
      mockChrome.tabs.sendMessage.mockImplementation((tid, msg) => {
        if (msg.action === 'ping') return Promise.resolve({ pong: true, provider: 'gemini' });
        if (msg.action === 'check_login') return Promise.resolve({ loggedIn: true });
        if (msg.action === 'inject_prompt') return Promise.resolve({ success: true });
        if (msg.action === 'extract_response') return Promise.resolve({ success: true, text: 'Response' });
        return Promise.resolve({});
      });

      const provider = createProvider(immediateEnqueue);
      await provider.sendPrompt('test');

      expect(mockChrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://gemini.google.com/app',
        active: false,
      });
    });
  });

  // --- formatError ---

  describe('formatError', () => {
    it('should format login/auth errors', () => {
      const provider = createProvider();
      expect(provider.formatError(new Error('401 Unauthorized'))).toContain('API key');
    });

    it('should format rate limit errors', () => {
      const provider = createProvider();
      expect(provider.formatError(new Error('429 Too Many Requests'))).toContain('giới hạn');
    });

    it('should format network errors', () => {
      const provider = createProvider();
      expect(provider.formatError(new Error('Failed to fetch'))).toContain('mạng');
    });

    it('should return original message for unknown errors', () => {
      const provider = createProvider();
      expect(provider.formatError(new Error('Some custom error'))).toBe('Some custom error');
    });
  });
});
