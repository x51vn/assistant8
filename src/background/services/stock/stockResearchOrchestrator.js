/**
 * @fileoverview Stock Research Orchestrator — Core Pipeline
 * Ticket: XST-796 — Implement stockResearchOrchestrator
 *
 * 7-step pipeline:
 * 1. Input Validation  → validate symbol, merge options
 * 2. Search            → Google Search (currently via Edge Function — see @todo)
 * 3. Filter & Rank     → score and filter sources
 * 4. Context Builder   → build LLM prompt with sources
 * 5. LLM Evaluation    → send to AI provider
 * 6. Output Validation → validate JSON output against schema
 * 7. Persist           → save to Supabase tables
 *
 * @done XST-812 — Step 2 now uses googleSearchWebService.js (Web/DOM automation
 *                  on google.com tabs). No API key needed.
 *
 * Architecture:
 * - Stateless: no in-memory state (MV3-safe)
 * - Dependencies injected: LLM provider, search service, Supabase
 * - Returns structured result matching STOCK_RESEARCH_DONE schema
 * - Emits progress updates via onProgress callback
 *
 * Spec: docs/specs/stock-research-message-schema.md
 * ADR:  docs/adr/ADR-001-unified-stock-research-pipeline.md
 */

import { createLogger, generateCorrelationId } from '../../../logger.js';
import { supabase } from '../../../supabaseConfig.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../../shared/errorCodes.js';
// XST-812: Web/DOM automation search (replaces deprecated Edge Function proxy)
import { searchGoogleWeb } from '../search/googleSearchWebService.js';
import { validateStockResearchOutput } from '../../../shared/validators/stockResearchOutputValidator.js';
import { getProviderForFeature, classifyLLMError, FEATURE_TYPES } from '../../../shared/llm/llmProviderRouting.js';
import { LLMProviderFactory } from '../../../shared/llm/LLMProviderFactory.js';
// XST-807: Pipeline observability & telemetry
import { PipelineTracer } from './pipelineTelemetry.js';

const logger = createLogger('StockResearchOrchestrator');

// ===== CONSTANTS =====

const SYMBOL_REGEX = /^[A-Z0-9]{1,10}$/;
const TOTAL_STEPS = 7;
const MAX_LLM_RETRIES = 2;

/** Default pipeline options, merged with user overrides */
const DEFAULT_OPTIONS = {
  searchEnabled: true,
  maxSources: 8,
  recencyWindowDays: 14,
  strictValidation: true,
  timeoutMs: 60_000,
};

/** Vietnamese progress messages per step */
const STEP_MESSAGES = {
  1: (symbol) => `Đang kiểm tra dữ liệu đầu vào cho ${symbol}...`,
  2: (symbol) => `Đang tìm kiếm thông tin ${symbol}...`,
  3: (symbol) => `Đang phân tích và xếp hạng nguồn tin ${symbol}...`,
  4: (symbol) => `Đang xây dựng ngữ cảnh phân tích ${symbol}...`,
  5: (symbol) => `Đang phân tích ${symbol} bằng AI...`,
  6: (symbol) => `Đang kiểm tra kết quả phân tích ${symbol}...`,
  7: (symbol) => `Đang lưu kết quả phân tích ${symbol}...`,
};

const STEP_STATUS = {
  1: 'validating',
  2: 'retrieving',
  3: 'ranking',
  4: 'ranking',
  5: 'evaluating',
  6: 'validating_output',
  7: 'persisting',
};

// ===== PUBLIC API =====

/**
 * Run the stock research pipeline for a given symbol.
 *
 * @param {string} symbol - Stock ticker symbol
 * @param {Object} [options] - Pipeline options (merged with defaults)
 * @param {string} userId - Authenticated user ID
 * @param {Object} [deps] - Injected dependencies
 * @param {Object} [deps.settingsConfig] - User settings config (for provider routing)
 * @param {Function} [deps.enqueue] - promptQueue enqueue function (for ChatGPT DI)
 * @param {Function} [deps.onProgress] - Progress callback: (status) => void
 * @returns {Promise<StockResearchResult>}
 *
 * @typedef {Object} StockResearchResult
 * @property {boolean} success
 * @property {string} runId
 * @property {string} symbol
 * @property {Object|null} output - Validated analysis output
 * @property {Object[]} sources - Search sources used
 * @property {Object} metadata - Timing, provider info
 * @property {string} [errorCode] - Error code on failure
 * @property {string} [errorMessage] - User-friendly error message
 * @property {string} [failedStep] - Step name where failure occurred
 */
