/**
 * @fileoverview Enrichment Queue Service
 * Persistent, concurrency-1 job queue backed by chrome.storage.local
 *
 * Architecture:
 * - Jobs are persisted to chrome.storage.local (survives SW restart)
 * - Background worker processes one job at a time (concurrency = 1)
 * - UI enqueues jobs via WATCHLIST_AI_ENRICH_RUN message
 * - Background emits WATCHLIST_AI_ENRICH_STATUS / DONE / CANCELLED
 * - Parsing & Supabase persist happen entirely in background (UI-independent)
 *
 * Storage key: 'enrichment_queue'
 * Shape: { jobs: Job[], processingJobId: string|null }
 *
 * Job states: queued → running → done | failed | cancelled
 *
 * Ticket: XST-742 (queue refactor)
 */

import { createLogger, generateCorrelationId } from '../../logger.js';
import { safeBroadcast } from '../../shared/safeBroadcast.js';

const logger = createLogger('EnrichmentQueue');

// ===== CONSTANTS =====
const STORAGE_KEY = 'enrichment_queue';
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour - auto-clean stale jobs
const MAX_QUEUE_SIZE = 50;

/**
 * Job state enum
 */
export const JOB_STATE = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// ===== INTERNAL STATE =====
let _processing = false; // in-memory guard to prevent concurrent processing

// ===== STORAGE HELPERS =====

/**
 * Read queue from chrome.storage.local
 * @returns {Promise<{jobs: Array, processingJobId: string|null}>}
 */
async function readQueue() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const data = result[STORAGE_KEY] || { jobs: [], processingJobId: null };
    return data;
  } catch (err) {
    logger.error('Failed to read queue from storage', { error: err.message });
    return { jobs: [], processingJobId: null };
  }
}

/**
 * Write queue to chrome.storage.local
 * @param {Object} queueData - { jobs, processingJobId }
 */
async function writeQueue(queueData) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: queueData });
  } catch (err) {
    logger.error('Failed to write queue to storage', { error: err.message });
  }
}

/**
 * Clean stale jobs (TTL expired)
 * Removes jobs older than JOB_TTL_MS that are in terminal state
 */
async function cleanStaleJobs() {
  const queue = await readQueue();
  const now = Date.now();
  const before = queue.jobs.length;

  queue.jobs = queue.jobs.filter(job => {
    // Keep active jobs
    if (job.state === JOB_STATE.QUEUED || job.state === JOB_STATE.RUNNING) {
      return true;
    }
    // Remove terminal jobs past TTL
    const age = now - (job.finishedAt || job.createdAt);
    return age < JOB_TTL_MS;
  });

  if (queue.jobs.length !== before) {
    logger.info('Cleaned stale jobs', { removed: before - queue.jobs.length });
    await writeQueue(queue);
  }
}

// ===== PUBLIC API =====

/**
 * Enqueue a new enrichment job
 * @param {Object} params
 * @param {string} params.type - Job type (e.g., 'WATCHLIST_ENRICH')
 * @param {string} params.symbol - Stock symbol
 * @param {Object} [params.options] - Additional options
 * @returns {Promise<{correlationId: string, position: number}>}
 */
export async function enqueueJob({ type, symbol, options = {} }) {
  const queue = await readQueue();

  // Check queue size limit
  const activeJobs = queue.jobs.filter(j =>
    j.state === JOB_STATE.QUEUED || j.state === JOB_STATE.RUNNING
  );
  if (activeJobs.length >= MAX_QUEUE_SIZE) {
    throw new Error('Hàng đợi đã đầy. Vui lòng chờ các tác vụ hiện tại hoàn tất.');
  }

  // Check duplicate (same symbol already queued/running)
  const existing = activeJobs.find(j => j.payload?.symbol === symbol.toUpperCase());
  if (existing) {
    logger.info('Job already in queue for symbol', { symbol, correlationId: existing.correlationId });
    return {
      correlationId: existing.correlationId,
      position: activeJobs.indexOf(existing) + 1,
      duplicate: true
    };
  }

  const correlationId = generateCorrelationId();
  const job = {
    correlationId,
    type: type || 'WATCHLIST_ENRICH',
    state: JOB_STATE.QUEUED,
    payload: {
      symbol: symbol.toUpperCase(),
      ...options
    },
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    lastError: null,
    attempt: 0
  };

  queue.jobs.push(job);
  await writeQueue(queue);

  const position = queue.jobs.filter(j =>
    j.state === JOB_STATE.QUEUED || j.state === JOB_STATE.RUNNING
  ).length;

  logger.info('Job enqueued', { correlationId, symbol: job.payload.symbol, position });
  return { correlationId, position, duplicate: false };
}

