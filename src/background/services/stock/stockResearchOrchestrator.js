/**
 * @fileoverview Stock Research Orchestrator — Agentic Pipeline
 * Ticket: XST-796, Agentic Web Research
 *
 * Agentic pipeline:
 *  1. Validate input
 *  2. Agent Loop (Planner → Retriever → Evidence Processor → Critic)
 *  3. Build evidence-based prompt (NO SERP snippets)
 *  4. LLM Final Synthesis (via LLMProviderFactory)
 *  5. Validate output
 *  6. Persist
 *
 * Key principle: Google Search is DISCOVERY ONLY.
 * Evidence for LLM comes from fetched page content, not SERP snippets.
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
// Agentic Web Research: Bounded agent loop
import { runAgentLoop } from './agentLoop.js';

const logger = createLogger('StockResearchOrchestrator');

// ===== CONSTANTS =====

const SYMBOL_REGEX = /^[A-Z0-9]{1,10}$/;
const TOTAL_STEPS = 6;
const MAX_LLM_RETRIES = 2;

/** Default pipeline options, merged with user overrides */
const DEFAULT_OPTIONS = {
  searchEnabled: true,
  maxSources: 8,
  recencyWindowDays: 14,
  strictValidation: true,
  timeoutMs: 120_000,
  openValidUrls: true,
  removeSerpFromContext: true,
  pageOpenStrategy: 'sequential',
  searchProvider: 'google_dom',
  agentLoop: {
    enabled: true,
    maxRounds: 2,
    maxCriticPasses: 1,
  },
};

/** Vietnamese progress messages per step */
const STEP_MESSAGES = {
  1: (symbol) => `Đang kiểm tra dữ liệu đầu vào cho ${symbol}...`,
  2: (symbol) => `Đang tìm kiếm và thu thập dữ liệu ${symbol}...`,
  3: (symbol) => `Đang xây dựng ngữ cảnh phân tích ${symbol}...`,
  4: (symbol) => `Đang phân tích ${symbol} bằng AI...`,
  5: (symbol) => `Đang kiểm tra kết quả phân tích ${symbol}...`,
  6: (symbol) => `Đang lưu kết quả phân tích ${symbol}...`,
};

const STEP_STATUS = {
  1: 'validating',
  2: 'discovering',
  3: 'ranking',
  4: 'evaluating',
  5: 'validating_output',
  6: 'persisting',
};