export async function runStockResearch(symbol, options = {}, userId, deps = {}) {
  const runId = generateCorrelationId();
  const correlationId = options.correlationId || runId;
  const startTime = Date.now();
  const timing = {};
  const { onProgress, settingsConfig = {}, enqueue } = deps;

  // XST-807: Create per-run tracer for structured observability
  const tracer = new PipelineTracer(runId, symbol?.toUpperCase?.() || symbol, {
    provider: settingsConfig?.llm_provider || 'chatgpt',
    searchEnabled: options.searchEnabled ?? DEFAULT_OPTIONS.searchEnabled,
    mode: options.mode || 'stock-research',
  });

  logger.info('Pipeline started', { symbol, runId, correlationId, userId });

  // Helper: emit progress
  const emitProgress = (step) => {
    if (typeof onProgress === 'function') {
      onProgress({
        runId,
        symbol,
        status: STEP_STATUS[step] || 'unknown',
        step,
        totalSteps: TOTAL_STEPS,
        message: STEP_MESSAGES[step]?.(symbol) || '',
      });
    }
  };

  let sources = [];
  let llmOutput = null;

  try {
    // =============================================
    // Step 1: Input Validation
    // =============================================
    emitProgress(1);
    tracer.startStep('validate');
    const stepStart1 = Date.now();

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const normalizedSymbol = validateSymbol(symbol);

    timing.validate_ms = Date.now() - stepStart1;
    tracer.endStep('validate');

    // Create run record in DB
    await createRunRecord(runId, normalizedSymbol, userId, opts);

    // =============================================
    // Step 2: Google Search (optional)
    // =============================================
    emitProgress(2);
    tracer.startStep('search', { searchEnabled: opts.searchEnabled });
    const stepStart2 = Date.now();

    if (opts.searchEnabled) {
      try {
        const query = buildSearchQuery(normalizedSymbol, opts);
        sources = await searchGoogleWeb(query, {
          maxResults: opts.maxSources,
          recencyWindowDays: opts.recencyWindowDays,
          timeoutMs: Math.min(opts.timeoutMs / 3, 15_000),
          trustedDomains: opts.trustedDomains,
          correlationId,
        });
        logger.info('Search completed', { symbol: normalizedSymbol, sourceCount: sources.length, correlationId });
      } catch (searchError) {
        // Search failure is non-fatal — continue without sources
        logger.warn('Search failed, continuing without sources', {
          error: searchError.message,
          correlationId,
        });
        sources = [];
      }
    }

    timing.search_ms = Date.now() - stepStart2;
    tracer.endStep('search', { sourceCount: sources.length });

    // =============================================
    // Step 3: Filter & Rank sources
    // =============================================
    emitProgress(3);
    tracer.startStep('rank');
    const stepStart3 = Date.now();

    // Sources are already ranked by googleSearchService, just limit
    const rankedSources = sources.slice(0, opts.maxSources);

    timing.rank_ms = Date.now() - stepStart3;
    tracer.endStep('rank', { rankedCount: rankedSources.length });

    // =============================================
    // Step 4: Build LLM context/prompt
    // =============================================
    emitProgress(4);
    tracer.startStep('context');
    const stepStart4 = Date.now();

    const llmPrompt = buildAnalysisPrompt(normalizedSymbol, rankedSources, opts);

    timing.context_ms = Date.now() - stepStart4;
    tracer.endStep('context', { promptLength: llmPrompt.length });

    // =============================================
    // Step 5: LLM Evaluation (with retries)
    // =============================================
    emitProgress(5);
    tracer.startStep('analyze');
    const stepStart5 = Date.now();

    const providerConfig = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, settingsConfig);
    const provider = LLMProviderFactory.create(providerConfig, { enqueue });

    let llmResponse;
    let lastError;

    for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
      try {
        llmResponse = await provider.sendPrompt(llmPrompt, {
          runId,
          createNewChat: true,
        });
        break; // Success
      } catch (err) {
        lastError = err;
        const classified = classifyLLMError(err);
        if (!classified.retryable || attempt === MAX_LLM_RETRIES) {
          throw err;
        }
        logger.warn('LLM attempt failed, retrying', {
          attempt: attempt + 1,
          error: err.message,
          correlationId,
        });
        // Brief delay before retry
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!llmResponse?.text) {
      throw new Error('LLM returned empty response');
    }

    timing.analyze_ms = Date.now() - stepStart5;
    tracer.endStep('analyze', { responseLength: llmResponse.text?.length || 0 });

    // =============================================
    // Step 6: Validate LLM Output
    // =============================================
    emitProgress(6);
    tracer.startStep('validate_output');
    const stepStart6 = Date.now();

    const validation = validateStockResearchOutput(llmResponse.text, {
      strict: opts.strictValidation,
    });

    if (!validation.valid && opts.strictValidation) {
      // Log validation failures for debugging
      logger.warn('Output validation failed', {
        errors: validation.errors,
        warnings: validation.warnings,
        correlationId,
      });

      // Try one more time with a corrective prompt
      const retryResult = await retryWithCorrection(
        provider, llmPrompt, validation.errors, { runId, enqueue }
      );

      if (retryResult) {
        llmOutput = retryResult;
      } else {
        // Use partial data if available
        if (validation.data) {
          llmOutput = validation.data;
          logger.info('Using partial validation data', { correlationId });
        } else {
          throw createOrchestratorError(
            ERROR_CODES.PARSE_ERROR,
            `Output validation failed: ${validation.errors.join('; ')}`,
            'validating_output'
          );
        }
      }
    } else {
      llmOutput = validation.data;
    }

    if (validation.warnings.length > 0) {
      logger.info('Validation warnings', { warnings: validation.warnings, correlationId });
    }

    timing.validate_output_ms = Date.now() - stepStart6;
    tracer.endStep('validate_output');

    // =============================================
    // Step 7: Persist to Supabase
    // =============================================
    emitProgress(7);
    tracer.startStep('persist');
    const stepStart7 = Date.now();

    try {
      await persistResults(runId, normalizedSymbol, userId, {
        output: llmOutput,
        sources: rankedSources,
        provider: providerConfig.provider,
        timing,
      });
    } catch (persistError) {
      // Persist failure is non-fatal — log but still return results
      logger.error('Failed to persist results', {
        error: persistError.message,
        runId,
        correlationId,
      });
    }

    timing.persist_ms = Date.now() - stepStart7;
    tracer.endStep('persist');

    // =============================================
    // ✅ Success
    // =============================================
    timing.total_ms = Date.now() - startTime;

    // XST-807: Complete tracer with result metadata
    tracer.complete({
      sourceCount: rankedSources.length,
      confidence: llmOutput?.confidence,
      recommendation: llmOutput?.recommendation,
    });

    const result = {
      success: true,
      runId,
      symbol: normalizedSymbol,
      output: llmOutput,
      sources: rankedSources.map(s => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        sourceType: s.sourceType,
        publishedAt: s.publishedAt,
        score: s.score,
        credibility: s.credibility,
      })),
      metadata: {
        provider: providerConfig.provider,
        searchEnabled: opts.searchEnabled,
        sourceCount: rankedSources.length,
        timing,
        // XST-807: Include telemetry report
        telemetry: tracer.getReport(),
      },
    };

    logger.info('Pipeline completed', {
      symbol: normalizedSymbol,
      runId,
      totalMs: timing.total_ms,
      recommendation: llmOutput?.recommendation,
      correlationId,
    });

    // Update run status to done — include full timing from tracer
    await updateRunStatus(runId, 'done', { timing: tracer.getTimingData() }).catch(err =>
      logger.error('Failed to update run status', { error: err.message, runId })
    );

    return result;

  } catch (error) {
    // =============================================
    // ❌ Failure
    // =============================================
    timing.total_ms = Date.now() - startTime;

    const classified = classifyLLMError(error);
    const errorCode = error.errorCode || classified.errorCode;
    const failedStep = error.failedStep || STEP_STATUS[5];

    // XST-807: Record failure in tracer
    tracer.fail(failedStep, errorCode, error.message);

    logger.error('Pipeline failed', {
      symbol,
      runId,
      errorCode,
      failedStep,
      error: error.message,
      correlationId,
    });

    // Update run status to failed — include timing from tracer
    await updateRunStatus(runId, 'failed', {
      error_code: errorCode,
      error_message: error.message,
      timing: tracer.getTimingData(),
    }).catch(err =>
      logger.error('Failed to update run status', { error: err.message, runId })
    );

    return {
      success: false,
      runId,
      symbol: symbol?.toUpperCase() || symbol,
      output: null,
      sources,
      errorCode,
      errorMessage: getUserFriendlyMessage(errorCode, error.message),
      failedStep,
      metadata: {
        provider: deps.settingsConfig?.llm_provider || 'unknown',
        searchEnabled: options.searchEnabled ?? DEFAULT_OPTIONS.searchEnabled,
        sourceCount: sources.length,
        timing,
        // XST-807: Include telemetry report on failure too
        telemetry: tracer.getReport(),
      },
    };
  }
}

