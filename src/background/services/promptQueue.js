/**
 * @fileoverview Unified Prompt Queue Service (p-queue based)
 *
 * ALL LLM interactions (ChatGPT, Gemini, Claude) MUST go through this queue (concurrency = 1).
 * This ensures only one prompt is active at a time, preventing interference
 * between concurrent LLM operations.
 *
 * XST-817: Updated to reflect multi-LLM support. The queue is provider-agnostic —
 * it serialises any async function, not just ChatGPT interactions.
 *
 * Two modes:
 *
 * 1. enqueue(fn) — Synchronous: caller awaits the result
 *    Used by: SEND_PROMPT (and legacy aliases routed to SEND_PROMPT), context menu sends,
 *             GeminiWebProvider.sendPrompt(), ClaudeWebProvider.sendPrompt()
 *
 * 2. enqueueBackgroundJob(config) — Fire-and-forget: returns immediately
 *    Job runs in background with status broadcasting & persistence.
 *    Used by: WATCHLIST_ENRICH
 *
 * Background job persistence:
 *   Jobs are stored in chrome.storage.local under 'prompt_queue_jobs'.
 *   On SW restart, pending jobs are requeued via resumeOnStartup().
 *
 * Status broadcasting:
 *   Background jobs broadcast status via chrome.runtime.sendMessage.
 *   Watchlist enrichment uses WATCHLIST_AI_ENRICH_* message types (backward compat).
 *   Generic jobs use PROMPT_QUEUE_STATUS message type.
 *
 * Ticket: XST-742 (queue unification)
 */

import PQueue from 'p-queue';
import { createLogger, generateCorrelationId } from '../../logger.js';

const logger = createLogger('PromptQueue');

// ===== CONSTANTS =====
const STORAGE_KEY = 'prompt_queue_jobs';
const ACTIVE_SESSION_KEY = 'active_session'; // Currently-running ChatGPT session owned by the queue
const JOB_TTL_MS = 60 * 60 * 1000; // 1h auto-cleanup for terminal jobs

// ===== SINGLETON QUEUE (concurrency = 1) =====
const queue = new PQueue({ concurrency: 1 });

// =============================================
// PUBLIC API: Synchronous enqueue (await result)
// =============================================

/**
 * Enqueue async work that needs exclusive ChatGPT access.
 * Caller awaits the result. Job runs when its turn comes.
 *
 * @param {Function} asyncFn - async () => result
 * @returns {Promise<any>} The result of asyncFn
 * @throws {Error} If asyncFn throws
 */
export function enqueue(asyncFn) {
  logger.debug('Enqueuing sync prompt job', {
    queueSize: queue.size,
    pending: queue.pending
  });

  return queue.add(asyncFn);
}

// =============================================
// PUBLIC API: Background job (fire-and-forget)
// =============================================

/**
 * Enqueue a long-running background job.
 * Returns immediately with job info.
 * Job state is persisted to chrome.storage.local.
 * Status updates broadcast via chrome.runtime.sendMessage.
 *
 * @param {Object} config
 * @param {string} config.type - Job type (e.g., 'WATCHLIST_ENRICH')
 * @param {Object} config.payload - Job data (e.g., { symbol: 'VNM' })
 * @param {Function} config.processor - async (job) => { success, item?, error? }
 * @param {string} [config.resumeJobId] - Use existing job ID (for resume on startup)
 * @returns {Promise<{ jobId: string, position: number, duplicate: boolean }>}
 */