/**
 * Cancel a pending job by correlationId
 * @param {string} correlationId
 * @returns {Promise<boolean>} true if cancelled
 */
export async function cancelJob(correlationId) {
  const queue = await readQueue();
  const job = queue.jobs.find(j => j.correlationId === correlationId);

  if (!job) {
    logger.warn('Cancel: job not found', { correlationId });
    return false;
  }

  if (job.state === JOB_STATE.QUEUED) {
    job.state = JOB_STATE.CANCELLED;
    job.finishedAt = Date.now();
    await writeQueue(queue);
    logger.info('Job cancelled (was queued)', { correlationId });
    return true;
  }

  if (job.state === JOB_STATE.RUNNING) {
    // Mark as cancelled — the processing loop will check this flag
    job.state = JOB_STATE.CANCELLED;
    job.finishedAt = Date.now();
    queue.processingJobId = null;
    await writeQueue(queue);
    logger.info('Job cancelled (was running)', { correlationId });
    return true;
  }

  // Already in terminal state
  logger.info('Cancel: job already in terminal state', { correlationId, state: job.state });
  return false;
}

/**
 * Get current queue state (for UI display)
 * @returns {Promise<{jobs: Array, activeCount: number, queueLength: number}>}
 */
export async function getQueueState() {
  await cleanStaleJobs();
  const queue = await readQueue();
  const activeJobs = queue.jobs.filter(j =>
    j.state === JOB_STATE.QUEUED || j.state === JOB_STATE.RUNNING
  );
  return {
    jobs: queue.jobs,
    activeCount: activeJobs.length,
    queueLength: activeJobs.filter(j => j.state === JOB_STATE.QUEUED).length,
    runningJob: queue.jobs.find(j => j.state === JOB_STATE.RUNNING) || null
  };
}

/**
 * Get job by correlationId
 * @param {string} correlationId
 * @returns {Promise<Object|null>}
 */
export async function getJob(correlationId) {
  const queue = await readQueue();
  return queue.jobs.find(j => j.correlationId === correlationId) || null;
}

/**
 * Update job state in storage
 * @param {string} correlationId
 * @param {Object} updates - Fields to update on the job
 */
export async function updateJob(correlationId, updates) {
  const queue = await readQueue();
  const job = queue.jobs.find(j => j.correlationId === correlationId);
  if (job) {
    Object.assign(job, updates);
    if (updates.state === JOB_STATE.RUNNING) {
      queue.processingJobId = correlationId;
    }
    if ([JOB_STATE.DONE, JOB_STATE.FAILED, JOB_STATE.CANCELLED].includes(updates.state)) {
      if (queue.processingJobId === correlationId) {
        queue.processingJobId = null;
      }
    }
    await writeQueue(queue);
  }
}

/**
 * Pop the next queued job for processing
 * @returns {Promise<Object|null>} Next queued job, or null if empty
 */
export async function popNextJob() {
  const queue = await readQueue();

  // Check if something is already running
  const running = queue.jobs.find(j => j.state === JOB_STATE.RUNNING);
  if (running) {
    logger.debug('A job is already running', { correlationId: running.correlationId });
    return null;
  }

  // Find first queued job
  const nextJob = queue.jobs.find(j => j.state === JOB_STATE.QUEUED);
  if (!nextJob) {
    return null;
  }

  // Mark as running
  nextJob.state = JOB_STATE.RUNNING;
  nextJob.startedAt = Date.now();
  nextJob.attempt += 1;
  queue.processingJobId = nextJob.correlationId;
  await writeQueue(queue);

  logger.info('Job popped for processing', {
    correlationId: nextJob.correlationId,
    symbol: nextJob.payload?.symbol,
    attempt: nextJob.attempt
  });

  return { ...nextJob };
}

/**
 * Check if job was cancelled (for mid-processing checks)
 * @param {string} correlationId
 * @returns {Promise<boolean>}
 */
export async function isJobCancelled(correlationId) {
  const job = await getJob(correlationId);
  return !job || job.state === JOB_STATE.CANCELLED;
}

/**
 * Process queue: pop next job and call processor function
 * This is the main worker loop (concurrency = 1, non-recursive)
 *
 * @param {Function} processorFn - async (job) => { success, item?, error? }
 */
