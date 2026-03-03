/**
 * @fileoverview Tests for evaluatorPrompt module
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md – Phase 0
 */
import { describe, it, expect } from 'vitest';
import { buildEvaluatorPrompt, getEvaluatorRubric } from '../../src/shared/evaluatorPrompt.js';

describe('evaluatorPrompt', () => {
  const sampleRun = {
    prompt_text: 'Hãy phân tích cổ phiếu VNM trong ngắn hạn.',
    response_text: 'VNM đang trong xu hướng giảm, khuyến nghị bán...',
    prompt_version: 'v2.1',
    task_key: 'stock_analysis',
  };

  describe('buildEvaluatorPrompt', () => {
    it('includes rubric, RUN_DATA delimiters, and markers', () => {
      const prompt = buildEvaluatorPrompt(sampleRun);

      // Rubric section
      expect(prompt).toContain('expert prompt-engineering evaluator');
      expect(prompt).toContain('CRITICAL SAFETY RULE');

      // Delimiters
      expect(prompt).toContain('<<<RUN_DATA>>>');
      expect(prompt).toContain('<<<END_RUN_DATA>>>');

      // Prompt & response content
      expect(prompt).toContain(sampleRun.prompt_text);
      expect(prompt).toContain(sampleRun.response_text);

      // Metadata
      expect(prompt).toContain('Version: v2.1');
      expect(prompt).toContain('Task: stock_analysis');

      // JSON output markers mentioned in rubric
      expect(prompt).toContain('<<<EVAL_JSON>>>');
      expect(prompt).toContain('<<<END>>>');
    });

    it('handles missing optional fields gracefully', () => {
      const minimalRun = { prompt_text: 'hello', response_text: 'world' };
      const prompt = buildEvaluatorPrompt(minimalRun);

      expect(prompt).toContain('hello');
      expect(prompt).toContain('world');
      expect(prompt).not.toContain('Version:');
      expect(prompt).not.toContain('Task:');
    });

    it('truncates long text when maxChars is set', () => {
      const longRun = {
        prompt_text: 'A'.repeat(10000),
        response_text: 'B'.repeat(10000),
      };
      const prompt = buildEvaluatorPrompt(longRun, { maxChars: 2000 });

      // Both should be truncated
      expect(prompt).toContain('…[truncated]');
      // Total run data should be under maxChars + overhead
      const runDataMatch = prompt.match(/<<<RUN_DATA>>>([\s\S]*?)<<<END_RUN_DATA>>>/);
      expect(runDataMatch).toBeTruthy();
    });

    it('redacts PII when redact=true', () => {
      const piiRun = {
        prompt_text: 'Contact me at test@example.com or 0912-345-678',
        response_text: 'Sure, contact@firm.vn and +84 912 345 678',
      };
      const prompt = buildEvaluatorPrompt(piiRun, { redact: true });

      expect(prompt).not.toContain('test@example.com');
      expect(prompt).toContain('[EMAIL]');
      expect(prompt).toContain('[PHONE]');
    });
  });

  describe('getEvaluatorRubric', () => {
    it('returns the rubric string', () => {
      const rubric = getEvaluatorRubric();
      expect(typeof rubric).toBe('string');
      expect(rubric.length).toBeGreaterThan(100);
      expect(rubric).toContain('Evaluation Criteria');
    });
  });
});