// ===== INTERNAL HELPERS =====

/**
 * Validate and normalize stock symbol.
 * @param {string} symbol
 * @returns {string} Normalized uppercase symbol
 * @throws {OrchestratorError}
 */
function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    throw createOrchestratorError(
      ERROR_CODES.INVALID_INPUT,
      'Symbol is required and must be a non-empty string.',
      'validating'
    );
  }

  const normalized = symbol.trim().toUpperCase();
  if (!SYMBOL_REGEX.test(normalized)) {
    throw createOrchestratorError(
      ERROR_CODES.INVALID_INPUT,
      `Invalid symbol format: "${symbol}". Must match ^[A-Z0-9]{1,10}$.`,
      'validating'
    );
  }

  return normalized;
}

/**
 * Build search query for a stock symbol.
 * @param {string} symbol
 * @param {Object} opts
 * @returns {string}
 */
function buildSearchQuery(symbol, opts = {}) {
  const market = opts.market || 'VN';
  // Build a focused search query for stock analysis
  return `${symbol} cổ phiếu phân tích đánh giá ${new Date().getFullYear()}`;
}

/**
 * Build the LLM analysis prompt with search context.
 * @param {string} symbol
 * @param {Object[]} sources
 * @param {Object} opts
 * @returns {string}
 */
