/**
 * @fileoverview IndexedDB stores for Prompt Improvement Loop
 *
 * Two object stores:
 *   - prompt_runs   (TTL 7 days)
 *   - prompt_lessons (TTL configurable, default 90 days)
 *
 * Works in both Service Worker and extension UI (side panel).
 * No external dependencies – thin promise wrapper over native IndexedDB.
 *
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md
 */

import { createLogger } from '../logger.js';

const logger = createLogger('PromptImprovementDb');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'PromptImprovementDB';
const DB_VERSION = 1;

export const STORE_RUNS = 'prompt_runs';
export const STORE_LESSONS = 'prompt_lessons';

/** Default retention for prompt_runs (ms) */
export const RUNS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Default retention for prompt_lessons (ms) */
export const LESSONS_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Hard cap on number of runs stored */
export const MAX_RUNS = 500;

/** Hard cap on number of lessons stored */
export const MAX_LESSONS = 1000;

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let _dbPromise = null;

/**
 * Open (or re-use) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // prompt_runs store
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        const runsStore = db.createObjectStore(STORE_RUNS, { keyPath: 'id' });
        runsStore.createIndex('created_at', 'created_at', { unique: false });
        runsStore.createIndex('retention_expires_at', 'retention_expires_at', { unique: false });
        runsStore.createIndex('task_key', 'task_key', { unique: false });
        runsStore.createIndex('prompt_version', 'prompt_version', { unique: false });
      }

      // prompt_lessons store
      if (!db.objectStoreNames.contains(STORE_LESSONS)) {
        const lessonsStore = db.createObjectStore(STORE_LESSONS, { keyPath: 'id' });
        lessonsStore.createIndex('created_at', 'created_at', { unique: false });
        lessonsStore.createIndex('source_run_id', 'source_run_id', { unique: false });
        lessonsStore.createIndex('task_key', 'task_key', { unique: false });
        lessonsStore.createIndex('prompt_version', 'prompt_version', { unique: false });
        lessonsStore.createIndex('status', 'status', { unique: false });
        lessonsStore.createIndex('score', 'score', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      logger.error('Failed to open IndexedDB', { error: request.error?.message });
      _dbPromise = null;
      reject(request.error);
    };
  });

  return _dbPromise;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/**
 * Run an IndexedDB transaction.
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest|void} callback
 * @returns {Promise<*>}
 */
async function tx(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    // If callback returned an IDBRequest, resolve with its result
    if (result && typeof result.onsuccess !== 'undefined') {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      transaction.oncomplete = () => resolve(undefined);
      transaction.onerror = () => reject(transaction.error);
    }
  });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// prompt_runs CRUD
// ---------------------------------------------------------------------------

/**
 * Save a prompt run.
 * @param {Object} run
 * @param {string} [run.id]
 * @param {string} run.prompt_text
 * @param {string} [run.response_text]
 * @param {string} [run.prompt_version]
 * @param {string} [run.prompt_template]
 * @param {string} [run.page_url]
 * @param {string} [run.task_key]
 * @returns {Promise<Object>} Saved run with generated fields
 */
export async function saveRun(run) {
  const now = Date.now();
  const record = {
    id: run.id || generateId(),
    created_at: run.created_at || now,
    prompt_version: run.prompt_version || null,
    prompt_template: run.prompt_template || null,
    prompt_text: run.prompt_text || '',
    response_text: run.response_text || '',
    page_url: run.page_url || null,
    task_key: run.task_key || null,
    retention_expires_at: (run.created_at || now) + RUNS_TTL_MS,
    evaluated: false,
    pinned: false,
  };

  await tx(STORE_RUNS, 'readwrite', (store) => store.put(record));
  logger.debug('Run saved', { id: record.id });
  return record;
}

/**
 * List runs within the last N days (default 7).
 * @param {Object} [opts]
 * @param {number} [opts.sinceDays=7]
 * @param {string} [opts.taskKey]
 * @returns {Promise<Object[]>}
 */
