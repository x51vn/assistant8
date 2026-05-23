/**
 * @fileoverview Watchlist Enrichment Handler (Unified Queue)
 *
 * Architecture:
 * 1. UI sends WATCHLIST_AI_ENRICH_RUN -> handler enqueues background job
 * 2. Unified PromptQueue (p-queue, concurrency=1) processes jobs sequentially
 * 3. For each job: prepare prompt -> ChatGPT -> parse -> persist Supabase
 * 4. Background broadcasts status/done/error — UI observes via listener
 * 5. Job state persisted in chrome.storage.local (survives SW restart)
 *
 * All ChatGPT operations go through the unified prompt queue to prevent
 * concurrent ChatGPT interactions.
 *
 * Ticket: XST-742, XST-803
 */

import { registerHandler } from '../../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../../shared/messageSchema.js';
import { createLogger } from '../../../logger.js';
import { ERROR_CODES } from '../../../shared/errorCodes.js';
import {
  enqueueBackgroundJob,
  cancelJob,
  resetQueue,
  resumeOnStartup,
} from '../../services/promptQueue.js';
import { processEnrichmentJob } from './singleEnrich.js';
import { processBatchEnrichmentJob } from './batchEnrich.js';

export * from './parseHelpers.js';
export * from './singleEnrich.js';
export * from './batchEnrich.js';

/** Max symbols per batch prompt */
const BATCH_SIZE = 10;

const logger = createLogger('Handlers/WatchlistEnrich');

// ===== Message Handlers =====

