/**
 * Prompt Improvement API – UI ↔ Background communication layer
 *
 * Routes all prompt-improvement operations (runs, lessons, evaluator, inject, purge)
 * through chrome.runtime.sendMessage to background handlers.
 *
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractError(response) {
  if (!response) return { code: 'NO_RESPONSE', message: 'Không nhận được phản hồi từ background.' };
  if (response.errorCode) {
    return { code: response.errorCode, message: response.errorMessage || 'Có lỗi xảy ra' };
  }
  if (response.error) {
    if (typeof response.error === 'string') return { code: 'ERROR', message: response.error };
    if (response.error.message) return { code: response.error.code || 'ERROR', message: response.error.message };
  }
  return null;
}

async function send(type, data = {}) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data,
    });
    const error = extractError(response);
    if (error) return { ...response, _error: error };
    return { ...response, _error: null };
  } catch (err) {
    console.error(`[PromptImprovementAPI] ${type} failed:`, err);
    return { _error: { code: 'NETWORK_ERROR', message: 'Không thể kết nối. Vui lòng thử lại.' } };
  }
}

// ---------------------------------------------------------------------------
// Prompt Runs
// ---------------------------------------------------------------------------

/**
 * List recent prompt runs.
 * @param {number} [sinceDays=7]
 * @param {string} [taskKey]
 * @returns {Promise<{items: Object[], error: Object|null}>}
 */
export async function listRuns(sinceDays = 7, taskKey = null) {
  const res = await send(MESSAGE_TYPES.PROMPT_RUNS_LIST, { sinceDays, taskKey });
  return { items: res.items || [], count: res.count || 0, error: res._error };
}

/**
 * Get single run.
 */
export async function getRun(id) {
  const res = await send(MESSAGE_TYPES.PROMPT_RUN_GET, { id });
  return { run: res.run || null, error: res._error };
}

/**
 * Delete a run.
 */
export async function deleteRun(id) {
  const res = await send(MESSAGE_TYPES.PROMPT_RUN_DELETE, { id });
  return { success: !!res.success, error: res._error };
}

/**
 * Toggle pin on a run.
 */
export async function toggleRunPin(id) {
  const res = await send(MESSAGE_TYPES.PROMPT_RUN_PIN, { id });
  return { pinned: res.pinned, error: res._error };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Build evaluator prompt for a run.
 * @returns {Promise<{evalPrompt: string, error: Object|null}>}
 */
export async function buildEvalPrompt(runId, { redact = false, maxChars = 8000 } = {}) {
  const res = await send(MESSAGE_TYPES.PROMPT_RUN_BUILD_EVAL, { id: runId, redact, maxChars });
  return { evalPrompt: res.evalPrompt || '', runId: res.runId, error: res._error };
}

/**
 * Parse raw evaluator output.
 * @returns {Promise<{success: boolean, evaluation: Object, lesson: Object, errors: string[], error: Object|null}>}
 */
export async function parseEvalOutput(rawText, runId) {
  const res = await send(MESSAGE_TYPES.PROMPT_EVAL_PARSE, { rawText, runId });
  return {
    success: !!res.success,
    evaluation: res.evaluation || null,
    lesson: res.lesson || null,
    errors: res.errors || [],
    error: res._error,
  };
}

// ---------------------------------------------------------------------------
// Prompt Lessons
// ---------------------------------------------------------------------------

/**
 * List lessons with filters.
 */
export async function listLessons({ taskKey, promptVersion, status, tags, sort } = {}) {
  const res = await send(MESSAGE_TYPES.PROMPT_LESSONS_LIST, { taskKey, promptVersion, status, tags, sort });
  return { items: res.items || [], count: res.count || 0, error: res._error };
}

/**
 * Save a lesson manually.
 */
export async function saveLesson(lesson) {
  const res = await send(MESSAGE_TYPES.PROMPT_LESSON_SAVE, lesson);
  return { lesson: res.lesson || null, error: res._error };
}

/**
 * Update lesson fields.
 */
export async function updateLesson(id, updates) {
  const res = await send(MESSAGE_TYPES.PROMPT_LESSON_UPDATE, { id, updates });
  return { lesson: res.lesson || null, error: res._error };
}

/**
 * Delete a lesson.
 */
export async function deleteLesson(id) {
  const res = await send(MESSAGE_TYPES.PROMPT_LESSON_DELETE, { id });
  return { success: !!res.success, error: res._error };
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/**
 * Inject lessons into a prompt text.
 */
export async function injectLessonsIntoPrompt(promptText, opts = {}) {
  const res = await send(MESSAGE_TYPES.PROMPT_LESSONS_INJECT, { promptText, ...opts });
  return {
    injectedPrompt: res.injectedPrompt || promptText,
    lessonsCount: res.lessonsCount || 0,
    lessonsBlock: res.lessonsBlock || '',
    error: res._error,
  };
}

// ---------------------------------------------------------------------------
// Stats & Purge
// ---------------------------------------------------------------------------

/**
 * Get daily improvement stats.
 */
export async function getImprovementStats() {
  const res = await send(MESSAGE_TYPES.PROMPT_IMPROVEMENT_STATS);
  return {
    todayRuns: res.todayRuns || 0,
    evaluatedToday: res.evaluatedToday || 0,
    totalLessons: res.totalLessons || 0,
    activeLessons: res.activeLessons || 0,
    error: res._error,
  };
}

/**
 * Trigger manual purge.
 */
export async function triggerPurge() {
  const res = await send(MESSAGE_TYPES.PROMPT_IMPROVEMENT_PURGE);
  return { purgedRuns: res.purgedRuns || 0, purgedLessons: res.purgedLessons || 0, error: res._error };
}
