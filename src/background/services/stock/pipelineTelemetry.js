/**
 * @fileoverview Pipeline Telemetry — step timing, structured logging, metrics aggregation
 * Ticket: XST-807 — Pipeline step observability & telemetry
 *
 * Provides:
 * - PipelineTracer: per-run step timing + structured event logging
 * - Metrics helpers: aggregate p50/p95 from historical runs
 *
 * Usage:
 *   const tracer = new PipelineTracer(runId, symbol, { provider, searchEnabled, mode });
 *   tracer.startStep('search');
 *   // ...do work...
 *   tracer.endStep('search', { sourceCount: 5 });
 *   tracer.complete({ recommendation: 'BUY', confidence: 0.85 });
 *   const report = tracer.getReport();
 *
 * MV3-safe: stateless per instance, no in-memory global state.
 */

import { createLogger } from '../../../logger.js';

const logger = createLogger('PipelineTelemetry');

// ===== PIPELINE TRACER =====

/**
 * Per-run tracer that captures step timing + structured logs.
 * Create one per runStockResearch invocation.
 */
export class PipelineTracer {
  /** @type {string} */
  #runId;

  /** @type {string} */
  #symbol;

  /** @type {Object} Run context (provider, mode, etc.) */
  #context;

  /** @type {number} Pipeline start timestamp */
  #startTime;

  /** @type {Map<string, { startTime: number, endTime?: number, duration?: number, status: string, meta?: Object }>} */
  #steps = new Map();

  /** @type {Array<Object>} Structured event log */
  #events = [];

  /** @type {string} Overall pipeline status */
  #status = 'running';

  /**
   * @param {string} runId - Unique run identifier
   * @param {string} symbol - Stock symbol being researched
   * @param {Object} [context] - Run context
   * @param {string} [context.provider] - LLM provider name
   * @param {boolean} [context.searchEnabled] - Whether search is enabled
   * @param {string} [context.mode] - Pipeline mode (e.g., 'stock-research')
   */
  constructor(runId, symbol, context = {}) {
    this.#runId = runId;
    this.#symbol = symbol;
    this.#context = context;
    this.#startTime = Date.now();

    this.#logEvent('pipeline_start', {
      runId,
      symbol,
      provider: context.provider,
      searchEnabled: context.searchEnabled,
      mode: context.mode || 'stock-research',
    });
  }

  /**
   * Mark a pipeline step as started.
   *
   * @param {string} stepName - Step name (validate, search, rank, context, analyze, validate_output, persist)
   * @param {Object} [meta] - Additional metadata
   */
  startStep(stepName, meta = {}) {
    this.#steps.set(stepName, {
      startTime: Date.now(),
      status: 'running',
      meta,
    });

    this.#logEvent('step_start', {
      runId: this.#runId,
      step: stepName,
      ...meta,
    });
  }

  /**
   * Mark a pipeline step as completed.
   *
   * @param {string} stepName - Step name
   * @param {Object} [meta] - Result metadata (e.g., { sourceCount, errors })
   */
  endStep(stepName, meta = {}) {
    const step = this.#steps.get(stepName);
    if (!step) {
      logger.warn('endStep called for unknown step', { stepName, runId: this.#runId });
      return;
    }

    step.endTime = Date.now();
    step.duration = step.endTime - step.startTime;
    step.status = 'completed';
    step.meta = { ...step.meta, ...meta };

    this.#logEvent('step_end', {
      runId: this.#runId,
      step: stepName,
      status: 'completed',
      duration: step.duration,
      ...meta,
    });
  }

  /**
   * Mark a pipeline step as failed.
   *
   * @param {string} stepName - Step name
   * @param {Object} errorInfo - Error details
   * @param {string} errorInfo.errorType - Error classification
   * @param {string} errorInfo.errorMessage - Error message
   * @param {number} [errorInfo.retryCount] - Number of retries attempted
   */
  failStep(stepName, errorInfo = {}) {
    const step = this.#steps.get(stepName);
    if (step) {
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      step.status = 'failed';
      step.meta = { ...step.meta, ...errorInfo };
    }

    this.#logEvent('step_error', {
      runId: this.#runId,
      step: stepName,
      error_type: errorInfo.errorType || 'UNKNOWN',
      error_message: errorInfo.errorMessage || '',
      retry_count: errorInfo.retryCount ?? 0,
      duration: step?.duration,
    });
  }

  /**
   * Mark the pipeline as completed successfully.
   *
   * @param {Object} [resultMeta] - Final result metadata
   * @param {number} [resultMeta.sourceCount] - Number of sources used
   * @param {number} [resultMeta.confidence] - Confidence score
   * @param {string} [resultMeta.recommendation] - Buy/Hold/Sell recommendation
   */
  complete(resultMeta = {}) {
    this.#status = 'completed';

    const totalDuration = Date.now() - this.#startTime;

    this.#logEvent('pipeline_complete', {
      runId: this.#runId,
      status: 'completed',
      totalDuration,
      source_count: resultMeta.sourceCount,
      confidence: resultMeta.confidence,
      recommendation: resultMeta.recommendation,
    });

    logger.info('📊 Pipeline run completed', {
      runId: this.#runId,
      symbol: this.#symbol,
      totalMs: totalDuration,
      steps: this.getTimingSummary(),
      ...resultMeta,
    });
  }

  /**
   * Mark the pipeline as failed.
   *
   * @param {string} failedStep - Step where failure occurred
   * @param {string} errorCode - Error classification
   * @param {string} errorMessage - Error description
   */
  fail(failedStep, errorCode, errorMessage) {
    this.#status = 'failed';

    const totalDuration = Date.now() - this.#startTime;

    this.#logEvent('pipeline_failed', {
      runId: this.#runId,
      status: 'failed',
      failedStep,
      errorCode,
      errorMessage,
      totalDuration,
    });

    logger.error('❌ Pipeline run failed', {
      runId: this.#runId,
      symbol: this.#symbol,
      failedStep,
      errorCode,
      totalMs: totalDuration,
      steps: this.getTimingSummary(),
    });
  }

  /**
   * Get timing data formatted for storage in metadata.timing.
   *
   * @returns {Object} { validate_ms, search_ms, rank_ms, context_ms, analyze_ms, validate_output_ms, persist_ms, total_ms }
   */
  getTimingData() {
    const timing = {};

    for (const [name, step] of this.#steps) {
      timing[`${name}_ms`] = step.duration ?? null;
    }

    timing.total_ms = Date.now() - this.#startTime;

    return timing;
  }

  /**
   * Get a human-readable timing summary (for logging).
   *
   * @returns {Object} { stepName: durationMs, ... }
   */
  getTimingSummary() {
    const summary = {};
    for (const [name, step] of this.#steps) {
      summary[name] = step.duration != null ? `${step.duration}ms` : 'in-progress';
    }
    return summary;
  }

  /**
   * Get all recorded events.
   *
   * @returns {Array<Object>} Events list
   */
  getEvents() {
    return [...this.#events];
  }

  /**
   * Get full pipeline report.
   *
   * @returns {Object} Complete report including timing, events, status
   */
  getReport() {
    return {
      runId: this.#runId,
      symbol: this.#symbol,
      status: this.#status,
      context: this.#context,
      timing: this.getTimingData(),
      steps: Object.fromEntries(
        [...this.#steps.entries()].map(([name, step]) => [name, {
          duration: step.duration,
          status: step.status,
          meta: step.meta,
        }])
      ),
      events: this.#events,
      startTime: this.#startTime,
      totalDuration: Date.now() - this.#startTime,
    };
  }

  // ===== PRIVATE =====

  /**
   * Record a structured event.
   */
  #logEvent(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      ...data,
    };
    this.#events.push(event);

    // Also log to console for DevTools visibility
    logger.debug(`[${type}]`, event);
  }
}