/**
 * WATCHLIST_AI_ENRICH_RUN — Unified queue-based handler
 * UI → Background: enqueue enrichment as background job, return immediately
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RUN, async (message) => {
  const { correlationId } = message;
  const { symbol } = message.data || {};

  logger.info('Enqueue enrichment request', { symbol, correlationId });

  try {
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Mã cổ phiếu là bắt buộc');
    }

    const result = await enqueueBackgroundJob({
      type: 'WATCHLIST_ENRICH',
      payload: { symbol: symbol.trim().toUpperCase() },
      processor: processEnrichmentJob
    });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      correlationId: result.jobId,
      position: result.position,
      duplicate: result.duplicate || false,
      message: result.duplicate
        ? `${symbol.toUpperCase()} đã có trong hàng đợi`
        : `Đã thêm ${symbol.toUpperCase()} vào hàng đợi (vị trí ${result.position})`
    });
  } catch (error) {
    logger.error('Enqueue failed', { error: error.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.QUEUE_ERROR, error.message);
  }
});

/**
 * WATCHLIST_AI_ENRICH_BATCH_RUN — Batch enrichment handler
 * UI → Background: enqueue batch of symbols (max BATCH_SIZE per LLM prompt)
 * Splits into chunks of BATCH_SIZE, each chunk becomes ONE background job → ONE LLM call
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_BATCH_RUN, async (message) => {
  const { correlationId } = message;
  const { symbols } = message.data || {};

  logger.info('Enqueue batch enrichment request', { symbols, correlationId });

  try {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Danh sách mã cổ phiếu là bắt buộc');
    }

    // Sanitize & deduplicate
    const cleanSymbols = [...new Set(
      symbols
        .filter(s => typeof s === 'string' && s.trim())
        .map(s => s.trim().toUpperCase())
    )];

    if (cleanSymbols.length === 0) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Không có mã cổ phiếu hợp lệ');
    }

    // Split into chunks of BATCH_SIZE
    const chunks = [];
    for (let i = 0; i < cleanSymbols.length; i += BATCH_SIZE) {
      chunks.push(cleanSymbols.slice(i, i + BATCH_SIZE));
    }

    // Enqueue each chunk as a separate background job
    const jobResults = [];
    for (const chunk of chunks) {
      const result = await enqueueBackgroundJob({
        type: 'WATCHLIST_ENRICH_BATCH',
        payload: { symbols: chunk },
        processor: processBatchEnrichmentJob
      });
      jobResults.push({
        jobId: result.jobId,
        position: result.position,
        symbols: chunk,
        duplicate: result.duplicate || false
      });
    }

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      totalSymbols: cleanSymbols.length,
      batches: jobResults.length,
      jobs: jobResults,
      message: `Đã tạo ${jobResults.length} batch (${cleanSymbols.length} mã, tối đa ${BATCH_SIZE} mã/batch)`
    });
  } catch (error) {
    logger.error('Batch enqueue failed', { error: error.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.QUEUE_ERROR, error.message);
  }
});

/**
 * WATCHLIST_AI_ENRICH_BATCH_RUN — Batch enrichment handler
 * UI → Background: enqueue batch of symbols (max BATCH_SIZE per LLM prompt)
 * Splits into chunks of BATCH_SIZE, each chunk becomes ONE background job → ONE LLM call
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_BATCH_RUN, async (message) => {
  const { correlationId } = message;
  const { symbols } = message.data || {};

  logger.info('Enqueue batch enrichment request', { symbols, correlationId });

  try {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Danh sách mã cổ phiếu là bắt buộc');
    }

    // Sanitize & deduplicate
    const cleanSymbols = [...new Set(
      symbols
        .filter(s => typeof s === 'string' && s.trim())
        .map(s => s.trim().toUpperCase())
    )];

    if (cleanSymbols.length === 0) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Không có mã cổ phiếu hợp lệ');
    }

    // Split into chunks of BATCH_SIZE
    const chunks = [];
    for (let i = 0; i < cleanSymbols.length; i += BATCH_SIZE) {
      chunks.push(cleanSymbols.slice(i, i + BATCH_SIZE));
    }

    // Enqueue each chunk as a separate background job
    const jobResults = [];
    for (const chunk of chunks) {
      const result = await enqueueBackgroundJob({
        type: 'WATCHLIST_ENRICH_BATCH',
        payload: { symbols: chunk },
        processor: processBatchEnrichmentJob
      });
      jobResults.push({
        jobId: result.jobId,
        position: result.position,
        symbols: chunk,
        duplicate: result.duplicate || false
      });
    }

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      totalSymbols: cleanSymbols.length,
      batches: jobResults.length,
      jobs: jobResults,
      message: `Đã tạo ${jobResults.length} batch (${cleanSymbols.length} mã, tối đa ${BATCH_SIZE} mã/batch)`
    });
  } catch (error) {
    logger.error('Batch enqueue failed', { error: error.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.QUEUE_ERROR, error.message);
  }
});

/**
 * WATCHLIST_AI_ENRICH_CANCEL — Cancel a pending/running job
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCEL, async (message) => {
  const { correlationId: jobId } = message.data || {};
  const { correlationId } = message;

  const targetId = jobId || correlationId;
  const cancelled = await cancelJob(targetId);

  if (cancelled) {
    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCELLED, {
      success: true,
      correlationId: targetId,
      message: 'Đã hủy tác vụ đánh giá'
    });
  }

  return createErrorResponse(message, ERROR_CODES.NOT_FOUND, 'Không tìm thấy tác vụ để hủy');
});

/**
 * WATCHLIST_AI_ENRICH_RESET — Force reset stuck queue
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RESET, async (message) => {
  await resetQueue();
  return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RESET_DONE, {
    success: true,
    message: 'Đã reset hàng đợi'
  });
});

/**
 * WATCHLIST_ENRICH_SYMBOL — Legacy handler (backward compat)
 * Enqueues the job via unified queue and returns immediately with queue info
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_ENRICH_SYMBOL, async (message) => {
  const { correlationId } = message;
  const { symbol } = message.data || {};

  logger.info('Legacy WATCHLIST_ENRICH_SYMBOL → delegating to unified queue', { symbol, correlationId });

  try {
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Mã cổ phiếu là bắt buộc');
    }

    const result = await enqueueBackgroundJob({
      type: 'WATCHLIST_ENRICH',
      payload: { symbol: symbol.trim().toUpperCase() },
      processor: processEnrichmentJob
    });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_ENRICHED, {
      success: true,
      queued: true,
      correlationId: result.jobId,
      position: result.position,
      duplicate: result.duplicate || false,
      message: `Đã thêm ${symbol.toUpperCase()} vào hàng đợi đánh giá`
    });
  } catch (error) {
    logger.error('Legacy enqueue failed', { error: error.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.QUEUE_ERROR, error.message);
  }
});

// ===== Resume on SW startup =====
// Check for pending enrichment jobs from previous SW lifecycle
resumeOnStartup({
  WATCHLIST_ENRICH: processEnrichmentJob,
  WATCHLIST_ENRICH_BATCH: processBatchEnrichmentJob
}).catch(err => {
  logger.warn('Failed to resume queue on startup', { error: err.message });
});

logger.info('Watchlist Enrichment handlers registered (unified queue)');
