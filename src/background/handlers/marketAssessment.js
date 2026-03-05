/**
 * @fileoverview Market Assessment Background Handler
 * Handles daily market assessment: run, history, detail, delete.
 *
 * Pipeline: Auth → Fetch sectors → Build prompt → LLM call → Parse/Validate → Persist
 *
 * Handles:
 *   MARKET_ASSESSMENT_RUN         — Trigger assessment (manual)
 *   MARKET_ASSESSMENT_GET_HISTORY — Fetch history runs
 *   MARKET_ASSESSMENT_GET_DETAIL  — Single run detail (all records)
 *   MARKET_ASSESSMENT_DELETE_RUN  — Delete a full run
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
import { createLogger, generateCorrelationId } from '../../logger.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';
import { LLMProviderFactory } from '../../shared/llm/LLMProviderFactory.js';
import { enqueue } from '../services/promptQueue.js';
import { getProviderConfig } from './llm.js';
import { SYSTEM_PROMPT_KEYS, DEFAULT_SYSTEM_PROMPTS } from '../../shared/systemPrompts.js';
import {
  validateMarketAssessmentOutput,
  buildCorrectivePrompt
} from '../../shared/validators/marketAssessmentOutputValidator.js';
import { fetchMarketSnapshot, buildMarketSnapshotPromptSection } from '../services/marketSnapshotService.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { safeBroadcast } from '../../shared/safeBroadcast.js';

const logger = createLogger('MarketAssessmentHandler');

// ============================================================
// Helper: broadcast status to UI
// ============================================================
function broadcastStatus(correlationId, payload) {
  safeBroadcast({
    v: 1,
    type: MESSAGE_TYPES.MARKET_ASSESSMENT_STATUS,
    correlationId,
    timestamp: Date.now(),
    ...payload
  });
}

// ============================================================
// Helper: fetch user's prompt (from DB or default)
// ============================================================
async function getPromptTemplate(userId) {
  try {
    const { data } = await supabase
      .from('prompts')
      .select('content')
      .eq('user_id', userId)
      .eq('key', SYSTEM_PROMPT_KEYS.MARKET_ASSESSMENT)
      .maybeSingle();
    if (data?.content) return data.content;
  } catch { /* fallback to default */ }
  return DEFAULT_SYSTEM_PROMPTS[SYSTEM_PROMPT_KEYS.MARKET_ASSESSMENT];
}

// ============================================================
// Helper: fetch active sectors for user
// ============================================================
async function getActiveSectors(userId) {
  const { data, error } = await supabase
    .from('sectors')
    .select('sector_name')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map(s => s.sector_name);
}

// ============================================================
// Helper: build final prompt with placeholders replaced
// ============================================================
function buildPrompt(template, { asOfDate, activeSectors }) {
  let sectorConstraint = '';
  if (activeSectors.length > 0) {
    sectorConstraint = `CHẾ ĐỘ CONSTRAINED: Mỗi sector_name BẮT BUỘC phải nằm trong danh sách sau: [${activeSectors.join(', ')}]. Nếu không có ngành phù hợp, chọn ngành gần nhất trong danh sách.`;
  } else {
    sectorConstraint = 'CHẾ ĐỘ TỰ DO (AUTO): Bạn được phép chọn bất kỳ ngành nào phù hợp.';
  }

  return template
    .replace('{AS_OF_DATE}', asOfDate)
    .replace('{SECTOR_CONSTRAINT}', sectorConstraint);
}

