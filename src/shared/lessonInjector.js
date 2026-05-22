/**
 * @fileoverview Lesson Injector
 *
 * Loads top-N active lessons from IndexedDB and prepends them to a prompt
 * before it is sent to an LLM web UI.
 *
 * Design:
 * - Lessons are stored locally (IndexedDB) and filtered by task_key + prompt_version.
 * - Pinned lessons are always included first.
 * - A "digest" mode summarises many lessons into a compact block.
 * - Toggle: caller can enable/disable injection.
 *
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md – Phase 3
 */

import { listLessons } from './promptImprovementDb.js';
import { createLogger } from '../logger.js';

const logger = createLogger('LessonInjector');

/** Default number of lessons to inject */
export const DEFAULT_TOP_N = 5;

/** Max chars for lessons block to prevent token bloat */
export const MAX_LESSONS_CHARS = 1500;

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Fetch top-N relevant lessons for a given context.
 *
 * @param {Object} [opts]
 * @param {string} [opts.taskKey]
 * @param {string} [opts.promptVersion]
 * @param {number} [opts.topN=5]
 * @returns {Promise<Object[]>} Selected lessons (pinned first, then by recency/score)
 */
export async function getTopLessons({ taskKey, promptVersion, topN = DEFAULT_TOP_N } = {}) {
  try {
    const allActive = await listLessons({
      taskKey,
      promptVersion,
      status: 'active',
      sort: 'newest',
    });

    // Filter out excluded lessons
    const eligible = allActive.filter(l => !l.excluded);

    // Separate pinned and regular
    const pinned = eligible.filter(l => l.pinned);
    const regular = eligible.filter(l => !l.pinned);

    // Pinned always come first, then regular up to topN
    const selected = [...pinned, ...regular].slice(0, topN);

    logger.debug('Top lessons selected', {
      taskKey,
      promptVersion,
      total: allActive.length,
      selected: selected.length,
    });

    return selected;
  } catch (error) {
    logger.error('Failed to load lessons', { error: error.message });
    return [];
  }
}

/**
 * Format lessons into a text block for prompt injection.
 *
 * @param {Object[]} lessons - Array of lesson records
 * @param {Object} [opts]
 * @param {'full'|'digest'} [opts.mode='full'] - Full individual lessons or compact digest
 * @returns {string} Formatted lessons block (empty string if no lessons)
 */
export function formatLessonsBlock(lessons, { mode = 'full' } = {}) {
  if (!lessons || lessons.length === 0) return '';

  if (mode === 'digest') {
    return formatDigest(lessons);
  }

  const lines = lessons.map((l, i) => {
    const tags = l.tags?.length > 0 ? ` [${l.tags.join(', ')}]` : '';
    const score = typeof l.score === 'number' ? ` (score: ${l.score})` : '';
    return `${i + 1}. ${l.lesson_text}${tags}${score}`;
  });

  let block = `LESSONS (do/don't — from previous evaluations):\n${lines.join('\n')}`;

  // Truncate if too long
  if (block.length > MAX_LESSONS_CHARS) {
    block = block.slice(0, MAX_LESSONS_CHARS) + '\n…[truncated]';
  }

  return block;
}

/**
 * Compact digest: merge lessons into a shorter summary.
 * @param {Object[]} lessons
 * @returns {string}
 */
function formatDigest(lessons) {
  const doItems = [];
  const dontItems = [];

  for (const l of lessons) {
    const text = l.lesson_text || '';
    // Simple heuristic: lessons containing "don't" / "avoid" / "không" go to don't
    if (/\b(don'?t|avoid|không|tránh)\b/i.test(text)) {
      dontItems.push(text);
    } else {
      doItems.push(text);
    }
  }

  const parts = [];
  if (doItems.length > 0) {
    parts.push(`DO: ${doItems.join('; ')}`);
  }
  if (dontItems.length > 0) {
    parts.push(`DON'T: ${dontItems.join('; ')}`);
  }

  let block = `LESSONS DIGEST:\n${parts.join('\n')}`;
  if (block.length > MAX_LESSONS_CHARS) {
    block = block.slice(0, MAX_LESSONS_CHARS) + '\n…[truncated]';
  }

  return block;
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/**
 * Inject lessons into a prompt string.
 *
 * @param {string} promptText - Original prompt
 * @param {Object} [opts]
 * @param {string} [opts.taskKey]
 * @param {string} [opts.promptVersion]
 * @param {number} [opts.topN=5]
 * @param {'full'|'digest'} [opts.mode='full']
 * @param {boolean} [opts.enabled=true] - Master toggle
 * @returns {Promise<{injectedPrompt: string, lessonsCount: number, lessonsBlock: string}>}
 */
export async function injectLessons(promptText, opts = {}) {
  const { taskKey, promptVersion, topN = DEFAULT_TOP_N, mode = 'full', enabled = true } = opts;

  if (!enabled) {
    return { injectedPrompt: promptText, lessonsCount: 0, lessonsBlock: '' };
  }

  const lessons = await getTopLessons({ taskKey, promptVersion, topN });
  if (lessons.length === 0) {
    return { injectedPrompt: promptText, lessonsCount: 0, lessonsBlock: '' };
  }

  const block = formatLessonsBlock(lessons, { mode });
  const injectedPrompt = `${block}\n\n---\n\n${promptText}`;

  logger.info('Lessons injected into prompt', {
    lessonsCount: lessons.length,
    blockLength: block.length,
  });

  return { injectedPrompt, lessonsCount: lessons.length, lessonsBlock: block };
}
