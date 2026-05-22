/**
 * @fileoverview Page Content Service — Open URLs and extract article content
 * Ticket: Agentic Web Research — Phase 1
 *
 * Opens a URL in a background tab, injects an article content extractor,
 * retrieves the main text, and closes the tab.
 *
 * Reuses the generic extraction pattern from contextMenu.js but adapted
 * for batch/sequential URL processing.
 *
 * Stateless — MV3-safe. Each call is independent.
 */

import { createLogger } from '../../../logger.js';

const logger = createLogger('PageContentService');

// ===== CONSTANTS =====

const DEFAULT_PAGE_TIMEOUT_MS = 15_000;
const MAX_CONTENT_LENGTH = 15_000;
const MIN_USEFUL_CONTENT_LENGTH = 100;

// ===== PUBLIC API =====

/**
 * Open a single URL, extract its main content, and close the tab.
 *
 * @param {string} url - URL to open
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=15000] - Timeout for page load
 * @param {number} [options.maxContentLength=15000] - Max chars to return
 * @param {string} [options.correlationId]
 * @returns {Promise<PageContent>}
 *
 * @typedef {Object} PageContent
 * @property {boolean} success
 * @property {string} url - The URL that was opened
 * @property {string} title - Page title
 * @property {string} content - Extracted main content text
 * @property {string} metaDescription - Meta description if available
 * @property {string|null} publishedTime - ISO date if found
 * @property {number} contentLength - Length of extracted content
 * @property {string} [error] - Error message if failed
 */
export async function extractPageContent(url, options = {}) {
  const {
    timeoutMs = DEFAULT_PAGE_TIMEOUT_MS,
    maxContentLength = MAX_CONTENT_LENGTH,
    correlationId = '',
  } = options;

  let tabId = null;

  try {
    // Create background tab
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    logger.info('Page tab created', { tabId, url, correlationId });

    // Wait for page to load
    await waitForTabLoad(tabId, timeoutMs);
    await sleep(300); // Brief settle time

    // Inject extraction script
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractContentFromDOM,
    });

    const extracted = results?.[0]?.result;

    if (!extracted || !extracted.content || extracted.content.length < MIN_USEFUL_CONTENT_LENGTH) {
      logger.warn('Insufficient content from page', { url, contentLength: extracted?.content?.length || 0, correlationId });
      return {
        success: false,
        url,
        title: extracted?.title || '',
        content: '',
        metaDescription: extracted?.metaDescription || '',
        publishedTime: null,
        contentLength: 0,
        error: 'insufficient_content',
      };
    }

    // Truncate if needed
    let content = extracted.content;
    if (content.length > maxContentLength) {
      content = truncateAtBoundary(content, maxContentLength);
    }

    logger.info('Page content extracted', { url, contentLength: content.length, correlationId });

    return {
      success: true,
      url,
      title: extracted.title || '',
      content,
      metaDescription: extracted.metaDescription || '',
      publishedTime: extracted.publishedTime || null,
      contentLength: content.length,
    };
  } catch (err) {
    logger.warn('Page extraction failed', { url, error: err.message, correlationId });
    return {
      success: false,
      url,
      title: '',
      content: '',
      metaDescription: '',
      publishedTime: null,
      contentLength: 0,
      error: err.message,
    };
  } finally {
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Tab may already be closed
      }
    }
  }
}

/**
 * Open multiple URLs sequentially and extract content from each.
 * Sequential strategy avoids tab explosion in MV3 environment.
 *
 * @param {Array<{url: string, title?: string}>} urls - URLs to process
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=15000] - Per-page timeout
 * @param {number} [options.maxContentLength=15000]
 * @param {string} [options.correlationId]
 * @param {Function} [options.onPageDone] - Callback after each page: (result, index) => void
 * @returns {Promise<PageContent[]>}
 */
export async function extractPagesSequentially(urls, options = {}) {
  const { onPageDone, correlationId = '' } = options;
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const urlEntry = urls[i];
    const result = await extractPageContent(urlEntry.url, {
      ...options,
      correlationId: `${correlationId}-page${i}`,
    });

    results.push(result);

    if (typeof onPageDone === 'function') {
      onPageDone(result, i);
    }
  }

  return results;
}

// ===== TAB HELPERS =====