export async function enqueueBackgroundJob(config) {
  const { type, payload, processor, resumeJobId } = config;
  const jobId = resumeJobId || generateCorrelationId();

  if (!resumeJobId) {
    // ===== New job: validate and persist =====
    const jobs = await readPersistedJobs();
    const activeJobs = jobs.filter(j => j.state === 'queued' || j.state === 'running');

    // Duplicate check (type-specific)
    if (type === 'WATCHLIST_ENRICH' && payload?.symbol) {
      const symbolUpper = payload.symbol.toUpperCase();
      const existing = activeJobs.find(j =>
        j.type === 'WATCHLIST_ENRICH' &&
        j.payload?.symbol === symbolUpper
      );
      if (existing) {
        logger.info('Duplicate job found', { symbol: symbolUpper, existingId: existing.id });
        return {
          jobId: existing.id,
          position: activeJobs.indexOf(existing) + 1,
          duplicate: true
        };
      }
    }

    // Persist new job
    await persistJob({
      id: jobId,
      type,
      state: 'queued',
      payload,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      lastError: null,
      attempt: 0
    });

    logger.info('Background job enqueued', {
      jobId,
      type,
      payload: { symbol: payload?.symbol },
      queuePosition: queue.size + queue.pending + 1
    });
  }

  // ===== Add to p-queue (fire-and-forget) =====
  queue.add(async () => {
    // Check cancelled before starting
    const jobState = await getPersistedJob(jobId);
    if (!jobState || jobState.state === 'cancelled') {
      broadcastJobStatus(jobId, 'cancelled', type, payload);
      return;
    }

    // Mark running
    const attempt = (jobState.attempt || 0) + 1;
    await updateJobState(jobId, {
      state: 'running',
      startedAt: Date.now(),
      attempt
    });
    // Track active session so UI and processors can monitor what the queue is doing
    await chrome.storage.local.set({
      [ACTIVE_SESSION_KEY]: {
        jobId,
        type,
        payload,
        chatId: null,     // Will be updated by processor after sendInput succeeds
        chatUrl: null,
        tabId: null,       // Will be updated by processor after ensureChatGPTTab
        startedAt: Date.now(),
        attempt
      }
    });
    broadcastJobStatus(jobId, 'running', type, {
      ...payload,
      attempt
    });

    try {
      // Build job object for processor
      const jobForProcessor = {
        correlationId: jobId,
        type,
        payload,
        attempt
      };

      const result = await processor(jobForProcessor);

      // Check cancelled after processing
      if (await isJobCancelled(jobId)) {
        await cleanupActiveSession();
        broadcastJobStatus(jobId, 'cancelled', type, payload);
        return;
      }

      if (result.success) {
        await updateJobState(jobId, {
          state: 'done',
          finishedAt: Date.now(),
          result: { item: result.item }
        });
        await cleanupActiveSession();
        broadcastJobStatus(jobId, 'done', type, {
          ...payload,
          item: result.item
        });
        logger.info('Background job completed', { jobId, type });
      } else {
        await updateJobState(jobId, {
          state: 'failed',
          finishedAt: Date.now(),
          lastError: result.error
        });
        await cleanupActiveSession();
        broadcastJobStatus(jobId, 'failed', type, {
          ...payload,
          error: result.error
        });
        logger.warn('Background job failed', { jobId, type, error: result.error });
      }
    } catch (err) {
      logger.error('Background job exception', {
        jobId,
        type,
        error: err.message,
        stack: err.stack
      });
      await updateJobState(jobId, {
        state: 'failed',
        finishedAt: Date.now(),
        lastError: err.message
      });
      await cleanupActiveSession();
      broadcastJobStatus(jobId, 'failed', type, {
        ...payload,
        error: err.message
      });
    }
  }).catch(err => {
    logger.error('Background job p-queue error', { jobId, error: err.message });
  });

  const position = queue.size + queue.pending;
  return { jobId, position, duplicate: false };
}

// =============================================
// PUBLIC API: Job management
// =============================================

/**
 * Cancel a background job
 * @param {string} jobId
 * @returns {Promise<boolean>} true if cancelled
 */
export async function cancelJob(jobId) {
  const job = await getPersistedJob(jobId);
  if (!job) {
    logger.warn('Cancel: job not found', { jobId });
    return false;
  }

  if (job.state === 'queued' || job.state === 'running') {
    await updateJobState(jobId, {
      state: 'cancelled',
      finishedAt: Date.now()
    });
    logger.info('Job cancelled', { jobId, previousState: job.state });
    return true;
  }

  logger.info('Cancel: job already in terminal state', { jobId, state: job.state });
  return false;
}

/**
 * Check if a job has been cancelled
 * Used by processor functions during long operations.
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
export async function isJobCancelled(jobId) {
  const job = await getPersistedJob(jobId);
  return !job || job.state === 'cancelled';
}

/**
 * Get queue info (for UI display)
 * Includes activeSession: the ChatGPT session the queue currently owns.
 * @returns {Promise<Object>}
 */
