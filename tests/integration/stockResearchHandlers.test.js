/**
 * @fileoverview Integration tests for Stock Research pipeline message routing
 * Ticket: XST-808 — Comprehensive test suite
 *
 * Tests the full message flow: route() → handler → orchestrator (mocked) → response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== CHROME MOCK (must be before imports) =====

globalThis.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
};

// ===== MODULE MOCKS =====

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  generateCorrelationId: vi.fn(() => 'test-corr-id'),
}));

// Mock Supabase 
const mockSupabaseMaybeSingle = vi.fn().mockResolvedValue({ data: { config: { stock_research_v2: true } } });
const mockSupabaseEq = vi.fn().mockReturnValue({ maybeSingle: mockSupabaseMaybeSingle });
const mockSupabaseSelect = vi.fn().mockReturnValue({ eq: mockSupabaseEq });
const mockSupabaseOrderResult = vi.fn().mockReturnValue({
  range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
});
const mockSupabaseOrder = vi.fn().mockReturnValue(mockSupabaseOrderResult());
const mockSupabaseInsert = vi.fn().mockResolvedValue({ error: null });
const mockSupabaseUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    from: vi.fn((table) => ({
      select: mockSupabaseSelect,
      insert: mockSupabaseInsert,
      update: mockSupabaseUpdate,
    })),
  },
}));

// Mock auth
vi.mock('../../src/background/utils/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue('test-user-123'),
}));

// Mock supabaseRetry
vi.mock('../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn(async (fn) => fn()),
}));

// Mock feature flags
vi.mock('../../src/shared/featureFlags.js', () => ({
  getFeatureFlag: vi.fn((flag) => flag === 'stock_research_v2'),
}));

// Mock orchestrator
const mockRunStockResearch = vi.fn();
vi.mock('../../src/background/services/stock/stockResearchOrchestrator.js', () => ({
  runStockResearch: (...args) => mockRunStockResearch(...args),
  buildAnalysisPrompt: vi.fn(() => 'mock prompt'),
}));

// Mock promptQueue
vi.mock('../../src/background/services/promptQueue.js', () => ({
  enqueue: vi.fn(fn => fn()),
}));

// Mock errorCodes
vi.mock('../../src/shared/errorCodes.js', () => ({
  ERROR_CODES: {
    INVALID_INPUT: 'INVALID_INPUT',
    OPERATION_FAILED: 'OPERATION_FAILED',
    SUPABASE_ERROR: 'SUPABASE_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  },
  getUserFriendlyMessage: vi.fn((code) => `Error: ${code}`),
}));

// Import router + handler registration
import { route, clearHandlers } from '../../src/background/messageRouter.js';
import { MESSAGE_TYPES, createMessage } from '../../src/shared/messageSchema.js';

// Trigger handler registration by importing the handler module
await import('../../src/background/handlers/stockResearch.js');

// ===== HELPERS =====

function makeMessage(type, data = {}) {
  return {
    v: 1,
    type,
    correlationId: 'test-corr-001',
    timestamp: Date.now(),
    data,
  };
}

const mockSender = { tab: null, id: 'test' };

// ===== TESTS =====

describe('Stock Research Integration — message routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: orchestrator returns success
    mockRunStockResearch.mockResolvedValue({
      success: true,
      runId: 'run-001',
      symbol: 'FPT',
      output: { recommendation: 'BUY', confidence: 80 },
      sources: [{ title: 'Test', url: 'https://example.com', snippet: 'Test snippet' }],
      metadata: {
        provider: 'chatgpt',
        searchEnabled: true,
        sourceCount: 1,
        timing: { total_ms: 5000 },
      },
    });

    // Default settings config
    mockSupabaseMaybeSingle.mockResolvedValue({
      data: { config: { stock_research_v2: true } },
    });
  });

  // ============================================================
  // STOCK_RESEARCH_RUN
  // ============================================================

  describe('STOCK_RESEARCH_RUN', () => {
    it('routes message to handler and returns STOCK_RESEARCH_DONE on success', async () => {
      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, { symbol: 'FPT' });
      const response = await route(msg, mockSender);

      expect(response.type).toBe(MESSAGE_TYPES.STOCK_RESEARCH_DONE);
      expect(response.success).toBe(true);
      expect(response.symbol).toBe('FPT');
      expect(response.output.recommendation).toBe('BUY');
    });

    it('calls orchestrator with correct parameters', async () => {
      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, {
        symbol: 'VNM',
        mode: 'quick',
        options: { searchEnabled: false },
      });

      await route(msg, mockSender);

      expect(mockRunStockResearch).toHaveBeenCalledTimes(1);
      const [symbol, options, userId, deps] = mockRunStockResearch.mock.calls[0];
      expect(symbol).toBe('VNM');
      expect(options).toMatchObject({ searchEnabled: false, mode: 'quick' });
      expect(userId).toBe('test-user-123');
      expect(typeof deps.onProgress).toBe('function');
    });

    it('returns error when symbol is missing', async () => {
      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, {});
      const response = await route(msg, mockSender);

      expect(response.errorCode).toBe('INVALID_INPUT');
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
      expect(mockRunStockResearch).not.toHaveBeenCalled();
    });

    it('returns STOCK_RESEARCH_FAILED when pipeline fails', async () => {
      mockRunStockResearch.mockResolvedValue({
        success: false,
        runId: 'run-fail',
        symbol: 'XYZ',
        errorCode: 'LLM_TIMEOUT',
        errorMessage: 'Timeout',
        failedStep: 'evaluating',
        sources: [],
      });

      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, { symbol: 'XYZ' });
      const response = await route(msg, mockSender);

      expect(response.type).toBe(MESSAGE_TYPES.STOCK_RESEARCH_FAILED);
      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('LLM_TIMEOUT');
    });

    it('returns error when orchestrator throws', async () => {
      mockRunStockResearch.mockRejectedValue(new Error('unexpected crash'));

      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, { symbol: 'HPG' });
      const response = await route(msg, mockSender);

      expect(response.errorCode).toBe('OPERATION_FAILED');
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
    });

    it('broadcasts progress updates via chrome.runtime.sendMessage', async () => {
      // Capture the onProgress callback
      mockRunStockResearch.mockImplementation(async (sym, opts, uid, deps) => {
        // Simulate progress callback
        deps.onProgress({ runId: 'r1', status: 'searching', step: 2, totalSteps: 7 });
        return {
          success: true,
          runId: 'r1',
          symbol: 'FPT',
          output: {},
          sources: [],
          metadata: { timing: {} },
        };
      });

      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_RUN, { symbol: 'FPT' });
      await route(msg, mockSender);

      // broadcastStatus should have been called (initial + from OnProgress)
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });
  });

  // ============================================================
  // STOCK_RESEARCH_GET_HISTORY
  // ============================================================

  describe('STOCK_RESEARCH_GET_HISTORY', () => {
    it('routes to registered handler', async () => {
      // Just verify the handler is registered and responds
      // (the actual Supabase query is mocked)
      const msg = makeMessage(MESSAGE_TYPES.STOCK_RESEARCH_GET_HISTORY, {
        symbol: 'FPT',
        limit: 5,
      });

      const response = await route(msg, mockSender);

      // Should get a response (either success or error from mock), not "no handler"
      expect(response).toBeDefined();
      expect(response.type).not.toBe('UNKNOWN_TYPE');
    });
  });

  // ============================================================
  // Unknown message type
  // ============================================================

  describe('unknown message type', () => {
    it('returns error for unregistered type', async () => {
      const msg = makeMessage('TOTALLY_UNKNOWN_TYPE', {});
      const response = await route(msg, mockSender);

      expect(response.errorCode).toBeDefined();
      expect(response.type).toBe(MESSAGE_TYPES.ERROR);
    });
  });
});