// ===== METRICS HELPERS =====

/**
 * Calculate percentile from a sorted array.
 *
 * @param {number[]} sortedValues - Pre-sorted array of values
 * @param {number} percentile - Percentile (0-100)
 * @returns {number|null}
 */
export function calculatePercentile(sortedValues, percentile) {
  if (!sortedValues || sortedValues.length === 0) return null;
  const idx = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)];
}

/**
 * Aggregate pipeline metrics from historical run data.
 *
 * @param {Array<Object>} runs - Array of run records from stock_research_runs
 * @returns {Object} Aggregated metrics
 */
export function aggregateMetrics(runs) {
  if (!runs || runs.length === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      durationP50: null,
      durationP95: null,
      avgSourceCount: 0,
      providerBreakdown: {},
    };
  }

  const total = runs.length;
  const successful = runs.filter(r => r.status === 'done').length;
  const successRate = total > 0 ? (successful / total) * 100 : 0;

  // Duration metrics (from timing data in options/metadata)
  const durations = runs
    .filter(r => r.status === 'done')
    .map(r => {
      const timing = r.options?.timing || r.metadata?.timing || {};
      return timing.total_ms;
    })
    .filter(d => typeof d === 'number' && d > 0)
    .sort((a, b) => a - b);

  const durationP50 = calculatePercentile(durations, 50);
  const durationP95 = calculatePercentile(durations, 95);

  // Source count
  const sourceCounts = runs
    .filter(r => r.status === 'done')
    .map(r => r.options?.sourceCount ?? r.metadata?.sourceCount ?? 0);
  const avgSourceCount = sourceCounts.length > 0
    ? sourceCounts.reduce((a, b) => a + b, 0) / sourceCounts.length
    : 0;

  // Provider breakdown
  const providerBreakdown = {};
  for (const run of runs) {
    const p = run.provider || 'unknown';
    if (!providerBreakdown[p]) {
      providerBreakdown[p] = { total: 0, successful: 0, failed: 0 };
    }
    providerBreakdown[p].total++;
    if (run.status === 'done') providerBreakdown[p].successful++;
    if (run.status === 'failed') providerBreakdown[p].failed++;
  }

  return {
    totalRuns: total,
    successRate: Math.round(successRate * 100) / 100,
    durationP50,
    durationP95,
    avgSourceCount: Math.round(avgSourceCount * 100) / 100,
    providerBreakdown,
  };
}
