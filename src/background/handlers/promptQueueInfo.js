/**
 * @fileoverview Prompt Queue Info Handler
 * Returns p-queue state for Settings UI display
 *
 * Message types:
 * - PROMPT_QUEUE_GET_INFO: UI → Background (request queue state)
 * - PROMPT_QUEUE_INFO: Background → UI (queue state response)
 * - PROMPT_QUEUE_CLEAR_DONE: UI → Background (clear terminal jobs)
 * - PROMPT_QUEUE_CLEARED: Background → UI (cleared confirmation)
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { getQueueInfo, resetQueue } from '../services/promptQueue.js';

const logger = createLogger('Handlers/PromptQueueInfo');

// Storage key (same as promptQueue.js)
const STORAGE_KEY = 'prompt_queue_jobs';

/**
 * Handle PROMPT_QUEUE_GET_INFO
 * Returns current queue state including all persisted jobs
 */
registerHandler(MESSAGE_TYPES.PROMPT_QUEUE_GET_INFO, async (message) => {
  const { correlationId } = message;
  logger.info('Handling PROMPT_QUEUE_GET_INFO', { correlationId });

  try {
    const info = await getQueueInfo();

    return createResponse(message, MESSAGE_TYPES.PROMPT_QUEUE_INFO, {
      success: true,
      queueSize: info.queueSize,
      pendingCount: info.pendingCount,
      activeCount: info.activeCount,
      queuedCount: info.queuedCount,
      runningJob: info.runningJob,
      jobs: info.jobs.map(j => ({
        id: j.id,
        type: j.type,
        state: j.state,
        payload: { symbol: j.payload?.symbol },
        createdAt: j.createdAt,
        startedAt: j.startedAt,
        finishedAt: j.finishedAt,
        lastError: j.lastError,
        attempt: j.attempt
      }))
    });
  } catch (error) {
    logger.error('Failed to get queue info', { correlationId, error: error.message });
    return createErrorResponse(message, 'OPERATION_FAILED', error.message);
  }
});

/**
 * Handle PROMPT_QUEUE_CLEAR_DONE
 * Removes all terminal (done/failed/cancelled) jobs from storage
 */
registerHandler(MESSAGE_TYPES.PROMPT_QUEUE_CLEAR_DONE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling PROMPT_QUEUE_CLEAR_DONE', { correlationId });

  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const jobs = result[STORAGE_KEY] || [];
    const before = jobs.length;

    const activeJobs = jobs.filter(j => j.state === 'queued' || j.state === 'running');
    await chrome.storage.local.set({ [STORAGE_KEY]: activeJobs });

    const removed = before - activeJobs.length;
    logger.info('Cleared terminal jobs', { correlationId, removed, remaining: activeJobs.length });

    return createResponse(message, MESSAGE_TYPES.PROMPT_QUEUE_CLEARED, {
      success: true,
      removed,
      remaining: activeJobs.length
    });
  } catch (error) {
    logger.error('Failed to clear done jobs', { correlationId, error: error.message });
    return createErrorResponse(message, 'OPERATION_FAILED', error.message);
  }
});