// ============================================================
// MARKET_ASSESSMENT_RUN — Run market assessment
// ============================================================
registerHandler(MESSAGE_TYPES.MARKET_ASSESSMENT_RUN, async (message) => {
  const correlationId = message.correlationId || generateCorrelationId();
  const runId = correlationId;
  const startTime = Date.now();

  try {
    // Step 1: Auth
    const userId = await requireAuth(message);
    const asOfDate = new Date().toISOString().split('T')[0];

    broadcastStatus(correlationId, {
      runId, status: 'running', step: 1, totalSteps: 5,
      message: 'Đang chuẩn bị prompt...'
    });

    // Step 2: Fetch sectors + prompt template + market snapshot (FSD-003)
    const activeSectors = await getActiveSectors(userId);
    const classificationMode = activeSectors.length > 0 ? 'CONSTRAINED' : 'AUTO';
    const template = await getPromptTemplate(userId);

    // FSD-003: Fetch MarketSnapshotFact (non-blocking)
    let marketSnapshot = null;
    let snapshotMissing = false;

    // Get user settings to check feature flag
    let settingsConfig = {};
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('config')
        .eq('user_id', userId)
        .maybeSingle();
      settingsConfig = settingsData?.config || {};
    } catch { /* default empty */ }

    if (getFeatureFlag('market_snapshot_injection_v1', settingsConfig)) {
      try {
        marketSnapshot = await fetchMarketSnapshot({ correlationId });
        if (!marketSnapshot) {
          snapshotMissing = true;
          logger.warn('Market snapshot fetch returned null (pipeline continues)', { correlationId });
        }
      } catch (snapErr) {
        snapshotMissing = true;
        logger.warn('Market snapshot fetch failed (pipeline continues)', {
          correlationId,
          error: snapErr.message,
        });
      }
    }

    // Build prompt with optional snapshot facts injection
    let prompt = buildPrompt(template, { asOfDate, activeSectors });
    if (marketSnapshot) {
      const snapshotSection = buildMarketSnapshotPromptSection(marketSnapshot);
      prompt = prompt + '\n' + snapshotSection;
    }

    logger.info('Assessment run starting', {
      correlationId, runId, classificationMode,
      activeSectorCount: activeSectors.length
    });

    broadcastStatus(correlationId, {
      runId, status: 'running', step: 2, totalSteps: 5,
      message: 'Đang gửi prompt tới LLM...'
    });

    // Step 3: Resolve LLM provider + send prompt
    let providerName = 'chatgpt';
    try {
      const config = await getProviderConfig(userId);
      providerName = config.provider || 'chatgpt';
    } catch {
      logger.warn('getProviderConfig failed, using chatgpt', { correlationId });
    }

    const provider = LLMProviderFactory.create({ provider: providerName }, { enqueue });
    const providerResult = await provider.sendPrompt(prompt, {
      runId,
      createNewChat: true,
      timeoutMs: 120000, // 2 minutes for long JSON output
    });

    const rawText = providerResult.text;
    if (!rawText?.trim()) {
      broadcastStatus(correlationId, {
        runId, status: 'failed',
        message: 'LLM không trả về kết quả.'
      });
      return createResponse(message, MESSAGE_TYPES.MARKET_ASSESSMENT_FAILED, {
        success: false, runId, error: 'LLM returned empty response'
      });
    }

    broadcastStatus(correlationId, {
      runId, status: 'running', step: 3, totalSteps: 5,
      message: 'Đang phân tích kết quả...'
    });

    // Step 4: Parse + Validate (with 1 retry)
    let validationResult = validateMarketAssessmentOutput(rawText, {
      strict: true,
      activeSectors: classificationMode === 'CONSTRAINED' ? activeSectors : []
    });

    if (!validationResult.valid) {
      logger.warn('First validation failed, attempting corrective retry', {
        correlationId, errors: validationResult.errors
      });

      broadcastStatus(correlationId, {
        runId, status: 'running', step: 3, totalSteps: 5,
        message: 'Kết quả sai format, đang thử lại...'
      });

      // Retry with corrective prompt
      const correctivePrompt = buildCorrectivePrompt(validationResult.errors);
      const retryResult = await provider.sendPrompt(correctivePrompt, {
        runId: runId + '-retry',
        createNewChat: false,
        timeoutMs: 120000,
      });

      if (retryResult.text?.trim()) {
        validationResult = validateMarketAssessmentOutput(retryResult.text, {
          strict: true,
          activeSectors: classificationMode === 'CONSTRAINED' ? activeSectors : []
        });
      }
    }

    if (!validationResult.valid) {
      logger.error('Validation failed after retry', {
        correlationId, errors: validationResult.errors
      });
      broadcastStatus(correlationId, {
        runId, status: 'failed',
        message: `Kết quả không hợp lệ: ${validationResult.errors[0]}`
      });
      return createResponse(message, MESSAGE_TYPES.MARKET_ASSESSMENT_FAILED, {
        success: false, runId,
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }

    broadcastStatus(correlationId, {
      runId, status: 'running', step: 4, totalSteps: 5,
      message: 'Đang lưu kết quả...'
    });

    // Step 5: Persist to DB — insert all records in batch
    const { as_of_date, records } = validationResult.data;
    const rows = records.map(rec => ({
      user_id: userId,
      run_id: runId,
      as_of_date,
      symbol: rec.symbol,
      sector_name: rec.sector_name,
      market_regime_state: rec.market_regime_state,
      market_regime_score: rec.market_regime_score,
      market_regime_explanation: rec.market_regime_explanation,
      sector_score: rec.sector_score,
      sector_trend: rec.sector_trend,
      sector_explanation: rec.sector_explanation,
      symbol_score: rec.symbol_score,
      action: rec.action,
      symbol_explanation: rec.symbol_explanation,
      classification_mode: classificationMode,
      provider: providerName,
      raw_record: rec.raw_record,
      // FSD-003: Market snapshot provenance
      market_snapshot: marketSnapshot || null,
      snapshot_missing: snapshotMissing,
    }));

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('market_assessment')
        .insert(rows);
      if (error) throw error;
    }, { operationName: 'market_assessment.insert', correlationId });

    const timing = Date.now() - startTime;
    logger.info('Assessment run completed', {
      correlationId, runId, recordCount: rows.length,
      classificationMode, provider: providerName, timing
    });

    broadcastStatus(correlationId, {
      runId, status: 'done', step: 5, totalSteps: 5,
      message: `Hoàn tất! ${rows.length} mã đã được đánh giá.`
    });

    return createResponse(message, MESSAGE_TYPES.MARKET_ASSESSMENT_DONE, {
      success: true,
      runId,
      as_of_date,
      recordCount: rows.length,
      classificationMode,
      provider: providerName,
      autoCorrections: validationResult.autoCorrections,
      warnings: validationResult.warnings,
      records: validationResult.data.records,
      timing
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('MARKET_ASSESSMENT_RUN failed', { correlationId, error: error.message, stack: error.stack });
    broadcastStatus(correlationId, {
      runId, status: 'failed',
      message: `Lỗi: ${error.message}`
    });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED,
      `Đánh giá thị trường thất bại: ${error.message}`);
  }
});