function logNonFatalPersistenceError({
  operation,
  table,
  error,
  runId,
  correlationId = null,
  feature = 'stock_research',
}) {
  logger.warn('Non-fatal persistence failure', {
    feature,
    severity: 'warning',
    operation,
    table,
    runId,
    correlationId,
    metric: 'persistence_non_fatal_total',
    errorCode: error?.code || null,
    errorMessage: error?.message || String(error),
  });
}

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

  logger.info('Pipeline started (agentic)', { symbol, runId, correlationId, userId });

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
  let agentResult = null;

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
    // Step 2: Agent Loop (Search → Open → Extract → Classify → Critic)
    // =============================================
    emitProgress(2);
    tracer.startStep('agent_loop', { searchEnabled: opts.searchEnabled });
    const stepStart2 = Date.now();

    if (opts.searchEnabled) {
      const agentLoopEnabled = opts.agentLoop?.enabled !== false;

      if (agentLoopEnabled) {
        // Agentic flow: bounded loop with planner/critic
        agentResult = await runAgentLoop(normalizedSymbol, opts, {
          settingsConfig,
          microtaskOptions: deps.microtaskOptions || {},
          onProgress: (status) => {
            if (typeof onProgress === 'function') {
              onProgress({
                runId,
                symbol: normalizedSymbol,
                status: status.status,
                step: 2,
                totalSteps: TOTAL_STEPS,
                message: status.message,
              });
            }
          },
        });

        sources = agentResult.discoveredSources || [];
        logger.info('Agent loop completed', {
          symbol: normalizedSymbol,
          evidenceCount: agentResult.evidencePack.length,
          rounds: agentResult.roundsExecuted,
          urlsOpened: agentResult.urlsOpened,
          criticDecision: agentResult.criticDecision,
          correlationId,
        });
      } else {
        // Legacy flow: search-only (no page opening)
        try {
          const query = buildSearchQuery(normalizedSymbol, opts);
          sources = await searchGoogleWeb(query, {
            maxResults: opts.maxSources,
            recencyWindowDays: opts.recencyWindowDays,
            timeoutMs: Math.min(opts.timeoutMs / 3, 15_000),
            trustedDomains: opts.trustedDomains,
            correlationId,
          });
        } catch (searchError) {
          logger.warn('Search failed, continuing without sources', {
            error: searchError.message,
            correlationId,
          });
          sources = [];
        }
      }
    }

    timing.agent_loop_ms = Date.now() - stepStart2;
    tracer.endStep('agent_loop', {
      sourceCount: sources.length,
      evidenceCount: agentResult?.evidencePack?.length || 0,
      urlsOpened: agentResult?.urlsOpened || 0,
    });

    // =============================================
    // Step 3: Build LLM context/prompt
    // =============================================
    emitProgress(3);
    tracer.startStep('context');
    const stepStart3 = Date.now();

    const evidencePack = agentResult?.evidencePack || [];
    const llmPrompt = buildAnalysisPrompt(normalizedSymbol, evidencePack, sources, opts);

    timing.context_ms = Date.now() - stepStart3;
    tracer.endStep('context', { promptLength: llmPrompt.length, evidenceCount: evidencePack.length });

    // =============================================
    // Step 4: LLM Final Synthesis (with retries)
    // =============================================
    emitProgress(4);
    tracer.startStep('analyze');
    const stepStart4 = Date.now();

    const providerConfig = getProviderForFeature(FEATURE_TYPES.STOCK_RESEARCH, settingsConfig);
    const provider = LLMProviderFactory.create(providerConfig, { enqueue });

    let llmResponse;

    for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
      try {
        llmResponse = await provider.sendPrompt(llmPrompt, {
          runId,
          createNewChat: true,
        });
        break; // Success
      } catch (err) {
        const classified = classifyLLMError(err);
        if (!classified.retryable || attempt === MAX_LLM_RETRIES) {
          throw err;
        }
        logger.warn('LLM attempt failed, retrying', {
          attempt: attempt + 1,
          error: err.message,
          correlationId,
        });
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!llmResponse?.text) {
      throw new Error('LLM returned empty response');
    }

    timing.analyze_ms = Date.now() - stepStart4;
    tracer.endStep('analyze', { responseLength: llmResponse.text?.length || 0 });

    // =============================================
    // Step 5: Validate LLM Output
    // =============================================
    emitProgress(5);
    tracer.startStep('validate_output');
    const stepStart5 = Date.now();

    const validation = validateStockResearchOutput(llmResponse.text, {
      strict: opts.strictValidation,
    });

    if (!validation.valid && opts.strictValidation) {
      logger.warn('Output validation failed', {
        errors: validation.errors,
        warnings: validation.warnings,
        correlationId,
      });

      const retryResult = await retryWithCorrection(
        provider, llmPrompt, validation.errors, { runId, enqueue }
      );

      if (retryResult) {
        llmOutput = retryResult;
      } else {
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

    timing.validate_output_ms = Date.now() - stepStart5;
    tracer.endStep('validate_output');

    // =============================================
    // Step 6: Persist to Supabase
    // =============================================
    emitProgress(6);
    tracer.startStep('persist');
    const stepStart6 = Date.now();

    try {
      await persistResults(runId, normalizedSymbol, userId, {
        output: llmOutput,
        sources: sources.slice(0, opts.maxSources),
        evidencePack,
        provider: providerConfig.provider,
        timing,
        agentMetadata: agentResult ? {
          roundsExecuted: agentResult.roundsExecuted,
          urlsOpened: agentResult.urlsOpened,
          criticDecision: agentResult.criticDecision,
          insufficientEvidence: agentResult.insufficientEvidence,
          queriesUsed: agentResult.queriesUsed,
        } : null,
      });
    } catch (persistError) {
      logNonFatalPersistenceError({
        operation: 'persistResults',
        table: 'stock_research_runs|stock_research_sources|stock_research_insights',
        error: persistError,
        runId,
        correlationId,
      });
    }

    timing.persist_ms = Date.now() - stepStart6;
    tracer.endStep('persist');

    // =============================================
    // ✅ Success
    // =============================================
    timing.total_ms = Date.now() - startTime;

    tracer.complete({
      sourceCount: sources.length,
      evidenceCount: evidencePack.length,
      confidence: llmOutput?.confidence,
      recommendation: llmOutput?.recommendation,
    });

    // Build final sources from the evidence pack (fetched pages), not raw SERP
    const finalSources = evidencePack.length > 0
      ? evidencePack.map((e, idx) => ({
          title: e.title,
          url: e.url,
          snippet: e.summary || '',
          sourceType: e.category || 'news',
          score: e.relevance === 'high' ? 1.0 : e.relevance === 'medium' ? 0.7 : 0.4,
          credibility: e.relevance === 'high' ? 'high' : 'medium',
          sourceStage: e.sourceStage || 'fetched',
        }))
      : sources.slice(0, opts.maxSources).map(s => ({
          title: s.title,
          url: s.url,
          snippet: s.snippet,
          sourceType: s.sourceType,
          publishedAt: s.publishedAt,
          score: s.score,
          credibility: s.credibility,
        }));

    const result = {
      success: true,
      runId,
      symbol: normalizedSymbol,
      output: llmOutput,
      sources: finalSources,
      metadata: {
        provider: providerConfig.provider,
        searchEnabled: opts.searchEnabled,
        searchProvider: opts.searchProvider || 'google_dom',
        sourceCount: finalSources.length,
        openedUrlCount: agentResult?.urlsOpened || 0,
        fetchedPageCount: evidencePack.length,
        searchRounds: agentResult?.roundsExecuted || 1,
        criticDecision: agentResult?.criticDecision || null,
        insufficientEvidence: agentResult?.insufficientEvidence || false,
        timing,
        telemetry: tracer.getReport(),
      },
    };

    logger.info('Pipeline completed', {
      symbol: normalizedSymbol,
      runId,
      totalMs: timing.total_ms,
      recommendation: llmOutput?.recommendation,
      evidenceCount: evidencePack.length,
      correlationId,
    });

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
    const failedStep = error.failedStep || STEP_STATUS[4];

    tracer.fail(failedStep, errorCode, error.message);

    logger.error('Pipeline failed', {
      symbol,
      runId,
      errorCode,
      failedStep,
      error: error.message,
      correlationId,
    });

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
 * Build the LLM analysis prompt with evidence from fetched pages.
 * SERP snippets are NOT included in the prompt — only fetched page content.
 *
 * @param {string} symbol
 * @param {Object[]} evidencePack - Processed evidence items from agent loop
 * @param {Object[]} discoveredSources - Raw SERP sources (metadata only, for reference)
 * @param {Object} opts
 * @returns {string}
 */
export function buildAnalysisPrompt(symbol, evidencePack, discoveredSources, opts = {}) {
  const now = new Date().toISOString().split('T')[0];

  let evidenceContext = '';
  if (evidencePack.length > 0) {
    evidenceContext = '\n\n## Dữ liệu đã thu thập và xác minh:\n';
    for (let i = 0; i < evidencePack.length; i++) {
      const ev = evidencePack[i];
      evidenceContext += `\n### Nguồn ${i + 1}: ${ev.title || 'Untitled'}\n`;
      evidenceContext += `URL: ${ev.url}\n`;
      if (ev.relevance) evidenceContext += `Mức liên quan: ${ev.relevance}\n`;
      if (ev.summary) {
        evidenceContext += `Tóm tắt: ${ev.summary}\n`;
      }
      if (ev.facts?.length > 0) {
        evidenceContext += `Sự kiện chính: ${ev.facts.join('; ')}\n`;
      }
      if (ev.numbers?.length > 0) {
        evidenceContext += `Số liệu: ${ev.numbers.join('; ')}\n`;
      }
      if (ev.risks?.length > 0) {
        evidenceContext += `Rủi ro: ${ev.risks.join('; ')}\n`;
      }
      // Include a portion of the actual content for full context
      if (ev.content) {
        const contentExcerpt = ev.content.substring(0, 3000);
        evidenceContext += `\nNội dung:\n${contentExcerpt}\n`;
      }
    }
  } else if (discoveredSources.length > 0 && !(opts.removeSerpFromContext ?? true)) {
    // Legacy fallback: use SERP snippets if no evidence and not explicitly removed
    evidenceContext = '\n\n## Nguồn tham khảo:\n';
    for (const src of discoveredSources) {
      evidenceContext += `- **${src.title || 'Untitled'}** (${src.url})\n`;
      if (src.snippet) {
        evidenceContext += `  ${src.snippet}\n`;
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
6. Mỗi luận điểm phải gắn với nguồn cụ thể (URL) đã cung cấp
7. Không được bịa số liệu chưa có trong dữ liệu thu thập
8. BẮT BUỘC thêm các trường explainable: supportingEvidence, counterEvidence, invalidConditions

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
  "supportingEvidence": ["bằng chứng ủng hộ 1", "bằng chứng ủng hộ 2"],
  "counterEvidence": ["bằng chứng phản biện 1"],
  "invalidConditions": ["điều kiện vô hiệu luận điểm 1"],
  "catalysts": ["catalyst 1"],
  "sources": [{"url": "...", "reason": "...", "credibility": "high|medium|low"}]
}
\`\`\`${evidenceContext}

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
      logNonFatalPersistenceError({
        operation: 'insert',
        table: 'stock_research_runs',
        error,
        runId,
      });
    }
  } catch (err) {
    // Non-fatal — don't block pipeline for DB issues
    logNonFatalPersistenceError({
      operation: 'insert',
      table: 'stock_research_runs',
      error: err,
      runId,
    });
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
    logNonFatalPersistenceError({
      operation: 'update_status',
      table: 'stock_research_runs',
      error,
      runId,
    });
  }
}

/**
 * Persist analysis output and sources to Supabase.
 */
async function persistResults(runId, symbol, userId, { output, sources, evidencePack, provider, timing, agentMetadata }) {
  // 1. Update run with output + agent metadata
  const runUpdate = {
    status: 'done',
    output,
    provider,
    finished_at: new Date().toISOString(),
  };

  if (agentMetadata) {
    runUpdate.options = {
      ...(runUpdate.options || {}),
      agent: agentMetadata,
    };
  }

  const { error: runError } = await supabase
    .from('stock_research_runs')
    .update(runUpdate)
    .eq('id', runId);

  if (runError) {
    throw new Error(`Run update failed: ${runError.message}`);
  }

  // 2. Insert sources (prefer evidence pack over raw SERP)
  const sourceRecords = [];

  if (evidencePack && evidencePack.length > 0) {
    for (let index = 0; index < evidencePack.length; index++) {
      const ev = evidencePack[index];
      sourceRecords.push({
        run_id: runId,
        url: ev.url,
        title: ev.title || '',
        snippet: ev.summary || '',
        source_type: ev.category || 'news',
        published_at: null,
        credibility_score: ev.relevance === 'high' ? 1.0 : ev.relevance === 'medium' ? 0.7 : 0.4,
        rank: index + 1,
      });
    }
  } else if (sources.length > 0) {
    for (let index = 0; index < sources.length; index++) {
      const src = sources[index];
      sourceRecords.push({
        run_id: runId,
        url: src.url,
        title: src.title || '',
        snippet: src.snippet || '',
        source_type: src.sourceType || 'news',
        published_at: src.publishedAt || null,
        credibility_score: src.score || 0,
        rank: index + 1,
      });
    }
  }

  if (sourceRecords.length > 0) {
    const { error: srcError } = await supabase
      .from('stock_research_sources')
      .insert(sourceRecords);

    if (srcError) {
      logNonFatalPersistenceError({
        operation: 'insert',
        table: 'stock_research_sources',
        error: srcError,
        runId,
      });
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

    if (output.supportingEvidence?.length > 0) {
      for (const item of output.supportingEvidence) {
        insights.push({
          run_id: runId,
          insight_type: 'supporting_evidence',
          content: item,
        });
      }
    }

    if (output.counterEvidence?.length > 0) {
      for (const item of output.counterEvidence) {
        insights.push({
          run_id: runId,
          insight_type: 'counter_evidence',
          content: item,
        });
      }
    }

    if (output.invalidConditions?.length > 0) {
      for (const item of output.invalidConditions) {
        insights.push({
          run_id: runId,
          insight_type: 'invalid_condition',
          content: item,
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
        logNonFatalPersistenceError({
          operation: 'insert',
          table: 'stock_research_insights',
          error: insightError,
          runId,
        });
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
