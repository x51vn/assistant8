/**
 * @fileoverview Evaluator JSON Parser
 *
 * Extracts and validates the JSON block from an LLM evaluator response.
 * Supports:
 *   1. Delimited extraction: <<<EVAL_JSON>>> … <<<END>>>
 *   2. Fallback: first valid JSON object in the text
 *   3. jsonrepair for slightly malformed JSON
 *
 * Ref: docs/PROMPT_IMPROVEMENT_PLAN.md – Phase 0
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '../logger.js';

const logger = createLogger('EvalJsonParser');

// ---------------------------------------------------------------------------
// Marker constants
// ---------------------------------------------------------------------------

const MARKER_START = '<<<EVAL_JSON>>>';
const MARKER_END = '<<<END>>>';

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

/**
 * Validate the parsed evaluation object.
 * @param {*} obj
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateEvalJson(obj) {
  const errors = [];

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['Root must be a JSON object'] };
  }

  // score
  if (typeof obj.score !== 'number' || obj.score < 0 || obj.score > 100) {
    errors.push('score must be a number 0-100');
  }

  // lesson_text
  if (typeof obj.lesson_text !== 'string' || obj.lesson_text.trim().length === 0) {
    errors.push('lesson_text must be a non-empty string');
  }

  // tags
  if (!Array.isArray(obj.tags)) {
    errors.push('tags must be an array');
  }

  // issues
  if (!Array.isArray(obj.issues)) {
    errors.push('issues must be an array');
  }

  // strengths
  if (!Array.isArray(obj.strengths)) {
    errors.push('strengths must be an array');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

/**
 * Strategy 1: Extract JSON between <<<EVAL_JSON>>> and <<<END>>> markers.
 * @param {string} text
 * @returns {string|null}
 */
function extractFromMarkers(text) {
  const startIdx = text.indexOf(MARKER_START);
  if (startIdx === -1) return null;

  const jsonStart = startIdx + MARKER_START.length;
  const endIdx = text.indexOf(MARKER_END, jsonStart);
  if (endIdx === -1) return null;

  return text.slice(jsonStart, endIdx).trim();
}

/**
 * Strategy 2: Extract first JSON object `{ … }` from text.
 * @param {string} text
 * @returns {string|null}
 */
function extractFirstJsonObject(text) {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;

  // Find matching closing brace (simple depth tracking)
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(firstBrace, i + 1);
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse evaluator output text and extract validated evaluation JSON.
 *
 * @param {string} rawText - The full LLM response text
 * @returns {{success: boolean, data: Object|null, errors: string[], rawJson: string|null}}
 */
export function parseEvalResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, data: null, errors: ['Input is empty or not a string'], rawJson: null };
  }

  // Try strategy 1: markers
  let jsonStr = extractFromMarkers(rawText);

  // Try strategy 2: first JSON object
  if (!jsonStr) {
    logger.debug('Markers not found, falling back to first JSON object');
    jsonStr = extractFirstJsonObject(rawText);
  }

  if (!jsonStr) {
    return {
      success: false,
      data: null,
      errors: ['Could not find JSON in evaluator output'],
      rawJson: null,
    };
  }

  // Parse JSON (with repair attempt)
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    logger.debug('Direct JSON.parse failed, attempting repair');
    try {
      const repaired = jsonrepair(jsonStr);
      parsed = JSON.parse(repaired);
    } catch (repairErr) {
      return {
        success: false,
        data: null,
        errors: [`JSON parse failed: ${repairErr.message}`],
        rawJson: jsonStr,
      };
    }
  }

  // Validate
  const { valid, errors } = validateEvalJson(parsed);
  if (!valid) {
    return {
      success: false,
      data: parsed,
      errors,
      rawJson: jsonStr,
    };
  }

  // Normalize arrays to string arrays
  parsed.tags = (parsed.tags || []).map(String);
  parsed.issues = (parsed.issues || []).map(String);
  parsed.strengths = (parsed.strengths || []).map(String);
  parsed.score = Math.round(parsed.score);

  return { success: true, data: parsed, errors: [], rawJson: jsonStr };
}

/**
 * Build a retry prompt when the initial evaluation output was not valid JSON.
 * @param {string[]} errors - Validation/parse errors from the first attempt
 * @returns {string}
 */
export function buildRetryPrompt(errors) {
  return `Your previous output was not valid JSON or failed validation.
Errors: ${errors.join('; ')}

Please output ONLY the JSON object between the markers:
<<<EVAL_JSON>>>
{ "score": ..., "lesson_text": "...", "tags": [...], "issues": [...], "strengths": [...] }
<<<END>>>`;
}
