/**
 * @fileoverview Content Script — Shared Utilities
 *
 * Pure helper functions used across all content script modules.
 * No DOM dependencies beyond `location` — safe to import anywhere.
 */

/**
 * Sleep for a given duration.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract chat metadata from the current page URL.
 * ChatGPT URLs follow the pattern: https://chatgpt.com/c/{chatId}
 *
 * @returns {{ chatUrl: string, chatId: string|null }}
 */
export function getChatMeta() {
  const chatUrl = location.href;
  const path = location.pathname || '';
  const match = path.match(/\/c\/([^/?#]+)/);
  const chatId = match ? match[1] : null;

  console.log('🔍 [Content] getChatMeta:', {
    chatUrl,
    pathname: path,
    chatId,
    hasMatch: !!match
  });

  return { chatUrl, chatId };
}

/**
 * Truncate text to a maximum character count.
 * Returns null for non-string or empty input.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string|null}
 */
export function truncateText(text, maxChars) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
}
