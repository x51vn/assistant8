/**
 * @fileoverview Unit Tests for Gemini Content Script
 * Ticket: XST-813
 *
 * Tests:
 * - Message handler dispatch
 * - Ping response
 * - Login check
 * - Selector definitions
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
  location: { hostname: 'gemini.google.com', href: 'https://gemini.google.com/app' },
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
  GEMINI_SELECTORS,
  isLoggedIn,
} = await import('../../src/content/gemini.js');

// ===== HELPERS =====

function callHandler(action, extraFields = {}) {
  return new Promise((resolve) => {
    handleMessage({ action, ...extraFields }, {}, resolve);
  });
}

// ===== TESTS =====

describe('Gemini Content Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElements.clear();
  });

  // --- Selectors ---

  describe('selectors', () => {
    it('should define input selectors', () => {
      expect(GEMINI_SELECTORS.input).toBeDefined();
      expect(GEMINI_SELECTORS.input.length).toBeGreaterThan(0);
    });

    it('should define submit selectors', () => {
      expect(GEMINI_SELECTORS.submit).toBeDefined();
      expect(GEMINI_SELECTORS.submit.length).toBeGreaterThan(0);
    });

    it('should define response selectors', () => {
      expect(GEMINI_SELECTORS.response).toBeDefined();
      expect(GEMINI_SELECTORS.response.length).toBeGreaterThan(0);
    });

    it('should define loading selectors', () => {
      expect(GEMINI_SELECTORS.loading).toBeDefined();
      expect(GEMINI_SELECTORS.loading.length).toBeGreaterThan(0);
    });
  });

  // --- Ping ---

  describe('ping', () => {
    it('should respond with pong and provider', async () => {
      const response = await callHandler('ping');
      expect(response.pong).toBe(true);
      expect(response.provider).toBe('gemini');
      expect(response.hostname).toBe('gemini.google.com');
    });
  });

  // --- Login Check ---

  describe('check_login', () => {
    it('should report logged in when input area is found', async () => {
      // Simulate input area present
      const inputEl = { tagName: 'DIV', focus: vi.fn(), click: vi.fn() };
      mockElements.set(GEMINI_SELECTORS.input[0], inputEl);

      const response = await callHandler('check_login');
      expect(response.loggedIn).toBe(true);
    });

    it('should report not logged in when sign-in button found', async () => {
      // No input area, but sign-in button present
      mockElements.set('a[href*="accounts.google.com"]', { tagName: 'A' });

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

  // --- Message listener registration ---
  // Note: Module-level initialization (addListener, sendMessage) runs at import time
  // and is difficult to test reliably in Vitest. The core behavior (message handling,
  // selectors, login check) is tested above.

  // --- isLoggedIn function ---

  describe('isLoggedIn', () => {
    it('should return true when input area is visible', () => {
      mockElements.set(GEMINI_SELECTORS.input[0], { tagName: 'DIV' });
      expect(isLoggedIn()).toBe(true);
    });

    it('should return true when no indicators found (assume logged in)', () => {
      // No input, no login indicators
      expect(isLoggedIn()).toBe(true);
    });
  });
});
