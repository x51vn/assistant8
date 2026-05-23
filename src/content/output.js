/**
 * @fileoverview Content Script — Assistant Output Extraction
 *
 * Reads and waits for ChatGPT assistant messages with
 * web-search noise removal and stability detection.
 *
 * Exports:
 *   getLatestAssistantMessage()       → string | null
 *   getLatestAssistantMessageMeta()   → { text, messageId }
 *   removeSearchNoise(container)      → void (mutates DOM clone)
 *   isGenerating()                    → boolean
 *   waitForStableAssistantResponse(opts) → { status, text }
 */

import { sleep } from '../shared/utils.js';

/**
 * Get the raw text of the last assistant message (no noise removal).
 * @returns {string|null}
 */
function getLatestAssistantMessage() {
  const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (!nodes || nodes.length === 0) return null;
  const last = nodes[nodes.length - 1];
  const text = (last.innerText || last.textContent || '').trim();
  return text || null;
}

/**
 * Remove ChatGPT web-search noise elements from a cloned DOM node.
 * These include: source cards (favicon rows, "+N" badges), citation
 * superscripts, images, external links, and action buttons that pollute innerText.
 * @param {HTMLElement} container — A cloned (non-live) DOM node to mutate.
 */
function removeSearchNoise(container) {
  // 1. Citation superscripts (e.g., [1], [2])
  container.querySelectorAll('sup').forEach(el => el.remove());

  // 2. Images — favicons, avatars, thumbnails shown in source cards
  container.querySelectorAll('img').forEach(el => el.remove());

  // 3. Buttons — copy, like/dislike, "show more" etc.
  container.querySelectorAll('button').forEach(el => el.remove());

  // 4. Known noise class fragments
  container.querySelectorAll(
    '[class*="citation"], [class*="source"], [class*="metadata"], ' +
    '[class*="favicon"], [class*="footnote"], [data-testid*="citation"]'
  ).forEach(el => el.remove());

  // 5. Remove ALL external links (web-search sources)
  container.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') || '';
    const target = link.getAttribute('target') || '';
    const isExternal =
      target === '_blank' ||
      (href.startsWith('http://') || href.startsWith('https://')) && !href.includes('chatgpt.com');

    if (isExternal) {
      link.remove();
    }
  });

  // 6. Source-card parent containers (if any links survived)
  const allLinks = container.querySelectorAll('a');
  allLinks.forEach(link => {
    const parent = link.parentElement;
    if (!parent || parent === container) return;
    const childCount = parent.children.length;
    if (childCount < 2) return;
    const linkCount = parent.querySelectorAll('a').length;
    if (linkCount / childCount >= 0.5) {
      parent.remove();
    }
  });

  // 7. Standalone "+N" badges (e.g., "+2", "+5")
  container.querySelectorAll('span, div').forEach(el => {
    const t = (el.textContent || '').trim();
    if (/^\+\d{1,2}$/.test(t) && el.children.length === 0) {
      el.remove();
    }
  });

  // 8. "Sources" / "Learn more" heading sections
  container.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b').forEach(heading => {
    const text = (heading.textContent || '').trim().toLowerCase();
    if (text === 'sources' || text === 'learn more' || text === 'references') {
      let sibling = heading.nextSibling;
      while (sibling) {
        const next = sibling.nextSibling;
        if (sibling.nodeType === 1) sibling.remove();
        sibling = next;
      }
      heading.remove();
    }
  });
}

/**
 * Get the latest assistant message with noise removal + message ID.
 * @returns {{ text: string|null, messageId: string|null }}
 */
export function getLatestAssistantMessageMeta() {
  const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (!nodes || nodes.length === 0) return { text: null, messageId: null };
  const last = nodes[nodes.length - 1];

  let text = null;

  // Strategy 1: markdown/prose wrapper → clone & strip noise
  const markdownContent = last.querySelector('.markdown, .prose, [class*="markdown"], [class*="prose"]');
  if (markdownContent) {
    const clone = markdownContent.cloneNode(true);
    removeSearchNoise(clone);
    text = (clone.innerText || clone.textContent || '').trim();
  }

  // Strategy 2: clone entire message & strip noise
  if (!text) {
    const clone = last.cloneNode(true);
    removeSearchNoise(clone);
    text = (clone.innerText || clone.textContent || '').trim();
  }

  // Strategy 3: raw innerText fallback
  if (!text) {
    text = (last.innerText || last.textContent || '').trim();
  }

  const messageId = last.getAttribute('data-message-id') || null;
  return { text: text || null, messageId };
}

/**
 * Is ChatGPT currently generating a response?
 * @returns {boolean}
 */
export function isGenerating() {
  const stopByTestId = document.querySelector('button[data-testid="stop-button"]');
  if (stopByTestId) return true;

  const stopByAria = document.querySelector(
    'button[aria-label*="Stop"], button[aria-label*="Dừng"], button[title*="Stop"], button[title*="Dừng"]'
  );
  if (stopByAria) return true;

  return false;
}

/**
 * Wait until the assistant response text stabilises (stops changing)
 * and the generating indicator disappears.
 *
 * @param {{ timeoutMs?: number, stableMs?: number }} options
 * @returns {Promise<{ status: 'ok'|'timeout', text: string|null }>}
 */
export async function waitForStableAssistantResponse({ timeoutMs = 15 * 60 * 1000, stableMs = 1500 } = {}) {
  const start = Date.now();

  let lastText = null;
  let lastChangedAt = Date.now();

  const snapshot = () => {
    const { text } = getLatestAssistantMessageMeta();
    if (text && text !== lastText) {
      lastText = text;
      lastChangedAt = Date.now();
    }
  };

  snapshot();

  const root = document.querySelector('main') || document.body;
  let observer = null;

  try {
    observer = new MutationObserver(() => snapshot());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  } catch (error) {
    console.warn('[Content] MutationObserver setup failed:', error);
  }

  try {
    while (Date.now() - start < timeoutMs) {
      snapshot();
      const stableFor = Date.now() - lastChangedAt;

      if (lastText && stableFor >= stableMs && !isGenerating()) {
        return { status: 'ok', text: lastText };
      }

      await sleep(250);
    }

    return { status: 'timeout', text: lastText };
  } finally {
    if (observer) {
      try {
        observer.disconnect();
      } catch (error) {
        console.warn('[Content] Observer disconnect failed:', error);
      }
    }
  }
}