export function buildAnalysisPrompt(symbol, sources, opts = {}) {
  const now = new Date().toISOString().split('T')[0];

  let sourceContext = '';
  if (sources.length > 0) {
    sourceContext = '\n\n## Nguồn tham khảo:\n';
    for (const src of sources) {
      sourceContext += `- **${src.title || 'Untitled'}** (${src.url})\n`;
      if (src.snippet) {
        sourceContext += `  ${src.snippet}\n`;
      }
    }
  }

  return `Bạn là chuyên gia phân tích chứng khoán Việt Nam. Hãy phân tích cổ phiếu ${symbol} và trả lời CHÍNH XÁC theo format JSON sau.

## Yêu cầu:
1. Phân tích dựa trên dữ liệu mới nhất (ngày ${now})
2. Đưa ra khuyến nghị rõ ràng: BUY, HOLD, SELL, hoặc WATCH
3. Đánh giá độ tin cậy từ 0-100
4. Liệt kê luận điểm đầu tư (thesis) và rủi ro (risks) bằng tiếng Việt
5. Nếu có, đưa ra giá vào (entryPrice), giá mục tiêu (targetPrice) và cắt lỗ (stopLoss) tính bằng VND

## Format JSON bắt buộc (CHỈ trả lời JSON, không thêm text):
\`\`\`json
{
  "symbol": "${symbol}",
  "recommendation": "BUY|HOLD|SELL|WATCH",
  "confidence": 0-100,
  "entryPrice": number_or_null,
  "targetPrice": number_or_null,
  "stopLoss": number_or_null,
  "timeHorizon": "1w|1m|1-3m|3-6m|6-12m|1y+",
  "thesis": ["luận điểm 1", "luận điểm 2"],
  "risks": ["rủi ro 1", "rủi ro 2"],
  "catalysts": ["catalyst 1"],
  "sources": [{"url": "...", "reason": "...", "credibility": "high|medium|low"}]
}
\`\`\`${sourceContext}

CHỈ trả lời bằng JSON object, không thêm bất kỳ text nào khác.`;
}

/**
 * Retry LLM with correction hints.
 * @param {Object} provider
 * @param {string} originalPrompt
 * @param {string[]} validationErrors
 * @param {Object} opts
 * @returns {Object|null} Validated output or null
 */
async function retryWithCorrection(provider, originalPrompt, validationErrors, opts = {}) {
  try {
    const correctionPrompt = `${originalPrompt}

LƯU Ý QUAN TRỌNG: Lần trước bạn trả lời sai format. Các lỗi cần sửa:
${validationErrors.map(e => `- ${e}`).join('\n')}

Hãy trả lời LẠI đúng format JSON. CHỈ JSON, không text.`;

    const response = await provider.sendPrompt(correctionPrompt, {
      runId: opts.runId,
      createNewChat: true,
    });

    if (response?.text) {
      const retry = validateStockResearchOutput(response.text, { strict: false });
      if (retry.data) {
        return retry.data;
      }
    }
  } catch (err) {
    logger.warn('Correction retry failed', { error: err.message });
  }

  return null;
}