export async function listRuns({ sinceDays = 7, taskKey = null } = {}) {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_RUNS, 'readonly');
    const store = txn.objectStore(STORE_RUNS);
    const index = store.index('created_at');
    const range = IDBKeyRange.lowerBound(cutoff);
    const results = [];

    const cursor = index.openCursor(range, 'prev'); // newest first
    cursor.onsuccess = (event) => {
      const c = event.target.result;
      if (c) {
        const val = c.value;
        if (!taskKey || val.task_key === taskKey) {
          results.push(val);
        }
        c.continue();
      } else {
        resolve(results);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

/**
 * Get a single run by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getRun(id) {
  const result = await tx(STORE_RUNS, 'readonly', (store) => store.get(id));
  return result || null;
}

/**
 * Delete a run by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteRun(id) {
  await tx(STORE_RUNS, 'readwrite', (store) => store.delete(id));
  logger.debug('Run deleted', { id });
}

/**
 * Mark a run as evaluated.
 * @param {string} id
 * @param {number} score
 * @returns {Promise<void>}
 */
export async function markRunEvaluated(id, score) {
  const run = await getRun(id);
  if (!run) return;
  run.evaluated = true;
  run.eval_score = score;
  await tx(STORE_RUNS, 'readwrite', (store) => store.put(run));
}

/**
 * Toggle pin on a run.
 * @param {string} id
 * @returns {Promise<boolean>} New pinned state
 */
export async function toggleRunPin(id) {
  const run = await getRun(id);
  if (!run) return false;
  run.pinned = !run.pinned;
  await tx(STORE_RUNS, 'readwrite', (store) => store.put(run));
  return run.pinned;
}

// ---------------------------------------------------------------------------
// prompt_lessons CRUD
// ---------------------------------------------------------------------------

/**
 * Save a lesson (from evaluator output).
 * @param {Object} lesson
 * @returns {Promise<Object>} Saved lesson with generated fields
 */
export async function saveLesson(lesson) {
  const now = Date.now();
  const record = {
    id: lesson.id || generateId(),
    created_at: lesson.created_at || now,
    source_run_id: lesson.source_run_id || null,
    prompt_version: lesson.prompt_version || null,
    task_key: lesson.task_key || null,
    score: typeof lesson.score === 'number' ? lesson.score : 0,
    tags: Array.isArray(lesson.tags) ? lesson.tags : [],
    lesson_text: lesson.lesson_text || '',
    issues: Array.isArray(lesson.issues) ? lesson.issues : [],
    strengths: Array.isArray(lesson.strengths) ? lesson.strengths : [],
    status: lesson.status || 'active', // active | archived
    pinned: lesson.pinned || false,
    excluded: lesson.excluded || false,
    retention_expires_at: (lesson.created_at || now) + LESSONS_TTL_MS,
  };

  await tx(STORE_LESSONS, 'readwrite', (store) => store.put(record));
  logger.debug('Lesson saved', { id: record.id, sourceRun: record.source_run_id });
  return record;
}

/**
 * List lessons with optional filters.
 * @param {Object} [opts]
 * @param {string} [opts.taskKey]
 * @param {string} [opts.promptVersion]
 * @param {string} [opts.status] - 'active'|'archived'|null (all)
 * @param {string[]} [opts.tags] - Filter to lessons containing at least one of these tags
 * @param {string} [opts.sort] - 'newest'|'score_asc'|'score_desc' (default: newest)
 * @returns {Promise<Object[]>}
 */
export async function listLessons({ taskKey, promptVersion, status, tags, sort = 'newest' } = {}) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_LESSONS, 'readonly');
    const store = txn.objectStore(STORE_LESSONS);
    const results = [];

    const cursor = store.openCursor();
    cursor.onsuccess = (event) => {
      const c = event.target.result;
      if (c) {
        const val = c.value;
        // Apply filters
        if (taskKey && val.task_key !== taskKey) { c.continue(); return; }
        if (promptVersion && val.prompt_version !== promptVersion) { c.continue(); return; }
        if (status && val.status !== status) { c.continue(); return; }
        if (tags && tags.length > 0) {
          const hasTag = val.tags?.some(t => tags.includes(t));
          if (!hasTag) { c.continue(); return; }
        }
        results.push(val);
        c.continue();
      } else {
        // Sort
        if (sort === 'score_asc') {
          results.sort((a, b) => a.score - b.score);
        } else if (sort === 'score_desc') {
          results.sort((a, b) => b.score - a.score);
        } else {
          results.sort((a, b) => b.created_at - a.created_at);
        }
        resolve(results);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

/**
 * Get a single lesson by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getLesson(id) {
  const result = await tx(STORE_LESSONS, 'readonly', (store) => store.get(id));
  return result || null;
}

/**
 * Update lesson fields (tags, status, pinned, excluded).
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export async function updateLesson(id, updates) {
  const lesson = await getLesson(id);
  if (!lesson) return null;

  const allowedFields = ['tags', 'status', 'pinned', 'excluded', 'lesson_text'];
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      lesson[key] = updates[key];
    }
  }

  await tx(STORE_LESSONS, 'readwrite', (store) => store.put(lesson));
  logger.debug('Lesson updated', { id });
  return lesson;
}

/**
 * Delete a lesson by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteLesson(id) {
  await tx(STORE_LESSONS, 'readwrite', (store) => store.delete(id));
  logger.debug('Lesson deleted', { id });
}

// ---------------------------------------------------------------------------
// Purge (TTL + quota)
// ---------------------------------------------------------------------------

/**
 * Purge expired runs + enforce MAX_RUNS quota.
 * @returns {Promise<{purgedRuns: number}>}
 */
export async function purgeExpiredRuns() {
  const db = await openDb();
  const now = Date.now();
  let purged = 0;

  // 1. Delete expired runs
  await new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_RUNS, 'readwrite');
    const store = txn.objectStore(STORE_RUNS);
    const index = store.index('retention_expires_at');
    const range = IDBKeyRange.upperBound(now);

    const cursor = index.openCursor(range);
    cursor.onsuccess = (event) => {
      const c = event.target.result;
      if (c) {
        // Don't purge pinned runs
        if (!c.value.pinned) {
          c.delete();
          purged++;
        }
        c.continue();
      } else {
        resolve();
      }
    };
    cursor.onerror = () => reject(cursor.error);
    txn.oncomplete = () => resolve();
  });

  // 2. Enforce MAX_RUNS quota (delete oldest non-pinned beyond limit)
  const allRuns = await listRuns({ sinceDays: 365 }); // get all
  if (allRuns.length > MAX_RUNS) {
    const toDelete = allRuns
      .filter(r => !r.pinned)
      .slice(MAX_RUNS); // oldest beyond limit (list is newest-first)
    for (const run of toDelete) {
      await deleteRun(run.id);
      purged++;
    }
  }

  logger.info('Purge completed', { purgedRuns: purged });
  return { purgedRuns: purged };
}