export async function processQueue(processorFn) {
  if (_processing) {
    logger.debug('Queue processing already in progress');
    return;
  }

  _processing = true;
  logger.info('Queue processing started');

  try {
    // Process jobs one by one until queue is empty
    let job;
    while ((job = await popNextJob()) !== null) {
      const { correlationId } = job;
      logger.info('Processing job', { correlationId, symbol: job.payload?.symbol });

      // Broadcast status: running
      broadcastStatus(correlationId, 'running', {
        symbol: job.payload?.symbol,
        attempt: job.attempt
      });

      try {
        // Check cancellation before processing
        if (await isJobCancelled(correlationId)) {
          logger.info('Job was cancelled before processing', { correlationId });
          broadcastStatus(correlationId, 'cancelled', { symbol: job.payload?.symbol });
          continue;
        }

        // Run the actual processor
        const result = await processorFn(job);

        // Check cancellation after processing
        if (await isJobCancelled(correlationId)) {
          logger.info('Job was cancelled during processing', { correlationId });
          broadcastStatus(correlationId, 'cancelled', { symbol: job.payload?.symbol });
          continue;
        }

        if (result.success) {
          await updateJob(correlationId, {
            state: JOB_STATE.DONE,
            finishedAt: Date.now(),
            result: { item: result.item }
          });
          broadcastStatus(correlationId, 'done', {
            symbol: job.payload?.symbol,
            item: result.item
          });
          logger.info('Job completed successfully', { correlationId });
        } else {
          await updateJob(correlationId, {
            state: JOB_STATE.FAILED,
            finishedAt: Date.now(),
            lastError: result.error || 'Unknown error'
          });
          broadcastStatus(correlationId, 'failed', {
            symbol: job.payload?.symbol,
            error: result.error
          });
          logger.warn('Job failed', { correlationId, error: result.error });
        }
      } catch (err) {
        logger.error('Job processing exception', {
          correlationId,
          error: err.message,
          stack: err.stack
        });
        await updateJob(correlationId, {
          state: JOB_STATE.FAILED,
          finishedAt: Date.now(),
          lastError: err.message
        });
        broadcastStatus(correlationId, 'failed', {
          symbol: job.payload?.symbol,
          error: err.message
        });
      }
    }

    logger.info('Queue processing complete (no more jobs)');
  } finally {
    _processing = false;
  }
}

/**
 * Broadcast job status to UI via chrome.runtime.sendMessage
 * Fire-and-forget — UI may or may not be listening
 * @param {string} correlationId
 * @param {string} status - running | done | failed | cancelled
 * @param {Object} data - Additional data
 */
function broadcastStatus(correlationId, status, data = {}) {
  const type = status === 'done'
    ? 'WATCHLIST_AI_ENRICH_DONE'
    : status === 'cancelled'
      ? 'WATCHLIST_AI_ENRICH_CANCELLED'
      : 'WATCHLIST_AI_ENRICH_STATUS';

  const message = {
    v: 1,
    type,
    correlationId,
    timestamp: Date.now(),
    status,
    ...data
  };

  safeBroadcast(message);
}

/**
 * Force reset stuck queue state
 * Use when queue is stuck with a running job that will never complete
 */
export async function resetQueue() {
  const queue = await readQueue();
  for (const job of queue.jobs) {
    if (job.state === JOB_STATE.RUNNING) {
      job.state = JOB_STATE.FAILED;
      job.finishedAt = Date.now();
      job.lastError = 'Reset by user';
    }
  }
  queue.processingJobId = null;
  await writeQueue(queue);
  _processing = false;
  logger.info('Queue reset completed');
}

/**
 * Clear all terminal jobs from queue
 */
export async function clearCompletedJobs() {
  const queue = await readQueue();
  queue.jobs = queue.jobs.filter(j =>
    j.state === JOB_STATE.QUEUED || j.state === JOB_STATE.RUNNING
  );
  await writeQueue(queue);
  logger.info('Cleared completed jobs from queue');
}

/**
 * Resume queue processing on SW restart
 * Checks for stuck running jobs and resets them to queued,
 * then triggers processing
 * @param {Function} processorFn
 */
export async function resumeOnStartup(processorFn) {
  const queue = await readQueue();
  let changed = false;

  for (const job of queue.jobs) {
    if (job.state === JOB_STATE.RUNNING) {
      // SW restarted while job was running — requeue it
      logger.info('Requeuing stuck job after SW restart', {
        correlationId: job.correlationId,
        symbol: job.payload?.symbol
      });
      job.state = JOB_STATE.QUEUED;
      job.startedAt = null;
      changed = true;
    }
  }

  if (changed) {
    queue.processingJobId = null;
    await writeQueue(queue);
  }

  // Check if there are pending jobs
  const pendingCount = queue.jobs.filter(j => j.state === JOB_STATE.QUEUED).length;
  if (pendingCount > 0) {
    logger.info('Resuming queue processing on startup', { pendingCount });
    // Use setTimeout to avoid blocking SW init
    setTimeout(() => processQueue(processorFn), 500);
  }
}