// ===== DATABASE OPERATIONS =====

/**
 * Create initial run record in stock_research_runs.
 */
async function createRunRecord(runId, symbol, userId, opts) {
  try {
    const { error } = await supabase
      .from('stock_research_runs')
      .insert({
        id: runId,
        user_id: userId,
        symbol,
        provider: opts.provider || 'chatgpt',
        mode: opts.mode || 'stock-research',
        options: {
          searchEnabled: opts.searchEnabled,
          maxSources: opts.maxSources,
          strictValidation: opts.strictValidation,
        },
        status: 'running',
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.warn('Failed to create run record', { error: error.message, runId });
    }
  } catch (err) {
    // Non-fatal — don't block pipeline for DB issues
    logger.warn('Exception creating run record', { error: err.message, runId });
  }
}

/**
 * Update run status and metadata.
 */
async function updateRunStatus(runId, status, extras = {}) {
  const update = {
    status,
    ...(status === 'done' || status === 'failed' ? { finished_at: new Date().toISOString() } : {}),
  };

  // XST-807: Store timing + error info in metadata JSONB field
  const metadata = {};
  if (extras.timing) metadata.timing = extras.timing;
  if (extras.error_code) metadata.error_code = extras.error_code;
  if (extras.error_message) metadata.error_message = extras.error_message;

  if (Object.keys(metadata).length > 0) {
    update.options = metadata;
  }

  const { error } = await supabase
    .from('stock_research_runs')
    .update(update)
    .eq('id', runId);

  if (error) {
    logger.warn('Failed to update run status', { error: error.message, runId, status });
  }
}

/**
 * Persist analysis output and sources to Supabase.
 */
async function persistResults(runId, symbol, userId, { output, sources, provider, timing }) {
  // 1. Update run with output
  const { error: runError } = await supabase
    .from('stock_research_runs')
    .update({
      status: 'done',
      output,
      provider,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (runError) {
    throw new Error(`Run update failed: ${runError.message}`);
  }

  // 2. Insert sources
  if (sources.length > 0) {
    const sourceRecords = sources.map((src, index) => ({
      run_id: runId,
      url: src.url,
      title: src.title || '',
      snippet: src.snippet || '',
      source_type: src.sourceType || 'news',
      published_at: src.publishedAt || null,
      credibility_score: src.score || 0,
      rank: index + 1,
    }));

    const { error: srcError } = await supabase
      .from('stock_research_sources')
      .insert(sourceRecords);

    if (srcError) {
      logger.warn('Failed to insert sources', { error: srcError.message, runId });
    }
  }

  // 3. Insert insights (parsed from output)
  if (output) {
    const insights = [];

    if (output.recommendation) {
      insights.push({
        run_id: runId,
        insight_type: 'recommendation',
        content: output.recommendation,
        confidence: output.confidence || null,
        metadata: {
          entryPrice: output.entryPrice,
          targetPrice: output.targetPrice,
          stopLoss: output.stopLoss,
          timeHorizon: output.timeHorizon,
        },
      });
    }

    if (output.thesis?.length > 0) {
      for (const t of output.thesis) {
        insights.push({
          run_id: runId,
          insight_type: 'thesis',
          content: t,
        });
      }
    }

    if (output.risks?.length > 0) {
      for (const r of output.risks) {
        insights.push({
          run_id: runId,
          insight_type: 'risk',
          content: r,
        });
      }
    }

    if (output.catalysts?.length > 0) {
      for (const c of output.catalysts) {
        insights.push({
          run_id: runId,
          insight_type: 'catalyst',
          content: c,
        });
      }
    }

    if (insights.length > 0) {
      const { error: insightError } = await supabase
        .from('stock_research_insights')
        .insert(insights);

      if (insightError) {
        logger.warn('Failed to insert insights', { error: insightError.message, runId });
      }
    }
  }
}

/**
 * Create a typed orchestrator error.
 * @param {string} errorCode
 * @param {string} message
 * @param {string} failedStep
 * @returns {Error}
 */
function createOrchestratorError(errorCode, message, failedStep) {
  const err = new Error(message);
  err.errorCode = errorCode;
  err.failedStep = failedStep;
  return err;
}