/**
 * Purge expired lessons.
 * @returns {Promise<{purgedLessons: number}>}
 */
export async function purgeExpiredLessons() {
  const db = await openDb();
  const now = Date.now();
  let purged = 0;

  await new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_LESSONS, 'readwrite');
    const store = txn.objectStore(STORE_LESSONS);

    const cursor = store.openCursor();
    cursor.onsuccess = (event) => {
      const c = event.target.result;
      if (c) {
        const val = c.value;
        if (val.retention_expires_at && val.retention_expires_at < now && val.status !== 'active') {
          c.delete();
          purged++;
        }
        c.continue();
      } else {
        resolve();
      }
    };
    cursor.onerror = () => reject(cursor.error);
    txn.oncomplete = () => resolve();
  });

  logger.info('Lessons purge completed', { purgedLessons: purged });
  return { purgedLessons: purged };
}

/**
 * Run full purge cycle (runs + lessons).
 * Called by alarm handler daily + on startup.
 * @returns {Promise<{purgedRuns: number, purgedLessons: number}>}
 */
export async function purgeAll() {
  const runs = await purgeExpiredRuns();
  const lessons = await purgeExpiredLessons();
  return { ...runs, ...lessons };
}

// ---------------------------------------------------------------------------
// Stats (for Daily Review card)
// ---------------------------------------------------------------------------

/**
 * Get daily review stats.
 * @returns {Promise<{todayRuns: number, evaluatedToday: number, totalLessons: number, activeLessons: number}>}
 */
export async function getDailyStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCutoff = todayStart.getTime();

  const runs = await listRuns({ sinceDays: 1 });
  const todayRuns = runs.filter(r => r.created_at >= todayCutoff);
  const evaluatedToday = todayRuns.filter(r => r.evaluated);
  const lessons = await listLessons({ status: 'active' });

  return {
    todayRuns: todayRuns.length,
    evaluatedToday: evaluatedToday.length,
    totalLessons: (await listLessons()).length,
    activeLessons: lessons.length,
  };
}
