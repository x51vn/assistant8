/**
 * @fileoverview Unit tests for PipelineTracer & metrics helpers
 * Ticket: XST-807 — Pipeline step observability & telemetry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineTracer, calculatePercentile, aggregateMetrics } from '../../src/background/services/stock/pipelineTelemetry.js';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ===== PipelineTracer =====

describe('PipelineTracer', () => {
  let tracer;
  const RUN_ID = 'run-001';
  const SYMBOL = 'VNM';
  const CONTEXT = { provider: 'chatgpt', searchEnabled: true, mode: 'stock-research' };

  beforeEach(() => {
    tracer = new PipelineTracer(RUN_ID, SYMBOL, CONTEXT);
  });

  describe('constructor', () => {
    it('records pipeline_start event', () => {
      const events = tracer.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('pipeline_start');
      expect(events[0].runId).toBe(RUN_ID);
      expect(events[0].symbol).toBe(SYMBOL);
      expect(events[0].provider).toBe('chatgpt');
    });

    it('sets status to running', () => {
      const report = tracer.getReport();
      expect(report.status).toBe('running');
    });

    it('handles missing context', () => {
      const t = new PipelineTracer('r2', 'HPG');
      const report = t.getReport();
      expect(report.context).toEqual({});
    });
  });

  describe('startStep / endStep', () => {
    it('records step duration', async () => {
      tracer.startStep('search');
      // Small delay to ensure measurable duration
      await new Promise(r => setTimeout(r, 10));
      tracer.endStep('search', { sourceCount: 5 });

      const timing = tracer.getTimingData();
      expect(timing.search_ms).toBeGreaterThanOrEqual(0);
      expect(typeof timing.search_ms).toBe('number');
    });

    it('records step_start and step_end events', () => {
      tracer.startStep('validate');
      tracer.endStep('validate');

      const events = tracer.getEvents();
      const starts = events.filter(e => e.type === 'step_start');
      const ends = events.filter(e => e.type === 'step_end');
      expect(starts.length).toBe(1);
      expect(starts[0].step).toBe('validate');
      expect(ends.length).toBe(1);
      expect(ends[0].step).toBe('validate');
      expect(ends[0].status).toBe('completed');
    });

    it('endStep on unknown step does not throw', () => {
      expect(() => tracer.endStep('nonexistent')).not.toThrow();
    });

    it('includes meta in events', () => {
      tracer.startStep('search', { searchEnabled: true });
      tracer.endStep('search', { sourceCount: 3 });

      const events = tracer.getEvents();
      const end = events.find(e => e.type === 'step_end' && e.step === 'search');
      expect(end.sourceCount).toBe(3);
    });
  });

  describe('failStep', () => {
    it('records step_error event', () => {
      tracer.startStep('analyze');
      tracer.failStep('analyze', {
        errorType: 'LLM_TIMEOUT',
        errorMessage: 'Timed out',
        retryCount: 2,
      });

      const events = tracer.getEvents();
      const errorEvt = events.find(e => e.type === 'step_error');
      expect(errorEvt).toBeDefined();
      expect(errorEvt.error_type).toBe('LLM_TIMEOUT');
      expect(errorEvt.retry_count).toBe(2);
    });

    it('handles missing step gracefully', () => {
      expect(() =>
        tracer.failStep('missing', { errorType: 'X', errorMessage: 'msg' })
      ).not.toThrow();

      const events = tracer.getEvents();
      expect(events.find(e => e.type === 'step_error')).toBeDefined();
    });

    it('sets step status to failed', () => {
      tracer.startStep('persist');
      tracer.failStep('persist', { errorType: 'DB_ERROR', errorMessage: 'insert fail' });

      const report = tracer.getReport();
      expect(report.steps.persist.status).toBe('failed');
    });
  });

  describe('complete', () => {
    it('sets status to completed and logs pipeline_complete', () => {
      tracer.startStep('validate');
      tracer.endStep('validate');
      tracer.complete({ sourceCount: 5, confidence: 85, recommendation: 'BUY' });

      const report = tracer.getReport();
      expect(report.status).toBe('completed');

      const events = tracer.getEvents();
      const complete = events.find(e => e.type === 'pipeline_complete');
      expect(complete).toBeDefined();
      expect(complete.source_count).toBe(5);
      expect(complete.confidence).toBe(85);
    });
  });

  describe('fail', () => {
    it('sets status to failed and logs pipeline_failed', () => {
      tracer.startStep('search');
      tracer.fail('search', 'NETWORK_ERROR', 'DNS resolution failed');

      const report = tracer.getReport();
      expect(report.status).toBe('failed');

      const events = tracer.getEvents();
      const failed = events.find(e => e.type === 'pipeline_failed');
      expect(failed).toBeDefined();
      expect(failed.failedStep).toBe('search');
      expect(failed.errorCode).toBe('NETWORK_ERROR');
    });
  });

  describe('getTimingData', () => {
    it('returns per-step ms and total_ms', () => {
      tracer.startStep('validate');
      tracer.endStep('validate');
      tracer.startStep('search');
      tracer.endStep('search');

      const timing = tracer.getTimingData();
      expect(timing).toHaveProperty('validate_ms');
      expect(timing).toHaveProperty('search_ms');
      expect(timing).toHaveProperty('total_ms');
      expect(typeof timing.total_ms).toBe('number');
    });

    it('returns null for in-progress steps', () => {
      tracer.startStep('analyze');
      const timing = tracer.getTimingData();
      expect(timing.analyze_ms).toBeNull();
    });
  });

  describe('getTimingSummary', () => {
    it('returns human-readable summary', () => {
      tracer.startStep('validate');
      tracer.endStep('validate');

      const summary = tracer.getTimingSummary();
      expect(summary.validate).toMatch(/^\d+ms$/);
    });

    it('shows in-progress for unfinished steps', () => {
      tracer.startStep('analyze');
      const summary = tracer.getTimingSummary();
      expect(summary.analyze).toBe('in-progress');
    });
  });

  describe('getReport', () => {
    it('includes all sections', () => {
      tracer.startStep('validate');
      tracer.endStep('validate');
      tracer.complete({});

      const report = tracer.getReport();
      expect(report).toHaveProperty('runId', RUN_ID);
      expect(report).toHaveProperty('symbol', SYMBOL);
      expect(report).toHaveProperty('status', 'completed');
      expect(report).toHaveProperty('context');
      expect(report).toHaveProperty('timing');
      expect(report).toHaveProperty('steps');
      expect(report).toHaveProperty('events');
      expect(report).toHaveProperty('startTime');
      expect(report).toHaveProperty('totalDuration');
    });

    it('steps include duration and meta', () => {
      tracer.startStep('search', { foo: 1 });
      tracer.endStep('search', { sourceCount: 3 });

      const report = tracer.getReport();
      expect(report.steps.search.status).toBe('completed');
      expect(report.steps.search.meta).toEqual({ foo: 1, sourceCount: 3 });
    });
  });

  describe('full pipeline flow', () => {
    it('tracks a complete 7-step pipeline', () => {
      const steps = ['validate', 'search', 'rank', 'context', 'analyze', 'validate_output', 'persist'];

      for (const step of steps) {
        tracer.startStep(step);
        tracer.endStep(step);
      }

      tracer.complete({ sourceCount: 5, confidence: 75, recommendation: 'HOLD' });

      const report = tracer.getReport();
      expect(report.status).toBe('completed');
      expect(Object.keys(report.steps)).toEqual(steps);

      for (const step of steps) {
        expect(report.steps[step].status).toBe('completed');
      }

      const timing = tracer.getTimingData();
      expect(Object.keys(timing)).toEqual([
        ...steps.map(s => `${s}_ms`),
        'total_ms',
      ]);
    });
  });
});

// ===== calculatePercentile =====

describe('calculatePercentile', () => {
  it('returns null for empty array', () => {
    expect(calculatePercentile([], 50)).toBeNull();
    expect(calculatePercentile(null, 50)).toBeNull();
  });

  it('returns single value for single-element array', () => {
    expect(calculatePercentile([100], 50)).toBe(100);
    expect(calculatePercentile([100], 95)).toBe(100);
  });

  it('calculates P50 correctly', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p50 = calculatePercentile(values, 50);
    expect(p50).toBe(50);
  });

  it('calculates P95 correctly', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p95 = calculatePercentile(values, 95);
    expect(p95).toBe(100);
  });

  it('P0 returns the minimum', () => {
    expect(calculatePercentile([1, 2, 3], 0)).toBe(1);
  });
});

// ===== aggregateMetrics =====

describe('aggregateMetrics', () => {
  it('returns defaults for empty runs', () => {
    const result = aggregateMetrics([]);
    expect(result.totalRuns).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.durationP50).toBeNull();
    expect(result.durationP95).toBeNull();
    expect(result.avgSourceCount).toBe(0);
    expect(result.providerBreakdown).toEqual({});
  });

  it('returns defaults for null', () => {
    const result = aggregateMetrics(null);
    expect(result.totalRuns).toBe(0);
  });

  it('calculates success rate', () => {
    const runs = [
      { status: 'done', provider: 'chatgpt' },
      { status: 'done', provider: 'chatgpt' },
      { status: 'failed', provider: 'chatgpt' },
    ];
    const result = aggregateMetrics(runs);
    expect(result.totalRuns).toBe(3);
    expect(result.successRate).toBeCloseTo(66.67, 1);
  });

  it('calculates duration percentiles from options.timing', () => {
    const runs = [
      { status: 'done', provider: 'chatgpt', options: { timing: { total_ms: 1000 } } },
      { status: 'done', provider: 'chatgpt', options: { timing: { total_ms: 2000 } } },
      { status: 'done', provider: 'chatgpt', options: { timing: { total_ms: 3000 } } },
      { status: 'done', provider: 'chatgpt', options: { timing: { total_ms: 10000 } } },
    ];
    const result = aggregateMetrics(runs);
    expect(result.durationP50).toBe(2000);
    expect(result.durationP95).toBe(10000);
  });

  it('calculates duration percentiles from metadata.timing', () => {
    const runs = [
      { status: 'done', provider: 'gemini', metadata: { timing: { total_ms: 500 } } },
    ];
    const result = aggregateMetrics(runs);
    expect(result.durationP50).toBe(500);
  });

  it('calculates provider breakdown', () => {
    const runs = [
      { status: 'done', provider: 'chatgpt' },
      { status: 'failed', provider: 'chatgpt' },
      { status: 'done', provider: 'gemini-web' },
    ];
    const result = aggregateMetrics(runs);
    expect(result.providerBreakdown).toEqual({
      chatgpt: { total: 2, successful: 1, failed: 1 },
      'gemini-web': { total: 1, successful: 1, failed: 0 },
    });
  });

  it('handles unknown provider as "unknown"', () => {
    const runs = [{ status: 'done' }];
    const result = aggregateMetrics(runs);
    expect(result.providerBreakdown.unknown).toBeDefined();
  });

  it('calculates average source count', () => {
    const runs = [
      { status: 'done', provider: 'chatgpt', options: { sourceCount: 5 } },
      { status: 'done', provider: 'chatgpt', options: { sourceCount: 3 } },
      { status: 'failed', provider: 'chatgpt' }, // not counted
    ];
    const result = aggregateMetrics(runs);
    expect(result.avgSourceCount).toBe(4);
  });

  it('skips failed runs for duration calculation', () => {
    const runs = [
      { status: 'done', provider: 'chatgpt', options: { timing: { total_ms: 1000 } } },
      { status: 'failed', provider: 'chatgpt', options: { timing: { total_ms: 999999 } } },
    ];
    const result = aggregateMetrics(runs);
    expect(result.durationP50).toBe(1000);
    // P95 should be the same since there's only 1 successful
    expect(result.durationP95).toBe(1000);
  });
});
