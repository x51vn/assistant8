/**
 * @fileoverview Prompt Improvement Loop — Background Handlers
 *
 * Provides message-based CRUD for prompt_runs and prompt_lessons
 * stored in local IndexedDB, plus evaluator prompt building,
 * JSON parsing, lesson injection, and daily purge.
 *
 * All handlers follow the project's registerHandler() / createResponse() pattern.
 *
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';

import {
  saveRun,
  listRuns,
  getRun,
  deleteRun,
  toggleRunPin,
  markRunEvaluated,
  saveLesson,
  listLessons,
  updateLesson,
  deleteLesson,
  getDailyStats,
  purgeAll,
} from '../../shared/promptImprovementDb.js';

import { buildEvaluatorPrompt } from '../../shared/evaluatorPrompt.js';
import { parseEvalResponse } from '../../shared/evalJsonParser.js';
import { injectLessons } from '../../shared/lessonInjector.js';

const logger = createLogger('Handlers/PromptImprovement');

// ===========================================================================
// Prompt Runs
// ===========================================================================

/**
 * PROMPT_RUN_SAVE — Save a prompt run (called when response is captured).
 * Payload: { prompt_text, response_text, prompt_version?, prompt_template?, page_url?, task_key? }
 */
registerHandler(MESSAGE_TYPES.PROMPT_RUN_SAVE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const run = await saveRun({
      prompt_text: data.prompt_text || data.promptText || '',
      response_text: data.response_text || data.responseText || '',
      prompt_version: data.prompt_version || data.promptVersion || null,
      prompt_template: data.prompt_template || data.promptTemplate || null,
      page_url: data.page_url || data.pageUrl || null,
      task_key: data.task_key || data.taskKey || null,
    });

    return createResponse(message, MESSAGE_TYPES.PROMPT_RUN_SAVED, {
      success: true,
      run,
    });
  } catch (error) {
    logger.error('Failed to save prompt run', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_RUNS_LIST — List runs within last N days.
 * Payload: { sinceDays?, taskKey? }
 */
registerHandler(MESSAGE_TYPES.PROMPT_RUNS_LIST, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const runs = await listRuns({
      sinceDays: data.sinceDays || data.since_days || 7,
      taskKey: data.taskKey || data.task_key || null,
    });

    return createResponse(message, MESSAGE_TYPES.PROMPT_RUNS_DATA, {
      success: true,
      items: runs,
      count: runs.length,
    });
  } catch (error) {
    logger.error('Failed to list prompt runs', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_RUN_GET — Get single run by ID.
 * Payload: { id }
 */
registerHandler(MESSAGE_TYPES.PROMPT_RUN_GET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const run = await getRun(data.id);
    if (!run) {
      return createErrorResponse(message, ERROR_CODES.NOT_FOUND, 'Run not found');
    }
    return createResponse(message, MESSAGE_TYPES.PROMPT_RUN_DETAIL, {
      success: true,
      run,
    });
  } catch (error) {
    logger.error('Failed to get prompt run', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_RUN_DELETE — Delete a run.
 * Payload: { id }
 */
registerHandler(MESSAGE_TYPES.PROMPT_RUN_DELETE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    await deleteRun(data.id);
    return createResponse(message, MESSAGE_TYPES.PROMPT_RUN_DELETED, {
      success: true,
      id: data.id,
    });
  } catch (error) {
    logger.error('Failed to delete prompt run', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_RUN_PIN — Toggle pin on a run.
 * Payload: { id }
 */
registerHandler(MESSAGE_TYPES.PROMPT_RUN_PIN, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const pinned = await toggleRunPin(data.id);
    return createResponse(message, MESSAGE_TYPES.PROMPT_RUN_PINNED, {
      success: true,
      id: data.id,
      pinned,
    });
  } catch (error) {
    logger.error('Failed to toggle pin', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

// ===========================================================================
// Evaluator
// ===========================================================================

/**
 * PROMPT_RUN_BUILD_EVAL — Build evaluator prompt for a run.
 * Payload: { id, redact?, maxChars? }
 */
registerHandler(MESSAGE_TYPES.PROMPT_RUN_BUILD_EVAL, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const run = await getRun(data.id);
    if (!run) {
      return createErrorResponse(message, ERROR_CODES.NOT_FOUND, 'Run not found');
    }

    const evalPrompt = buildEvaluatorPrompt(run, {
      redact: data.redact || false,
      maxChars: data.maxChars || data.max_chars || 8000,
    });

    return createResponse(message, MESSAGE_TYPES.PROMPT_RUN_EVAL_PROMPT, {
      success: true,
      evalPrompt,
      runId: run.id,
    });
  } catch (error) {
    logger.error('Failed to build evaluator prompt', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_EVAL_PARSE — Parse raw evaluator output into structured JSON.
 * Payload: { rawText, runId }
 */
registerHandler(MESSAGE_TYPES.PROMPT_EVAL_PARSE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const result = parseEvalResponse(data.rawText || data.raw_text || '');

    if (result.success && data.runId) {
      // Auto-save lesson + mark run as evaluated
      const run = await getRun(data.runId || data.run_id);
      const lesson = await saveLesson({
        source_run_id: data.runId || data.run_id,
        prompt_version: run?.prompt_version || null,
        task_key: run?.task_key || null,
        score: result.data.score,
        tags: result.data.tags,
        lesson_text: result.data.lesson_text,
        issues: result.data.issues,
        strengths: result.data.strengths,
      });

      await markRunEvaluated(data.runId || data.run_id, result.data.score);

      return createResponse(message, MESSAGE_TYPES.PROMPT_EVAL_PARSED, {
        success: true,
        evaluation: result.data,
        lesson,
        runId: data.runId || data.run_id,
      });
    }

    return createResponse(message, MESSAGE_TYPES.PROMPT_EVAL_PARSED, {
      success: result.success,
      evaluation: result.data,
      errors: result.errors,
      rawJson: result.rawJson,
    });
  } catch (error) {
    logger.error('Failed to parse evaluator output', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

// ===========================================================================
// Prompt Lessons
// ===========================================================================

/**
 * PROMPT_LESSON_SAVE — Manually save a lesson.
 * Payload: { source_run_id, score, lesson_text, tags, issues, strengths, task_key?, prompt_version? }
 */
registerHandler(MESSAGE_TYPES.PROMPT_LESSON_SAVE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const lesson = await saveLesson({
      source_run_id: data.source_run_id || data.sourceRunId || null,
      prompt_version: data.prompt_version || data.promptVersion || null,
      task_key: data.task_key || data.taskKey || null,
      score: data.score || 0,
      tags: data.tags || [],
      lesson_text: data.lesson_text || data.lessonText || '',
      issues: data.issues || [],
      strengths: data.strengths || [],
      status: data.status || 'active',
      pinned: data.pinned || false,
    });

    return createResponse(message, MESSAGE_TYPES.PROMPT_LESSON_SAVED, {
      success: true,
      lesson,
    });
  } catch (error) {
    logger.error('Failed to save lesson', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_LESSONS_LIST — List lessons with filters.
 * Payload: { taskKey?, promptVersion?, status?, tags?, sort? }
 */
registerHandler(MESSAGE_TYPES.PROMPT_LESSONS_LIST, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const lessons = await listLessons({
      taskKey: data.taskKey || data.task_key || undefined,
      promptVersion: data.promptVersion || data.prompt_version || undefined,
      status: data.status || undefined,
      tags: data.tags || undefined,
      sort: data.sort || 'newest',
    });

    return createResponse(message, MESSAGE_TYPES.PROMPT_LESSONS_DATA, {
      success: true,
      items: lessons,
      count: lessons.length,
    });
  } catch (error) {
    logger.error('Failed to list lessons', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_LESSON_UPDATE — Update lesson (tags, status, pinned, excluded).
 * Payload: { id, updates: { tags?, status?, pinned?, excluded?, lesson_text? } }
 */
registerHandler(MESSAGE_TYPES.PROMPT_LESSON_UPDATE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const updated = await updateLesson(data.id, data.updates || {});
    if (!updated) {
      return createErrorResponse(message, ERROR_CODES.NOT_FOUND, 'Lesson not found');
    }
    return createResponse(message, MESSAGE_TYPES.PROMPT_LESSON_UPDATED, {
      success: true,
      lesson: updated,
    });
  } catch (error) {
    logger.error('Failed to update lesson', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_LESSON_DELETE — Delete a lesson.
 * Payload: { id }
 */
registerHandler(MESSAGE_TYPES.PROMPT_LESSON_DELETE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    await deleteLesson(data.id);
    return createResponse(message, MESSAGE_TYPES.PROMPT_LESSON_DELETED, {
      success: true,
      id: data.id,
    });
  } catch (error) {
    logger.error('Failed to delete lesson', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

// ===========================================================================
// Lesson Injection
// ===========================================================================

/**
 * PROMPT_LESSONS_INJECT — Inject lessons into a prompt text.
 * Payload: { promptText, taskKey?, promptVersion?, topN?, mode?, enabled? }
 */
registerHandler(MESSAGE_TYPES.PROMPT_LESSONS_INJECT, async (message) => {
  const correlationId = message.correlationId;
  try {
    const data = message.data || message;
    const result = await injectLessons(data.promptText || data.prompt_text || '', {
      taskKey: data.taskKey || data.task_key || undefined,
      promptVersion: data.promptVersion || data.prompt_version || undefined,
      topN: data.topN || data.top_n || 5,
      mode: data.mode || 'full',
      enabled: data.enabled !== false,
    });

    return createResponse(message, MESSAGE_TYPES.PROMPT_LESSONS_INJECTED, {
      success: true,
      injectedPrompt: result.injectedPrompt,
      lessonsCount: result.lessonsCount,
      lessonsBlock: result.lessonsBlock,
    });
  } catch (error) {
    logger.error('Failed to inject lessons', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

// ===========================================================================
// Stats & Purge
// ===========================================================================

/**
 * PROMPT_IMPROVEMENT_STATS — Get daily review stats.
 */
registerHandler(MESSAGE_TYPES.PROMPT_IMPROVEMENT_STATS, async (message) => {
  const correlationId = message.correlationId;
  try {
    const stats = await getDailyStats();
    return createResponse(message, MESSAGE_TYPES.PROMPT_IMPROVEMENT_STATS_DATA, {
      success: true,
      ...stats,
    });
  } catch (error) {
    logger.error('Failed to get improvement stats', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * PROMPT_IMPROVEMENT_PURGE — Purge expired runs + lessons.
 * Called by UI manually or by alarm handler daily.
 */
registerHandler(MESSAGE_TYPES.PROMPT_IMPROVEMENT_PURGE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const result = await purgeAll();
    logger.info('Prompt improvement purge completed', { correlationId, ...result });
    return createResponse(message, MESSAGE_TYPES.PROMPT_IMPROVEMENT_PURGED, {
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to purge', { correlationId, error: error.message });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

logger.info('Prompt Improvement handlers registered');