export async function getQueueInfo() {
  await cleanStaleJobs();
  const jobs = await readPersistedJobs();
  const active = jobs.filter(j => j.state === 'queued' || j.state === 'running');

  let activeSession = null;
  try {
    const stored = await chrome.storage.local.get([ACTIVE_SESSION_KEY]);
    activeSession = stored[ACTIVE_SESSION_KEY] || null;
  } catch { /* ignore */ }

  return {
    queueSize: queue.size,
    pendingCount: queue.pending,
    jobs,
    activeCount: active.length,
    queuedCount: active.filter(j => j.state === 'queued').length,
    runningJob: jobs.find(j => j.state === 'running') || null,
    activeSession // { jobId, type, payload, chatId, chatUrl, startedAt } | null
  };
}

/**
 * Update the active session's chatId/chatUrl/tabId once the processor
 * has sent the prompt and received a chatId from the content script.
 * Called by processors (e.g. watchlistEnrich) immediately after sendInput succeeds.
 *
 * @param {string} jobId   - Must match the currently running job
 * @param {string} chatId  - ChatGPT conversation ID (from URL)
 * @param {string} chatUrl - Full chat URL
 * @param {number} [tabId] - Chrome tab ID where the session is running
 */
export async function setActiveSessionChatId(jobId, chatId, chatUrl, tabId = null) {
  try {
    const stored = await chrome.storage.local.get([ACTIVE_SESSION_KEY]);
    const session = stored[ACTIVE_SESSION_KEY];
    if (session && session.jobId === jobId) {
      const update = { ...session, chatId, chatUrl };
      if (tabId !== null) update.tabId = tabId;
      await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: update });
      logger.debug('Active session chatId updated', { jobId, chatId, tabId });
    }
  } catch (err) {
    logger.warn('setActiveSessionChatId failed', { error: err.message });
  }
}

// =============================================
// PUBLIC API: Queue flow control
// =============================================

/**
 * Pause the queue — running job finishes, but no more jobs start.
 * @returns {{ paused: boolean }}
 */
export function pauseQueue() {
  queue.pause();
  logger.info('Queue paused', { size: queue.size, pending: queue.pending });
  broadcastQueuePauseState(true);
  return { paused: true };
}

/**
 * Resume the queue after pause.
 * @returns {{ paused: boolean }}
 */
export function resumeQueue() {
  queue.start();
  logger.info('Queue resumed', { size: queue.size, pending: queue.pending });
  broadcastQueuePauseState(false);
  return { paused: false };
}

/**
 * Whether the queue is currently paused.
 * @returns {boolean}
 */
export function isQueuePaused() {
  return queue.isPaused;
}

/**
 * Cancel all pending (queued) background jobs.
 * Running job is NOT cancelled — only waiting jobs.
 * Also clears the p-queue internal list.
 * @returns {Promise<{ cancelled: number }>}
 */
export async function cancelAllPending() {
  // 1. Cancel persisted 'queued' jobs
  const jobs = await readPersistedJobs();
  let cancelled = 0;
  for (const job of jobs) {
    if (job.state === 'queued') {
      job.state = 'cancelled';
      job.finishedAt = Date.now();
      cancelled++;
      broadcastJobStatus(job.id, 'cancelled', job.type, job.payload);
    }
  }
  if (cancelled > 0) {
    await writePersistedJobs(jobs);
  }

  // 2. Clear p-queue pending items
  queue.clear();

  logger.info('All pending jobs cancelled', { cancelled });
  return { cancelled };
}

/**
 * Force reset stuck queue
 */
export async function resetQueue() {
  const jobs = await readPersistedJobs();
  for (const job of jobs) {
    if (job.state === 'running') {
      job.state = 'failed';
      job.finishedAt = Date.now();
      job.lastError = 'Reset by user';
    }
  }
  await writePersistedJobs(jobs);
  queue.clear(); // Remove all pending p-queue items
  logger.info('Queue reset completed');
}

/**
 * Resume background jobs on SW restart.
 * Resets stuck 'running' jobs to 'queued', then re-enqueues them.
 *
 * @param {Object} processors - Map of { jobType: processorFn }
 *   e.g., { 'WATCHLIST_ENRICH': processEnrichmentJob }
 */
export async function resumeOnStartup(processors) {
  const jobs = await readPersistedJobs();
  let changed = false;
  const toResume = [];

  for (const job of jobs) {
    if (job.state === 'running') {
      logger.info('Requeuing stuck job after SW restart', {
        jobId: job.id,
        type: job.type,
        symbol: job.payload?.symbol
      });
      job.state = 'queued';
      job.startedAt = null;
      changed = true;
    }
    if (job.state === 'queued') {
      toResume.push(job);
    }
  }

  if (changed) {
    await writePersistedJobs(jobs);
  }

  if (toResume.length > 0) {
    logger.info('Resuming background jobs on startup', { count: toResume.length });
    for (const job of toResume) {
      const processor = processors[job.type];
      if (processor) {
        await enqueueBackgroundJob({
          type: job.type,
          payload: job.payload,
          processor,
          resumeJobId: job.id
        });
      } else {
        logger.warn('No processor for job type on resume, skipping', {
          type: job.type,
          jobId: job.id
        });
      }
    }
  }
}

