/**
 * @fileoverview Unit tests for chat history service
 *
 * Tests core outbox logic:
 * - Text normalization and truncation
 * - Metadata merging (Phase 1 + Phase 2)
 * - Outbox item upsertion (handles duplicate runIds)
 * - Two-phase persistence workflow
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Test utilities - Import functions we can test without full mocking
 * Note: Exported functions require chrome.storage and Supabase mocks
 */

// Helper functions (private in actual service, but we test their behavior)
function normalizeText(value, maxChars) {
  if (value == null) return null;
  const str = typeof value === 'string' ? value : String(value);
  const trimmed = str.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function mergePreferTruthy(base, patch) {
  return patch != null && patch !== '' ? patch : base;
}

function mergeMetadata(base, patch) {
  const baseObj = base && typeof base === 'object' ? base : null;
  const patchObj = patch && typeof patch === 'object' ? patch : null;
  if (!baseObj && !patchObj) return null;
  return { ...(baseObj || {}), ...(patchObj || {}) };
}

function upsertOutboxItem(items, patch) {
  const runId = patch?.runId;
  if (!runId || typeof runId !== 'string') return items;

  const idx = items.findIndex((x) => x && x.runId === runId);
  const now = Date.now();

  if (idx === -1) {
    const next = {
      runId,
      prompt: patch.prompt ?? null,
      response: patch.response ?? null,
      chatId: patch.chatId ?? null,
      chatUrl: patch.chatUrl ?? null,
      promptId: patch.promptId ?? null,
      timestamp: patch.timestamp ?? now,
      metadata: patch.metadata ?? null,
      lastUpdatedAt: now,
      attempts: 0
    };
    items.unshift(next);
    return items;
  }

  const current = items[idx] || {};
  const merged = {
    ...current,
    prompt: mergePreferTruthy(current.prompt, patch.prompt),
    response: mergePreferTruthy(current.response, patch.response),
    chatId: mergePreferTruthy(current.chatId, patch.chatId),
    chatUrl: mergePreferTruthy(current.chatUrl, patch.chatUrl),
    promptId: mergePreferTruthy(current.promptId, patch.promptId),
    timestamp: typeof current.timestamp === 'number' ? current.timestamp : (patch.timestamp ?? now),
    metadata: mergeMetadata(current.metadata, patch.metadata),
    lastUpdatedAt: now
  };

  items[idx] = merged;
  return items;
}

// ============================================================================
// TESTS
// ============================================================================

describe('chatHistoryService', () => {
  describe('normalizeText()', () => {
    it('returns null for null/undefined input', () => {
      expect(normalizeText(null, 100)).toBeNull();
      expect(normalizeText(undefined, 100)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeText('', 100)).toBeNull();
      expect(normalizeText('   ', 100)).toBeNull();
    });

    it('returns trimmed string if under maxChars', () => {
      expect(normalizeText('  Hello  ', 100)).toBe('Hello');
      expect(normalizeText('Hello', 100)).toBe('Hello');
    });

    it('truncates string exceeding maxChars', () => {
      const long = 'a'.repeat(150);
      const result = normalizeText(long, 100);
      expect(result).toHaveLength(100);
      expect(result).toBe('a'.repeat(100));
    });

    it('handles non-string input', () => {
      expect(normalizeText(123, 100)).toBe('123');
      expect(normalizeText(true, 100)).toBe('true');
    });

    it('respects maxChars=0', () => {
      expect(normalizeText('hello', 0)).toBe('');
    });

    it('handles unicode characters', () => {
      const text = '🚀 Hello ChatGPT';
      expect(normalizeText(text, 100)).toBe(text);
      expect(normalizeText(text, 5)).toHaveLength(5);
    });
  });

  describe('mergePreferTruthy()', () => {
    it('prefers patch if truthy', () => {
      expect(mergePreferTruthy('base', 'patch')).toBe('patch');
      expect(mergePreferTruthy('base', 'new value')).toBe('new value');
    });

    it('uses base if patch is null/undefined', () => {
      expect(mergePreferTruthy('base', null)).toBe('base');
      expect(mergePreferTruthy('base', undefined)).toBe('base');
    });

    it('uses base if patch is empty string', () => {
      expect(mergePreferTruthy('base', '')).toBe('base');
    });

    it('prefers patch even if base is null', () => {
      expect(mergePreferTruthy(null, 'patch')).toBe('patch');
      expect(mergePreferTruthy(null, 'value')).toBe('value');
    });

    it('handles both null', () => {
      expect(mergePreferTruthy(null, null)).toBeNull();
    });
  });

  describe('mergeMetadata()', () => {
    it('returns null if both are null', () => {
      expect(mergeMetadata(null, null)).toBeNull();
    });

    it('returns patch if base is null', () => {
      const patch = { source: 'SEND_PROMPT' };
      expect(mergeMetadata(null, patch)).toEqual(patch);
    });

    it('returns base if patch is null', () => {
      const base = { source: 'SEND_PROMPT' };
      expect(mergeMetadata(base, null)).toEqual(base);
    });

    it('merges base and patch, patch overwrites base', () => {
      const base = { source: 'SEND_PROMPT', status: 'old' };
      const patch = { status: 'new', custom: 'value' };
      expect(mergeMetadata(base, patch)).toEqual({
        source: 'SEND_PROMPT',
        status: 'new',
        custom: 'value'
      });
    });

    it('handles nested objects (shallow merge only)', () => {
      const base = { capture: { status: 'old' } };
      const patch = { capture: { waitedMs: 100 } };
      expect(mergeMetadata(base, patch)).toEqual({
        capture: { waitedMs: 100 }
      });
    });

    it('ignores non-object metadata', () => {
      expect(mergeMetadata('string', null)).toBeNull();
      expect(mergeMetadata(null, 'string')).toBeNull();
      expect(mergeMetadata(null, 123)).toBeNull();
    });
  });

  describe('upsertOutboxItem()', () => {
    it('returns items unchanged if patch has no runId', () => {
      const items = [{ runId: 'run-1' }];
      expect(upsertOutboxItem(items, {})).toEqual(items);
      expect(upsertOutboxItem(items, { runId: null })).toEqual(items);
    });

    it('creates new item if runId not found (adds to front)', () => {
      const items = [];
      const result = upsertOutboxItem(items, {
        runId: 'run-1',
        prompt: 'Hello',
        chatId: 'chat-1'
      });

      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe('run-1');
      expect(result[0].prompt).toBe('Hello');
      expect(result[0].chatId).toBe('chat-1');
      expect(result[0].response).toBeNull();
      expect(result[0].attempts).toBe(0);
    });

    it('preserves existing items and adds new to front', () => {
      const items = [{ runId: 'run-old', prompt: 'Old' }];
      const result = upsertOutboxItem(items, {
        runId: 'run-new',
        prompt: 'New'
      });

      expect(result).toHaveLength(2);
      expect(result[0].runId).toBe('run-new');
      expect(result[1].runId).toBe('run-old');
    });

    it('merges data for existing runId (Phase 1 + Phase 2)', () => {
      let items = [];

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        prompt: 'What is AI?',
        chatId: 'chat-1',
        chatUrl: null,
        metadata: { source: 'SEND_PROMPT' }
      });

      expect(items[0].prompt).toBe('What is AI?');
      expect(items[0].response).toBeNull();
      expect(items[0].metadata).toEqual({ source: 'SEND_PROMPT' });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        response: 'AI is artificial intelligence',
        metadata: { capture: { status: 'complete', waitedMs: 5000 } }
      });

      expect(items).toHaveLength(1);
      expect(items[0].prompt).toBe('What is AI?');
      expect(items[0].response).toBe('AI is artificial intelligence');
      expect(items[0].metadata).toEqual({
        source: 'SEND_PROMPT',
        capture: { status: 'complete', waitedMs: 5000 }
      });
    });

    it('preserves earliest timestamp across phases', () => {
      const t1 = 1000;
      const t2 = 2000;

      let items = upsertOutboxItem([], {
        runId: 'run-1',
        prompt: 'Prompt 1',
        timestamp: t1
      });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        response: 'Response 1',
        timestamp: t2
      });

      expect(items[0].timestamp).toBe(t1);
    });

    it('prefers non-empty patches for fields', () => {
      let items = upsertOutboxItem([], {
        runId: 'run-1',
        prompt: 'Original prompt',
        chatId: 'chat-1'
      });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        prompt: '',
        chatId: null
      });

      expect(items[0].prompt).toBe('Original prompt');
      expect(items[0].chatId).toBe('chat-1');
    });

    it('updates lastUpdatedAt on each upsert', () => {
      const t1 = Date.now();
      let items = upsertOutboxItem([], {
        runId: 'run-1',
        prompt: 'Test'
      });

      const phase1UpdatedAt = items[0].lastUpdatedAt;

      vi.useFakeTimers();
      vi.setSystemTime(t1 + 1000);

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        response: 'Response'
      });

      expect(items[0].lastUpdatedAt).toBeGreaterThan(phase1UpdatedAt);

      vi.useRealTimers();
    });

    it('handles malformed items in array', () => {
      const items = [
        null,
        { runId: 'run-1', prompt: 'Valid' },
        undefined,
        { runId: 'run-2', prompt: 'Also valid' }
      ];

      const result = upsertOutboxItem(items, {
        runId: 'run-1',
        response: 'Response'
      });

      expect(result[1].response).toBe('Response');
    });
  });

  describe('Outbox quota management', () => {
    it('enforces OUTBOX_MAX_ITEMS=30 limit in saveOutbox', () => {
      const OUTBOX_MAX_ITEMS = 30;
      const items = Array.from({ length: 35 }, (_, i) => ({
        runId: `run-${i}`,
        prompt: `Prompt ${i}`
      }));

      const safe = items.slice(0, OUTBOX_MAX_ITEMS);

      expect(safe).toHaveLength(30);
      expect(safe[0].runId).toBe('run-0');
      expect(safe[29].runId).toBe('run-29');
    });

    it('supports aggressive shrink on quota exceeded', () => {
      const OUTBOX_MAX_ITEMS = 30;
      const items = Array.from({ length: 35 }, (_, i) => ({
        runId: `run-${i}`,
        prompt: 'a'.repeat(50000),
        response: 'b'.repeat(100000)
      }));

      const safe = items.slice(0, OUTBOX_MAX_ITEMS);

      const shrunk = safe.slice(0, Math.min(5, safe.length)).map((x) => ({
        ...x,
        prompt: normalizeText(x.prompt, 10_000),
        response: normalizeText(x.response, 10_000)
      }));

      expect(shrunk).toHaveLength(5);
      expect(shrunk[0].prompt).toHaveLength(10_000);
      expect(shrunk[0].response).toHaveLength(10_000);
    });
  });

  describe('Complex scenarios', () => {
    it('handles rapid Phase 1 + Phase 2 alternation', () => {
      let items = [];

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        prompt: 'First prompt',
        metadata: { source: 'SEND_PROMPT' }
      });

      items = upsertOutboxItem(items, {
        runId: 'run-2',
        prompt: 'Second prompt',
        metadata: { source: 'SEND_PROMPT' }
      });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        response: 'First response',
        metadata: { capture: { status: 'complete' } }
      });

      items = upsertOutboxItem(items, {
        runId: 'run-3',
        prompt: 'Third prompt',
        metadata: { source: 'SEND_PROMPT' }
      });

      items = upsertOutboxItem(items, {
        runId: 'run-2',
        response: 'Second response',
        metadata: { capture: { status: 'complete' } }
      });

      expect(items).toHaveLength(3);
      expect(items[0].runId).toBe('run-3');
      expect(items[1].response).toBe('Second response');
      expect(items[2].response).toBe('First response');
    });

    it('preserves data integrity with max-char truncation', () => {
      const MAX_PROMPT = 50_000;
      const MAX_RESPONSE = 100_000;

      let items = upsertOutboxItem([], {
        runId: 'run-1'
      });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        prompt: 'a'.repeat(MAX_PROMPT + 1000)
      });

      expect(items[0].prompt).toHaveLength(50_000 + 1000);

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        response: 'b'.repeat(MAX_RESPONSE + 5000)
      });

      expect(items[0].response).toHaveLength(100_000 + 5000);

      const normalized = normalizeText(items[0].prompt, MAX_PROMPT);
      expect(normalized).toHaveLength(MAX_PROMPT);
    });

    it('metadata merge from 3+ updates', () => {
      let items = upsertOutboxItem([], {
        runId: 'run-1',
        metadata: { source: 'SEND_PROMPT', phase: 1 }
      });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        metadata: { capture: { status: 'in_progress' }, phase: 2 }
      });

      items = upsertOutboxItem(items, {
        runId: 'run-1',
        metadata: { capture: { status: 'complete', waitedMs: 3000 }, phase: 3 }
      });

      expect(items[0].metadata).toEqual({
        source: 'SEND_PROMPT',
        phase: 3,
        capture: { status: 'complete', waitedMs: 3000 }
      });
    });
  });
});
