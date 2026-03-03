/**
 * @fileoverview Unit Tests for Claude Content Script
 * Ticket: XST-814
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== DOM MOCKS =====

const mockElements = new Map();

vi.stubGlobal('document', {
  querySelector: vi.fn((sel) => mockElements.get(sel) || null),
  querySelectorAll: vi.fn((sel) => {
    const el = mockElements.get(sel);
    return el ? [el] : [];
  }),
  execCommand: vi.fn(() => true),
});

vi.stubGlobal('window', {
  location: { hostname: 'claude.ai', href: 'https://claude.ai/new' },
});

const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

vi.stubGlobal('chrome', mockChrome);

// ===== IMPORT =====

const {
  handleMessage,
  CLAUDE_SELECTORS,
  isLoggedIn,
} = await import('../../src/content/claude.js');

// ===== HELPERS =====

function callHandler(action, extraFields = {}) {
  return new Promise((resolve) => {
    handleMessage({ action, ...extraFields }, {}, resolve);
  });
}

// ===== TESTS =====

describe('Claude Content Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElements.clear();
  });

  // --- Selectors ---

  describe('selectors', () => {
    it('should define input selectors', () => {
      expect(CLAUDE_SELECTORS.input).toBeDefined();
      expect(CLAUDE_SELECTORS.input.length).toBeGreaterThan(0);
    });

    it('should define submit selectors', () => {
      expect(CLAUDE_SELECTORS.submit).toBeDefined();
      expect(CLAUDE_SELECTORS.submit.length).toBeGreaterThan(0);
    });

    it('should define response selectors', () => {
      expect(CLAUDE_SELECTORS.response).toBeDefined();
      expect(CLAUDE_SELECTORS.response.length).toBeGreaterThan(0);
    });

    it('should define loading selectors', () => {
      expect(CLAUDE_SELECTORS.loading).toBeDefined();
      expect(CLAUDE_SELECTORS.loading.length).toBeGreaterThan(0);
    });

    it('should define newChat selectors', () => {
      expect(CLAUDE_SELECTORS.newChat).toBeDefined();
      expect(CLAUDE_SELECTORS.newChat.length).toBeGreaterThan(0);
    });
  });

  // --- Ping ---

  describe('ping', () => {
    it('should respond with pong and provider=claude', async () => {
      const response = await callHandler('ping');
      expect(response.pong).toBe(true);
      expect(response.provider).toBe('claude');
      expect(response.hostname).toBe('claude.ai');
    });
  });

  // --- Login Check ---

  describe('check_login', () => {
    it('should report logged in when input area is found', async () => {
      const inputEl = { tagName: 'DIV', focus: vi.fn(), click: vi.fn() };
      mockElements.set(CLAUDE_SELECTORS.input[0], inputEl);

      const response = await callHandler('check_login');
      expect(response.loggedIn).toBe(true);
    });

    it('should report not logged in when login button found', async () => {
      mockElements.set('a[href*="/login"]', { tagName: 'A' });

      const response = await callHandler('check_login');
      expect(response.loggedIn).toBe(false);
    });
  });

  // --- Unknown action ---

  describe('unknown action', () => {
    it('should return error for unknown action', async () => {
      const response = await callHandler('unknown_action');
      expect(response.error).toContain('Unknown action');
    });
  });

  // --- isLoggedIn function ---

  describe('isLoggedIn', () => {
    it('should return true when input area is visible', () => {
      mockElements.set(CLAUDE_SELECTORS.input[0], { tagName: 'DIV' });
      expect(isLoggedIn()).toBe(true);
    });

    it('should return true when no indicators found (assume logged in)', () => {
      expect(isLoggedIn()).toBe(true);
    });
  });
});