// =============================================
// INTERNAL: Storage helpers
// =============================================

async function readPersistedJobs() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
  } catch (err) {
    logger.error('Failed to read persisted jobs', { error: err.message });
    return [];
  }
}

async function writePersistedJobs(jobs) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: jobs });
  } catch (err) {
    logger.error('Failed to write persisted jobs', { error: err.message });
  }
}

async function persistJob(job) {
  const jobs = await readPersistedJobs();
  jobs.push(job);
  await writePersistedJobs(jobs);
}

async function getPersistedJob(jobId) {
  const jobs = await readPersistedJobs();
  return jobs.find(j => j.id === jobId) || null;
}

async function updateJobState(jobId, updates) {
  const jobs = await readPersistedJobs();
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    Object.assign(job, updates);
    await writePersistedJobs(jobs);
  }
}

async function cleanStaleJobs() {
  const jobs = await readPersistedJobs();
  const now = Date.now();
  const before = jobs.length;
  const cleaned = jobs.filter(job => {
    if (job.state === 'queued' || job.state === 'running') return true;
    const age = now - (job.finishedAt || job.createdAt);
    return age < JOB_TTL_MS;
  });
  if (cleaned.length !== before) {
    logger.info('Cleaned stale jobs', { removed: before - cleaned.length });
    await writePersistedJobs(cleaned);
  }
}

// =============================================
// INTERNAL: Active session cleanup
// =============================================

/**
 * Read the active_session, remove it from storage, and send
 * 'unlock_navigation' to the content script tab so the
 * navigation guard is deactivated even if capture hasn't finished.
 */
async function cleanupActiveSession() {
  try {
    const stored = await chrome.storage.local.get([ACTIVE_SESSION_KEY]);
    const session = stored[ACTIVE_SESSION_KEY];
    await chrome.storage.local.remove([ACTIVE_SESSION_KEY]);

    if (session?.tabId) {
      chrome.tabs.sendMessage(session.tabId, { action: 'unlock_navigation' }).catch(() => {
        // Tab may have been closed — safe to ignore
      });
    }
  } catch {
    // ignore
  }
}

// =============================================
// INTERNAL: Broadcasting
// =============================================

/**
 * Broadcast job status to UI via chrome.runtime.sendMessage.
 * Fire-and-forget — UI may or may not be listening.
 *
 * Watchlist enrichment uses specific WATCHLIST_AI_ENRICH_* types
 * for backward compatibility with WatchlistPage.jsx.
 * Generic jobs use PROMPT_QUEUE_STATUS.
 */
function broadcastJobStatus(jobId, status, jobType, data = {}) {
  let messageType;

  if (jobType === 'WATCHLIST_ENRICH') {
    // Backward compat: WatchlistPage listens for these specific types
    messageType = status === 'done'
      ? 'WATCHLIST_AI_ENRICH_DONE'
      : status === 'cancelled'
        ? 'WATCHLIST_AI_ENRICH_CANCELLED'
        : 'WATCHLIST_AI_ENRICH_STATUS';
  } else {
    messageType = 'PROMPT_QUEUE_STATUS';
  }

  const message = {
    v: 1,
    type: messageType,
    correlationId: jobId,
    timestamp: Date.now(),
    status,
    jobType,
    ...data
  };

  try {
    chrome.runtime.sendMessage(message).catch(() => {
      // No listener — fine (UI may be unmounted)
    });
  } catch {
    // Swallow — sendMessage can throw if no receiver
  }
}

logger.info('PromptQueue service initialized (p-queue, concurrency=1)');

// =============================================
// INTERNAL: Pause-state broadcasting
// =============================================

/**
 * Notify UI that queue pause state changed.
 * @param {boolean} paused
 */
function broadcastQueuePauseState(paused) {
  const message = {
    v: 1,
    type: paused ? 'PROMPT_QUEUE_PAUSED' : 'PROMPT_QUEUE_RESUMED',
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    paused
  };
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch { /* no receiver */ }
}
