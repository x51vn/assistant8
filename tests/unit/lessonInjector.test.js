/**
 * @fileoverview Tests for lessonInjector module
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md – Phase 3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatLessonsBlock, DEFAULT_TOP_N, MAX_LESSONS_CHARS } from '../../src/shared/lessonInjector.js';

// Mock the DB module since IndexedDB is not available in happy-dom
vi.mock('../../src/shared/promptImprovementDb.js', () => ({
  listLessons: vi.fn().mockResolvedValue([]),
}));

import { listLessons } from '../../src/shared/promptImprovementDb.js';
import { getTopLessons, injectLessons } from '../../src/shared/lessonInjector.js';

const makeLessons = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `lesson-${i}`,
    lesson_text: `Lesson ${i}: Always validate input data.`,
    tags: ['data_quality'],
    score: 80 - i,
    pinned: i === 0,
    excluded: false,
    status: 'active',
  }));

describe('lessonInjector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatLessonsBlock', () => {
    it('returns empty string for no lessons', () => {
      expect(formatLessonsBlock([])).toBe('');
      expect(formatLessonsBlock(null)).toBe('');
    });

    it('formats full mode with numbered list', () => {
      const lessons = makeLessons(3);
      const block = formatLessonsBlock(lessons);

      expect(block).toContain('LESSONS (do/don\'t');
      expect(block).toContain('1. Lesson 0');
      expect(block).toContain('2. Lesson 1');
      expect(block).toContain('3. Lesson 2');
      expect(block).toContain('[data_quality]');
      expect(block).toContain('(score: 80)');
    });

    it('truncates if block exceeds MAX_LESSONS_CHARS', () => {
      const longLessons = Array.from({ length: 50 }, (_, i) => ({
        lesson_text: 'A'.repeat(100) + ` item ${i}`,
        tags: ['tag1', 'tag2'],
        score: 50,
      }));
      const block = formatLessonsBlock(longLessons);
      expect(block.length).toBeLessThanOrEqual(MAX_LESSONS_CHARS + 20); // some slack for truncation marker
      expect(block).toContain('…[truncated]');
    });

    it('formats digest mode with DO/DONT grouping', () => {
      const lessons = [
        { lesson_text: "Always cite sources when making claims.", tags: [], score: 80 },
        { lesson_text: "Don't assume market data is real-time.", tags: [], score: 60 },
        { lesson_text: "Avoid making predictions without disclaimers.", tags: [], score: 70 },
      ];
      const block = formatLessonsBlock(lessons, { mode: 'digest' });

      expect(block).toContain('LESSONS DIGEST:');
      expect(block).toContain('DO:');
      expect(block).toContain("DON'T:");
      expect(block).toContain('cite sources');
      expect(block).toContain('market data');
    });
  });

  describe('getTopLessons', () => {
    it('returns top N lessons with pinned first', async () => {
      const lessons = makeLessons(10);
      // Put pinned at index 5
      lessons.forEach((l, i) => { l.pinned = i === 5; });
      listLessons.mockResolvedValueOnce(lessons);

      const top = await getTopLessons({ topN: 3 });

      expect(top).toHaveLength(3);
      // Pinned should be first
      expect(top[0].pinned).toBe(true);
    });

    it('filters out excluded lessons', async () => {
      const lessons = makeLessons(5);
      lessons[1].excluded = true;
      lessons[2].excluded = true;
      listLessons.mockResolvedValueOnce(lessons);

      const top = await getTopLessons({ topN: 5 });
      expect(top.every(l => !l.excluded)).toBe(true);
      expect(top).toHaveLength(3);
    });

    it('returns empty array on DB error', async () => {
      listLessons.mockRejectedValueOnce(new Error('DB error'));
      const top = await getTopLessons();
      expect(top).toEqual([]);
    });
  });

  describe('injectLessons', () => {
    it('injects lessons block before prompt text', async () => {
      listLessons.mockResolvedValueOnce(makeLessons(3));

      const result = await injectLessons('My analysis prompt');

      expect(result.lessonsCount).toBe(3);
      expect(result.injectedPrompt).toContain('LESSONS');
      expect(result.injectedPrompt).toContain('My analysis prompt');
      // Lessons should come before prompt
      const lessonsPos = result.injectedPrompt.indexOf('LESSONS');
      const promptPos = result.injectedPrompt.indexOf('My analysis prompt');
      expect(lessonsPos).toBeLessThan(promptPos);
    });

    it('returns original prompt when disabled', async () => {
      const result = await injectLessons('My prompt', { enabled: false });
      expect(result.injectedPrompt).toBe('My prompt');
      expect(result.lessonsCount).toBe(0);
    });

    it('returns original prompt when no lessons found', async () => {
      listLessons.mockResolvedValueOnce([]);
      const result = await injectLessons('My prompt');
      expect(result.injectedPrompt).toBe('My prompt');
      expect(result.lessonsCount).toBe(0);
    });
  });
});