// ============================================================
// MARKET_ASSESSMENT_GET_HISTORY — Fetch assessment history
// ============================================================
registerHandler(MESSAGE_TYPES.MARKET_ASSESSMENT_GET_HISTORY, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { days = 90, symbol, sector_name } = message.data || {};

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    let query = supabase
      .from('market_assessment')
      .select('*')
      .eq('user_id', userId)
      .gte('as_of_date', sinceDateStr)
      .order('as_of_date', { ascending: false })
      .order('symbol', { ascending: true });

    if (symbol) {
      query = query.eq('symbol', symbol.toUpperCase());
    }
    if (sector_name) {
      query = query.eq('sector_name', sector_name);
    }

    const items = await supabaseWithRetry(async () => {
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }, { operationName: 'market_assessment.getHistory', correlationId });

    // Group by run for summary
    const runMap = new Map();
    for (const item of items) {
      if (!runMap.has(item.run_id)) {
        runMap.set(item.run_id, {
          run_id: item.run_id,
          as_of_date: item.as_of_date,
          classification_mode: item.classification_mode,
          provider: item.provider,
          market_regime_state: item.market_regime_state,
          market_regime_score: item.market_regime_score,
          created_at: item.created_at,
          record_count: 0,
          sectors: new Set(),
          records: []
        });
      }
      const run = runMap.get(item.run_id);
      run.record_count++;
      run.sectors.add(item.sector_name);
      run.records.push(item);
    }

    const runs = Array.from(runMap.values()).map(run => ({
      ...run,
      sectors: [...run.sectors]
    }));

    return createResponse(message, MESSAGE_TYPES.MARKET_ASSESSMENT_HISTORY_DATA, {
      success: true,
      items,
      runs
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('MARKET_ASSESSMENT_GET_HISTORY failed', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, 'Không thể tải lịch sử đánh giá.');
  }
});

// ============================================================
// MARKET_ASSESSMENT_GET_DETAIL — Single run detail
// ============================================================
registerHandler(MESSAGE_TYPES.MARKET_ASSESSMENT_GET_DETAIL, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { run_id } = message.data || {};

    if (!run_id) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Thiếu run_id.');
    }

    const items = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('market_assessment')
        .select('*')
        .eq('user_id', userId)
        .eq('run_id', run_id)
        .order('symbol', { ascending: true });
      if (error) throw error;
      return data;
    }, { operationName: 'market_assessment.getDetail', correlationId });

    return createResponse(message, MESSAGE_TYPES.MARKET_ASSESSMENT_DETAIL_DATA, {
      success: true,
      run_id,
      items
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('MARKET_ASSESSMENT_GET_DETAIL failed', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, 'Không thể tải chi tiết đánh giá.');
  }
});

// ============================================================
// MARKET_ASSESSMENT_DELETE_RUN — Delete a full run
// ============================================================
registerHandler(MESSAGE_TYPES.MARKET_ASSESSMENT_DELETE_RUN, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { run_id } = message.data || {};

    if (!run_id) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Thiếu run_id.');
    }

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('market_assessment')
        .delete()
        .eq('user_id', userId)
        .eq('run_id', run_id);
      if (error) throw error;
    }, { operationName: 'market_assessment.deleteRun', correlationId });

    logger.info('Assessment run deleted', { correlationId, run_id });

    return createResponse(message, MESSAGE_TYPES.MARKET_ASSESSMENT_RUN_DELETED, {
      success: true,
      run_id
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('MARKET_ASSESSMENT_DELETE_RUN failed', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, 'Không thể xoá đánh giá.');
  }
});
