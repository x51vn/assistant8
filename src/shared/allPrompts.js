/**
 * ALL PROMPTS - Unified prompt management
 * Contains 12 prompts: 6 system prompts + 6 writing templates
 * All stored in public.prompts table with different prompt_type values
 */

import { DEFAULT_SYSTEM_PROMPTS, getDefaultSystemPromptMetadata } from './systemPrompts.js';
import { DEFAULT_WRITING_TEMPLATES, getDefaultTemplateMetadata } from './writingTemplates.js';

/**
 * All prompt keys (12 total)
 */
export const ALL_PROMPT_KEYS = {
  // System prompts (7)
  MASTER: 'prompt.master',
  PORTFOLIO: 'prompt.portfolio',
  STOCK_EVAL: 'prompt.stockEval',
  TEA_STOCK: 'prompt.teaStock',
  CONTEXT_MENU: 'prompt.contextMenu',
  ENGLISH: 'prompt.english',
  WATCHLIST_ENRICH: 'prompt.watchlistEnrich',

  // Writing templates (6)
  EMAIL: 'writing.email',
  SOCIAL: 'writing.social',
  SUMMARIZE: 'writing.summarize',
  REWRITE: 'writing.rewrite',
  TRANSLATE: 'writing.translate',
  OUTLINE: 'writing.outline'
};

/**
 * Prompt type enum
 */
export const PROMPT_TYPE = {
  SYSTEM: 'system',
  WRITING: 'writing',
  CUSTOM: 'custom'
};

/**
 * Get prompt type from key
 * @param {string} key - Prompt key
 * @returns {string} - Prompt type (system, writing, or custom)
 */
export function getPromptType(key) {
  if (key.startsWith('prompt.')) return PROMPT_TYPE.SYSTEM;
  if (key.startsWith('writing.')) return PROMPT_TYPE.WRITING;
  return PROMPT_TYPE.CUSTOM;
}

/**
 * Get all default prompt content (12 prompts)
 * @returns {Object} - Map of key -> content
 */
export function getAllDefaultPrompts() {
  return {
    ...DEFAULT_SYSTEM_PROMPTS,
    ...DEFAULT_WRITING_TEMPLATES
  };
}

/**
 * Get all prompt metadata (12 prompts)
 * @returns {Array} - Array of metadata objects with prompt_type and is_system
 */
export function getAllPromptMetadata() {
  const systemMeta = getDefaultSystemPromptMetadata();
  const writingMeta = getDefaultTemplateMetadata();

  // Add prompt_type and is_system to all metadata
  const allMeta = [
    ...systemMeta.map(meta => ({
      ...meta,
      prompt_type: PROMPT_TYPE.SYSTEM,
      is_system: true
    })),
    ...writingMeta.map(meta => ({
      ...meta,
      prompt_type: PROMPT_TYPE.WRITING,
      is_system: true,
      category: 'Writing Assistant' // Ensure category is set
    }))
  ];

  return allMeta;
}

/**
 * Get system prompt keys only (6)
 * @returns {Array} - Array of system prompt keys
 */
export function getSystemPromptKeys() {
  return [
    ALL_PROMPT_KEYS.MASTER,
    ALL_PROMPT_KEYS.PORTFOLIO,
    ALL_PROMPT_KEYS.STOCK_EVAL,
    ALL_PROMPT_KEYS.TEA_STOCK,
    ALL_PROMPT_KEYS.CONTEXT_MENU,
    ALL_PROMPT_KEYS.ENGLISH,
    ALL_PROMPT_KEYS.WATCHLIST_ENRICH
  ];
}

/**
 * Get writing template keys only (6)
 * @returns {Array} - Array of writing template keys
 */
export function getWritingTemplateKeys() {
  return [
    ALL_PROMPT_KEYS.EMAIL,
    ALL_PROMPT_KEYS.SOCIAL,
    ALL_PROMPT_KEYS.SUMMARIZE,
    ALL_PROMPT_KEYS.REWRITE,
    ALL_PROMPT_KEYS.TRANSLATE,
    ALL_PROMPT_KEYS.OUTLINE
  ];
}

/**
 * Check if key is a system prompt
 * @param {string} key - Prompt key
 * @returns {boolean}
 */
export function isSystemPrompt(key) {
  return getSystemPromptKeys().includes(key);
}

/**
 * Check if key is a writing template
 * @param {string} key - Prompt key
 * @returns {boolean}
 */
export function isWritingTemplate(key) {
  return getWritingTemplateKeys().includes(key);
}

/**
 * Get metadata for a specific key
 * @param {string} key - Prompt key
 * @returns {Object|null} - Metadata object or null
 */
export function getMetadataByKey(key) {
  const allMeta = getAllPromptMetadata();
  return allMeta.find(meta => meta.key === key) || null;
}
