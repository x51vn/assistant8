/**
 * Prompt cache for context menu analysis prompts.
 */

import { createLogger } from '../../../logger.js';
import { supabase } from '../../../supabaseConfig.js';

const logger = createLogger('ContextMenu');

/** @type {{ prompt: string, timestamp: number } | null} */
let _promptCache = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Default context menu prompt (proper Unicode Vietnamese).
 * Used when Supabase is unavailable or user has no custom prompt.
 */
const DEFAULT_PROMPT = [
  'Ph\u00e2n t\u00edch n\u1ed9i dung sau t\u1eeb trang web:',
  '',
  '{CONTEXT_INFO}',
  '',
  '{CONTENT}',
  '',
  'H\u00e3y cung c\u1ea5p ph\u00e2n t\u00edch to\u00e0n di\u1ec7n:',
  '',
  '**1. T\u00d3M T\u1eaeT CH\u00cdNH**',
  '- N\u1ed9i dung ch\u00ednh c\u1ee7a \u0111o\u1ea1n v\u0103n',
  '- C\u00e1c \u0111i\u1ec3m quan tr\u1ecdng nh\u1ea5t (3-5 \u0111i\u1ec3m)',
  '',
  '**2. PH\u00c2N T\u00cdCH CHI TI\u1ebeT**',
  '- Ng\u1eef c\u1ea3nh v\u00e0 m\u1ee5c \u0111\u00edch c\u1ee7a n\u1ed9i dung',
  '- C\u00e1c th\u00f4ng tin quan tr\u1ecdng',
  '- D\u1eef li\u1ec7u/s\u1ed1 li\u1ec7u \u0111\u00e1ng ch\u00fa \u00fd (n\u1ebfu c\u00f3)',
  '',
  '**3. \u0110\u00c1NH GI\u00c1**',
  '- \u0110\u1ed9 tin c\u1eady c\u1ee7a th\u00f4ng tin',
  '- Xu h\u01b0\u1edbng ho\u1eb7c \u00fd ki\u1ebfn ch\u1ee7 \u0111\u1ea1o',
  '',
  'Tr\u1ea3 l\u1eddi b\u1eb1ng ti\u1ebfng Vi\u1ec7t, r\u00f5 r\u00e0ng v\u00e0 c\u00f3 c\u1ea5u tr\u00fac.'
].join('\n');

/**
 * Get context menu prompt from Supabase with TTL cache.
 * Falls back to hardcoded default on error or when offline.
 * @returns {Promise<string>} The context menu prompt template
 */
export async function getContextMenuPrompt() {
  // Check cache first
  if (_promptCache && (Date.now() - _promptCache.timestamp) < CACHE_TTL_MS) {
    return _promptCache.prompt;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return DEFAULT_PROMPT;
    }

    const { data, error } = await supabase
      .from('prompts')
      .select('content')
      .eq('user_id', user.id)
      .eq('key', 'prompt.contextMenu')
      .single();

    if (error || !data?.content) {
      return DEFAULT_PROMPT;
    }

    // Ensure placeholders exist
    let prompt = data.content;
    if (!prompt.includes('{CONTENT}')) {
      prompt += '\n\n{CONTENT}';
    }
    if (!prompt.includes('{CONTEXT_INFO}')) {
      prompt = prompt.replace('{CONTENT}', '{CONTEXT_INFO}\n\n{CONTENT}');
    }

    // Update cache
    _promptCache = { prompt, timestamp: Date.now() };
    return prompt;
  } catch (error) {
    logger.error('Failed to get context menu prompt from Supabase', { error: error.message });
    // Offline fallback: use stale cache if available
    if (_promptCache) {
      logger.info('Using stale cached prompt (offline fallback)');
      return _promptCache.prompt;
    }
    return DEFAULT_PROMPT;
  }
}

/**
 * Invalidate prompt cache (should be called on login/logout).
 */
export function invalidatePromptCache() {
  _promptCache = null;
  logger.debug('Prompt cache invalidated');
}
