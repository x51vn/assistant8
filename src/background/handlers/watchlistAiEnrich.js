/**
 * @fileoverview Watchlist AI Enrichment Handler
 * Handles WATCHLIST_AI_ENRICH_RUN message from UI (manual trigger)
 *
 * Architecture:
 * - Stateless handler pattern (Service Worker can terminate anytime)
 * - Delegates to watchlistAiEnrichService for core logic
 * - Background = Middleware: UI → Background → ChatGPT + X-Neews API
 *
 * Message types:
 * - WATCHLIST_AI_ENRICH_RUN: UI → Background (start enrichment)
 * - WATCHLIST_AI_ENRICH_STATUS: Background → UI (broadcast, progress)
 * - WATCHLIST_AI_ENRICH_DONE: Background → UI (broadcast, result)
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { runEnrichment, isEnrichmentRunning, getEnrichmentStatus, cancelEnrichment, resetEnrichmentState } from '../services/watchlistAiEnrichService.js';

const logger = createLogger('Handlers/WatchlistAiEnrich');

/**
 * Handle WATCHLIST_AI_ENRICH_RUN
 * Starts the AI enrichment process for watchlist
 *
 * Payload: { dryRun?: boolean }
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RUN, async (message) => {
  const { correlationId } = message;
  const data = message.data || {};
  const dryRun = data.dryRun === true;

  logger.info('Handling WATCHLIST_AI_ENRICH_RUN', { correlationId, dryRun });

  try {
    // Check if already running
    const running = await isEnrichmentRunning();
    if (running) {
      logger.warn('Enrichment already running', { correlationId });
      return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
        success: false,
        stage: 'already_running',
        error: 'Đang có một lần chạy enrichment khác. Vui lòng chờ.'
      });
    }

    // Start enrichment asynchronously
    // Don't await - return immediately so UI stays responsive
    // Results will be broadcast via WATCHLIST_AI_ENRICH_STATUS / DONE
    runEnrichment({ dryRun }).catch(error => {
      logger.error('Enrichment run failed unexpectedly', {
        correlationId,
        error: error.message
      });
    });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      stage: 'started'
    });

  } catch (error) {
    logger.error('WATCHLIST_AI_ENRICH_RUN handler error', {
      correlationId,
      error: error.message
    });

    if (error.message?.includes('Failed to fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR',
        'Không có kết nối internet. Vui lòng kiểm tra mạng.');
    }

    return createErrorResponse(message, 'OPERATION_FAILED', error.message);
  }
});

/**
 * Handle WATCHLIST_AI_ENRICH_CANCEL
 * Cancels the currently running AI enrichment process
 *
 * Payload: (empty)
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCEL, async (message) => {
  const { correlationId } = message;

  logger.info('Handling WATCHLIST_AI_ENRICH_CANCEL', { correlationId });

  try {
    // Check if enrichment is running
    const running = await isEnrichmentRunning();
    if (!running) {
      logger.warn('No enrichment running to cancel', { correlationId });
      return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCELLED, {
        success: false,
        stage: 'not_running',
        error: 'Không có lần chạy enrichment nào đang diễn ra.'
      });
    }

    // Request cancellation
    const result = await cancelEnrichment();

    logger.info('Enrichment cancellation requested', {
      correlationId,
      successCount: result.successCount,
      failureCount: result.failureCount
    });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_CANCELLED, {
      success: true,
      stage: 'cancelled',
      message: 'Đã hủy enrichment. Các mã đã xử lý sẽ được lưu lại.',
      ...result
    });

  } catch (error) {
    logger.error('WATCHLIST_AI_ENRICH_CANCEL handler error', {
      correlationId,
      error: error.message
    });

    return createErrorResponse(message, 'OPERATION_FAILED',
      'Không thể hủy enrichment. Vui lòng thử lại.');
  }
});

/**
 * Handle WATCHLIST_AI_ENRICH_RESET
 * Force reset enrichment state when stuck
 *
 * Payload: (empty)
 */
registerHandler(MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RESET, async (message) => {
  const { correlationId } = message;

  logger.info('Handling WATCHLIST_AI_ENRICH_RESET', { correlationId });

  try {
    // Force reset state
    await resetEnrichmentState();

    logger.info('Enrichment state reset successful', { correlationId });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_AI_ENRICH_STATUS, {
      success: true,
      stage: 'reset',
      message: 'Đã reset enrichment state. Bây giờ bạn có thể chạy lại.'
    });

  } catch (error) {
    logger.error('WATCHLIST_AI_ENRICH_RESET handler error', {
      correlationId,
      error: error.message
    });

    return createErrorResponse(message, 'OPERATION_FAILED',
      'Không thể reset state. Vui lòng thử lại.');
  }
});

logger.info('Watchlist AI Enrichment handler registered');