function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const cleanup = () => {
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
    };

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete' && !resolved) {
        cleanup();
        resolve();
      }
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error(`Page did not load within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(listener);

    // Check if already loaded
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete' && !resolved) {
        cleanup();
        resolve();
      }
    }).catch(err => {
      if (!resolved) {
        cleanup();
        reject(err);
      }
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function truncateAtBoundary(text, maxLength) {
  if (text.length <= maxLength) return text;

  const slice = text.substring(0, maxLength);
  // Find last sentence boundary
  const lastPeriod = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('.\n'),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );

  if (lastPeriod > maxLength * 0.7) {
    return slice.substring(0, lastPeriod + 1);
  }

  // Fallback: last paragraph
  const lastNewline = slice.lastIndexOf('\n\n');
  if (lastNewline > maxLength * 0.7) {
    return slice.substring(0, lastNewline);
  }

  return slice;
}

// ===== DOM EXTRACTION (injected into page context) =====

/**
 * Injected into the target page via chrome.scripting.executeScript.
 * CANNOT reference external variables or imports.
 *
 * Returns: { title, content, metaDescription, publishedTime }
 */
function extractContentFromDOM() {
  // --- Clean element by removing nav/ad/noise ---
  function cleanElement(element) {
    const clone = element.cloneNode(true);
    const unwantedSelectors = [
      'nav', 'header', 'footer', 'aside',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      '.nav', '.navigation', '.menu', '.sidebar', '.side-bar',
      '.header', '.footer', '.ad', '.ads', '.advertisement',
      '.social', '.share', '.sharing', '.related', '.recommended',
      '.comments', '.comment-section', '.replies',
      'script', 'style', 'noscript', 'iframe',
      '.cookie', '.popup', '.modal', '.overlay',
      '[aria-hidden="true"]', '[style*="display: none"]', '[style*="display:none"]',
    ];
    unwantedSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });
    return clone;
  }

  // --- Score a candidate content element ---
  function scoreElement(element) {
    let score = 0;
    const text = element.textContent || '';
    const textLength = text.trim().length;

    if (textLength > 200) score += 10;
    if (textLength > 500) score += 15;
    if (textLength > 1000) score += 20;

    const paragraphs = element.querySelectorAll('p');
    score += Math.min(paragraphs.length * 3, 30);

    const links = element.querySelectorAll('a');
    const linkDensity = links.length / Math.max(textLength / 100, 1);
    if (linkDensity > 1) score -= 20;

    if (element.tagName === 'ARTICLE') score += 15;
    if (element.getAttribute('role') === 'article') score += 15;
    if (element.tagName === 'MAIN') score += 10;

    const className = element.className || '';
    if (/post|article|entry|content|story|body/i.test(className)) score += 10;

    const headings = element.querySelectorAll('h1, h2, h3');
    if (headings.length > 0 && headings.length < 10) score += 10;

    return score;
  }

  // --- Find best content element ---
  const prioritySelectors = [
    'article[role="article"]',
    'article.post', 'article.article', 'article.entry',
    '.post-content', '.article-content', '.entry-content',
    '.post-body', '.article-body',
    'article', '[role="article"]',
    'main article', 'main [role="main"]',
    'main.content', '.main-content',
    'main', '[role="main"]',
    '#content', '.content',
  ];

  let bestElement = null;
  let bestScore = 0;

  for (const selector of prioritySelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const score = scoreElement(element);
        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      }
      if (bestScore > 40) break;
    } catch { /* skip */ }
  }

  let content = '';
  if (bestElement) {
    const cleaned = cleanElement(bestElement);
    content = (cleaned.innerText || cleaned.textContent || '').trim();
  }

  // Fallback: body text
  if (!content || content.length < 100) {
    const bodyClean = cleanElement(document.body);
    content = (bodyClean.innerText || bodyClean.textContent || '').trim();
  }

  // Clean up whitespace
  content = content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // --- Extract metadata ---
  const title = document.title || '';

  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

  // Try to find published time
  let publishedTime = null;
  const timeEl = document.querySelector('time[datetime]');
  if (timeEl) {
    publishedTime = timeEl.getAttribute('datetime');
  } else {
    const metaTime =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      document.querySelector('meta[name="publish-date"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:article:published_time"]')?.getAttribute('content');
    if (metaTime) publishedTime = metaTime;
  }

  // --- Extract table-like text blocks ---
  let tableBlocks = '';
  const tables = document.querySelectorAll('table');
  if (tables.length > 0 && tables.length <= 5) {
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length > 1 && rows.length <= 30) {
        const tableText = Array.from(rows).map(row => {
          const cells = row.querySelectorAll('td, th');
          return Array.from(cells).map(c => (c.textContent || '').trim()).join(' | ');
        }).join('\n');
        if (tableText.length > 20 && tableText.length < 3000) {
          tableBlocks += '\n\n[TABLE]\n' + tableText + '\n[/TABLE]';
        }
      }
    }
  }

  if (tableBlocks) {
    content += tableBlocks;
  }

  return {
    title,
    content,
    metaDescription,
    publishedTime,
  };
}
