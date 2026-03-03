/**
 * @fileoverview Tests for evalJsonParser module
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md – Phase 0
 */
import { describe, it, expect } from 'vitest';
import { parseEvalResponse, validateEvalJson, buildRetryPrompt } from '../../src/shared/evalJsonParser.js';

const VALID_JSON = {
  score: 72,
  lesson_text: "Don't omit risk disclaimers when analysing stock.",
  tags: ['risk', 'missing_assumptions'],
  issues: ['No mention of market conditions', 'Missing time horizon'],
  strengths: ['Concise analysis', 'Clear recommendation'],
};

const VALID_MARKER_TEXT = `
Some preamble text from the LLM.

<<<EVAL_JSON>>>
${JSON.stringify(VALID_JSON, null, 2)}
<<<END>>>

Some trailing text.
`;

describe('evalJsonParser', () => {
  describe('validateEvalJson', () => {
    it('validates a correct object', () => {
      const result = validateEvalJson(VALID_JSON);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing score', () => {
      const { valid, errors } = validateEvalJson({ ...VALID_JSON, score: undefined });
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('score'))).toBe(true);
    });

    it('rejects score out of range', () => {
      expect(validateEvalJson({ ...VALID_JSON, score: 150 }).valid).toBe(false);
      expect(validateEvalJson({ ...VALID_JSON, score: -5 }).valid).toBe(false);
    });

    it('rejects empty lesson_text', () => {
      const { valid } = validateEvalJson({ ...VALID_JSON, lesson_text: '' });
      expect(valid).toBe(false);
    });

    it('rejects non-array tags', () => {
      const { valid, errors } = validateEvalJson({ ...VALID_JSON, tags: 'notarray' });
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('tags'))).toBe(true);
    });

    it('rejects null input', () => {
      expect(validateEvalJson(null).valid).toBe(false);
      expect(validateEvalJson([]).valid).toBe(false);
    });
  });

  describe('parseEvalResponse', () => {
    it('extracts JSON from marker-delimited text', () => {
      const result = parseEvalResponse(VALID_MARKER_TEXT);
      expect(result.success).toBe(true);
      expect(result.data.score).toBe(72);
      expect(result.data.lesson_text).toContain('risk disclaimers');
      expect(result.data.tags).toContain('risk');
      expect(result.errors).toHaveLength(0);
    });

    it('falls back to first JSON object when no markers', () => {
      const text = `Here is my evaluation: ${JSON.stringify(VALID_JSON)} And some more text.`;
      const result = parseEvalResponse(text);
      expect(result.success).toBe(true);
      expect(result.data.score).toBe(72);
    });

    it('repairs slightly malformed JSON', () => {
      const broken = `<<<EVAL_JSON>>>
{
  "score": 85,
  "lesson_text": "Always check data sources",
  "tags": ["data_quality"],
  "issues": ["Outdated data"],
  "strengths": ["Good structure",]
}
<<<END>>>`;
      const result = parseEvalResponse(broken);
      // jsonrepair should handle trailing comma
      expect(result.success).toBe(true);
      expect(result.data.score).toBe(85);
    });

    it('returns errors for non-JSON text', () => {
      const result = parseEvalResponse('This has no JSON at all.');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns errors for empty input', () => {
      expect(parseEvalResponse('').success).toBe(false);
      expect(parseEvalResponse(null).success).toBe(false);
    });

    it('returns validation errors for valid JSON with bad schema', () => {
      const badSchema = JSON.stringify({ score: 200, lesson_text: '', tags: 'nope', issues: null, strengths: 42 });
      const text = `<<<EVAL_JSON>>>${badSchema}<<<END>>>`;
      const result = parseEvalResponse(text);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('normalises tags to string arrays', () => {
      const json = { ...VALID_JSON, tags: [1, 'risk', null] };
      const text = `<<<EVAL_JSON>>>${JSON.stringify(json)}<<<END>>>`;
      const result = parseEvalResponse(text);
      expect(result.success).toBe(true);
      expect(result.data.tags).toEqual(['1', 'risk', 'null']);
    });

    it('rounds score to integer', () => {
      const json = { ...VALID_JSON, score: 72.6 };
      const text = `<<<EVAL_JSON>>>${JSON.stringify(json)}<<<END>>>`;
      const result = parseEvalResponse(text);
      expect(result.success).toBe(true);
      expect(result.data.score).toBe(73);
    });
  });

  describe('buildRetryPrompt', () => {
    it('includes error messages', () => {
      const prompt = buildRetryPrompt(['score must be 0-100', 'tags must be array']);
      expect(prompt).toContain('score must be 0-100');
      expect(prompt).toContain('tags must be array');
      expect(prompt).toContain('<<<EVAL_JSON>>>');
    });
  });
});
