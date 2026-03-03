/**
 * @fileoverview Unit tests for LLMProviderFactory
 * Ticket: XST-808 — Comprehensive test suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all provider constructors
vi.mock('../../src/shared/llm/ChatGPTProvider.js', () => ({
  ChatGPTProvider: vi.fn().mockImplementation(function(opts) {
    this.name = 'chatgpt';
    this.enqueue = opts?.enqueue;
    this.sendPrompt = vi.fn();
  }),
}));

vi.mock('../../src/shared/llm/ClaudeWebProvider.js', () => ({
  ClaudeWebProvider: vi.fn().mockImplementation(function(opts) {
    this.name = 'claude-web';
    this.enqueue = opts?.enqueue;
    this.sendPrompt = vi.fn();
  }),
}));

vi.mock('../../src/shared/llm/GeminiWebProvider.js', () => ({
  GeminiWebProvider: vi.fn().mockImplementation(function(opts) {
    this.name = 'gemini-web';
    this.enqueue = opts?.enqueue;
    this.sendPrompt = vi.fn();
  }),
}));

import { LLMProviderFactory, SUPPORTED_PROVIDERS } from '../../src/shared/llm/LLMProviderFactory.js';
import { ChatGPTProvider } from '../../src/shared/llm/ChatGPTProvider.js';
import { ClaudeWebProvider } from '../../src/shared/llm/ClaudeWebProvider.js';
import { GeminiWebProvider } from '../../src/shared/llm/GeminiWebProvider.js';

describe('LLMProviderFactory', () => {
  const mockEnqueue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates ChatGPTProvider by default', () => {
      const provider = LLMProviderFactory.create({}, { enqueue: mockEnqueue });
      expect(ChatGPTProvider).toHaveBeenCalledWith({ enqueue: mockEnqueue });
      expect(provider.name).toBe('chatgpt');
    });

    it('creates ChatGPTProvider when provider="chatgpt"', () => {
      const provider = LLMProviderFactory.create({ provider: 'chatgpt' }, { enqueue: mockEnqueue });
      expect(ChatGPTProvider).toHaveBeenCalled();
      expect(provider.name).toBe('chatgpt');
    });

    it('creates ClaudeWebProvider when provider="claude"', () => {
      const provider = LLMProviderFactory.create({ provider: 'claude' }, { enqueue: mockEnqueue });
      expect(ClaudeWebProvider).toHaveBeenCalledWith({ enqueue: mockEnqueue });
      expect(provider.name).toBe('claude-web');
    });

    it('creates GeminiWebProvider when provider="gemini"', () => {
      const provider = LLMProviderFactory.create({ provider: 'gemini' }, { enqueue: mockEnqueue });
      expect(GeminiWebProvider).toHaveBeenCalledWith({ enqueue: mockEnqueue });
      expect(provider.name).toBe('gemini-web');
    });

    it('falls back to ChatGPT for unknown provider', () => {
      const provider = LLMProviderFactory.create({ provider: 'unknown-xyz' }, { enqueue: mockEnqueue });
      expect(ChatGPTProvider).toHaveBeenCalled();
      expect(provider.name).toBe('chatgpt');
    });

    it('passes enqueue to provider via DI', () => {
      const provider = LLMProviderFactory.create({ provider: 'claude' }, { enqueue: mockEnqueue });
      expect(provider.enqueue).toBe(mockEnqueue);
    });

    it('handles missing deps', () => {
      const provider = LLMProviderFactory.create({ provider: 'chatgpt' });
      expect(ChatGPTProvider).toHaveBeenCalledWith({ enqueue: undefined });
    });

    it('handles empty config', () => {
      const provider = LLMProviderFactory.create();
      expect(ChatGPTProvider).toHaveBeenCalled();
    });
  });

  describe('getMeta', () => {
    it('returns metadata for chatgpt', () => {
      const meta = LLMProviderFactory.getMeta('chatgpt');
      expect(meta.id).toBe('chatgpt');
      expect(meta.requiresKey).toBe(false);
      expect(meta.plans).toContain('free');
    });

    it('returns metadata for claude', () => {
      const meta = LLMProviderFactory.getMeta('claude');
      expect(meta.id).toBe('claude');
      expect(meta.requiresKey).toBe(false);
    });

    it('returns metadata for gemini', () => {
      const meta = LLMProviderFactory.getMeta('gemini');
      expect(meta.id).toBe('gemini');
      expect(meta.requiresKey).toBe(false);
    });

    it('defaults to chatgpt for unknown provider', () => {
      const meta = LLMProviderFactory.getMeta('unknown');
      expect(meta.id).toBe('chatgpt');
    });
  });

  describe('SUPPORTED_PROVIDERS', () => {
    it('contains exactly 3 providers', () => {
      expect(SUPPORTED_PROVIDERS).toHaveLength(3);
    });

    it('none require API keys (all web-based)', () => {
      for (const p of SUPPORTED_PROVIDERS) {
        expect(p.requiresKey).toBe(false);
      }
    });

    it('all support free plan', () => {
      for (const p of SUPPORTED_PROVIDERS) {
        expect(p.plans).toContain('free');
      }
    });

    it('all have id and name', () => {
      for (const p of SUPPORTED_PROVIDERS) {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
      }
    });
  });
});
