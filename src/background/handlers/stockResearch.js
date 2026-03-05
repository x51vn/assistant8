/**
 * @fileoverview Stock Research Background Handler
 * Ticket: XST-797 — Implement stockResearch background handler
 *
 * Handles:
 *  STOCK_RESEARCH_RUN         — Trigger stock analysis pipeline
 *  STOCK_RESEARCH_GET_HISTORY — Fetch past research runs
 *
 * Delegates to stockResearchOrchestrator for pipeline execution.
 * Uses feature-based LLM routing (XST-799) and feature flag (XST-800).
 */

import { registerHandler } from '../messageRouter.js';
import {
  MESSAGE_TYPES,
  createResponse,
  createErrorResponse,
} from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { runStockResearch } from '../services/stock/stockResearchOrchestrator.js';
import { enqueue } from '../services/promptQueue.js';
import { resolvePresetOptions, DEFAULT_PRESET } from '../../shared/pipelinePresets.js';
import { safeBroadcast } from '../../shared/safeBroadcast.js';

const logger = createLogger('StockResearchHandler');

// ============================================================
// STOCK_RESEARCH_RUN — Trigger stock analysis pipeline
// ============================================================
registerHandler(MESSAGE_TYPES.STOCK_RESEARCH_RUN, async (message) => {
  const correlationId = message.correlationId;
  const { symbol, mode, options = {} } = message.data || message;

  if (!symbol?.trim()) {
    return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Thiếu mã cổ phiếu (symbol).');
  }

  try {
    const userId = await requireAuth(message);

    // Check feature flag
    const settingsConfig = await getUserSettingsConfig(userId);
    if (!getFeatureFlag('stock_research_v2', settingsConfig)) {
      return createErrorResponse(
        message,
        ERROR_CODES.OPERATION_FAILED,
        'Tính năng Stock Research chưa được bật. Vui lòng bật trong Cài đặt.'
      );
    }

    logger.info('Stock research requested', { symbol, mode, correlationId });

    // XST-810: Resolve pipeline preset → merge with user overrides
    const presetName = settingsConfig?.stock_research?.pipelineMode || DEFAULT_PRESET;
    const resolvedOptions = resolvePresetOptions(presetName, {
      ...settingsConfig?.stock_research,
      ...options,
    });

    // Broadcast initial status
    broadcastStatus(correlationId, {
      runId: correlationId,
      symbol: symbol.toUpperCase(),
      status: 'queued',
      step: 0,
      totalSteps: 7,
      message: `Đang khởi tạo phân tích ${symbol.toUpperCase()}...`,
    });

    // Run pipeline with resolved preset options
    const result = await runStockResearch(
      symbol,
      { ...resolvedOptions, ...options, mode: mode || 'stock-research', correlationId },
      userId,
      {
        settingsConfig,
        enqueue,
        onProgress: (status) => broadcastStatus(correlationId, status),
      }
    );

    if (result.success) {
      return createResponse(message, MESSAGE_TYPES.STOCK_RESEARCH_DONE, {
        success: true,
        runId: result.runId,
        symbol: result.symbol,
        output: result.output,
        sources: result.sources,
        metadata: result.metadata,
      });
    } else {
      return createResponse(message, MESSAGE_TYPES.STOCK_RESEARCH_FAILED, {
        success: false,
        runId: result.runId,
        symbol: result.symbol,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        failedStep: result.failedStep,
        partialSources: result.sources || [],
      });
    }
  } catch (err) {
    logger.error('STOCK_RESEARCH_RUN failed', { error: err?.message, symbol, correlationId });
    return createErrorResponse(
      message,
      ERROR_CODES.OPERATION_FAILED,
      err?.message || 'Phân tích cổ phiếu thất bại. Vui lòng thử lại.'
    );
  }
});

// ============================================================
// STOCK_RESEARCH_GET_HISTORY — Fetch past research runs
// ============================================================
registerHandler(MESSAGE_TYPES.STOCK_RESEARCH_GET_HISTORY, async (message) => {
  const correlationId = message.correlationId;
  const { symbol, limit = 10, offset = 0 } = message.data || message;

  try {
    const userId = await requireAuth(message);

    const result = await supabaseWithRetry(
      async () => {
        let query = supabase
          .from('stock_research_runs')
          .select('id, symbol, provider, mode, status, output, created_at, finished_at', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (symbol) {
          query = query.eq('symbol', symbol.toUpperCase());
        }

        const { data, error, count } = await query;
        if (error) throw error;
        return { data, count };
      },
      { operationName: 'getStockResearchHistory', correlationId }
    );

    // Map DB rows to response format
    const items = (result.data || []).map(row => ({
      id: row.id,
      symbol: row.symbol,
      provider: row.provider,
      status: row.status,
      recommendation: row.output?.recommendation || null,
      confidence: row.output?.confidence || null,
      created_at: row.created_at,
      finished_at: row.finished_at,
    }));

    return createResponse(message, MESSAGE_TYPES.STOCK_RESEARCH_HISTORY_DATA, {
      success: true,
      items,
      total: result.count || items.length,
    });
  } catch (err) {
    logger.error('STOCK_RESEARCH_GET_HISTORY failed', { error: err?.message, correlationId });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR)
    );
  }
});

// ============================================================
// HELPERS
// ============================================================

/**
 * Get user's settings config from Supabase.
 * @param {string} userId
 * @returns {Object} settings.config (empty object if not found)
 */
async function getUserSettingsConfig(userId) {
  const { data } = await supabase
    .from('settings')
    .select('config')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.config || {};
}

/**
 * Broadcast pipeline status to UI via chrome.runtime.sendMessage.
 * Non-blocking: errors are silently logged.
 */
function broadcastStatus(correlationId, status) {
  safeBroadcast({
    v: 1,
    type: MESSAGE_TYPES.STOCK_RESEARCH_STATUS,
    correlationId,
    timestamp: Date.now(),
    ...status,
  });
}
