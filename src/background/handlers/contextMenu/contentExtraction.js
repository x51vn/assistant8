/**
 * Context menu content extraction and prompt context helpers.
 */

import { createLogger } from '../../../logger.js';

const logger = createLogger('ContextMenu');

/**
 * Build context information string from tab and click info.
 * Adds page title, URL, selection info, link/image info.
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @returns {string}
 */
export function buildContextInfo(info, tab) {
  const parts = [];

  if (tab?.title) {
    parts.push(`[Ti\u00eau \u0111\u1ec1 trang: ${tab.title}]`);
  }
  if (tab?.url) {
    parts.push(`[URL: ${tab.url}]`);
  }
  if (info.selectionText) {
    parts.push(`[\u0110o\u1ea1n v\u0103n \u0111\u01b0\u1ee3c ch\u1ecdn: ${info.selectionText.length} k\u00fd t\u1ef1]`);
  }
  if (info.linkUrl) {
    parts.push(`[Link: ${info.linkUrl}]`);
  }
  if (info.srcUrl) {
    parts.push(`[Ngu\u1ed3n media: ${info.srcUrl}]`);
  }
  if (info.mediaType) {
    parts.push(`[Lo\u1ea1i media: ${info.mediaType}]`);
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

/**
 * Truncate content at sentence boundary, not mid-word.
 * Informs user how many characters were removed.
 * @param {string} content - Original content
 * @param {number} maxLength - Max character length
 * @returns {{ text: string, truncated: boolean, originalLength: number }}
 */
export function smartTruncate(content, maxLength = 10000) {
  const originalLength = content.length;

  if (originalLength <= maxLength) {
    return { text: content, truncated: false, originalLength };
  }

  const slice = content.substring(0, maxLength);

  // Find the last sentence-ending punctuation
  const sentenceEnders = /[.!?\u3002\uff01\uff1f]\s/g;
  let lastSentenceEnd = -1;
  let match;

  while ((match = sentenceEnders.exec(slice)) !== null) {
    lastSentenceEnd = match.index + match[0].length;
  }

  // If we found a sentence boundary in the last 30% of the slice, use it
  const threshold = maxLength * 0.7;
  let truncatedText;

  if (lastSentenceEnd > threshold) {
    truncatedText = content.substring(0, lastSentenceEnd).trimEnd();
  } else {
    // Fallback: find last paragraph boundary
    const lastParagraph = slice.lastIndexOf('\n\n');
    if (lastParagraph > threshold) {
      truncatedText = content.substring(0, lastParagraph).trimEnd();
    } else {
      // Final fallback: cut at last space
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace > threshold) {
        truncatedText = content.substring(0, lastSpace).trimEnd();
      } else {
        truncatedText = slice.trimEnd();
      }
    }
  }

  const charsRemoved = originalLength - truncatedText.length;
  truncatedText += `\n\n[... \u0111\u00e3 c\u1eaft ${charsRemoved.toLocaleString()} k\u00fd t\u1ef1 (t\u1ed5ng ${originalLength.toLocaleString()} k\u00fd t\u1ef1) ...]`;

  return { text: truncatedText, truncated: true, originalLength };
}

/**
 * Extract content based on context (selection, link, image, or page).
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @param {string} correlationId
 * @returns {Promise<string>}
 */
export async function extractContent(info, tab, correlationId) {
  // Priority 1: Selected text
  if (info.selectionText?.trim()) {
    logger.info('Using selected text', { correlationId, length: info.selectionText.length });
    return info.selectionText;
  }

  // Priority 2: Link URL (for link context)
  if (info.linkUrl) {
    logger.info('Using link URL as content', { correlationId, linkUrl: info.linkUrl });
    return `Link URL: ${info.linkUrl}\n\nH\u00e3y ph\u00e2n t\u00edch n\u1ed9i dung c\u1ee7a link n\u00e0y v\u00e0 cung c\u1ea5p th\u00f4ng tin chi ti\u1ebft.`;
  }

  // Priority 3: Image URL (for image context)
  if (info.srcUrl) {
    logger.info('Using image URL as content', { correlationId, srcUrl: info.srcUrl });
    return `URL h\u00ecnh \u1ea3nh: ${info.srcUrl}\n\nH\u00e3y m\u00f4 t\u1ea3 v\u00e0 ph\u00e2n t\u00edch h\u00ecnh \u1ea3nh n\u00e0y.`;
  }

  // Priority 4: Page content extraction via injection
  logger.info('Extracting page content', { correlationId, tabId: tab?.id });
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
      args: []
    });

    if (results?.[0]?.result) {
      logger.info('Page content extracted', { correlationId, length: results[0].result.length });
      return results[0].result;
    }

    logger.warn('No results from executeScript', { correlationId });
  } catch (scriptError) {
    logger.error('Failed to execute content extraction script', {
      correlationId,
      error: scriptError.message,
      tabId: tab?.id
    });
  }

  // Priority 5: Fallback - use tab title + URL
  if (tab?.title || tab?.url) {
    return `Trang web: ${tab.title || ''}\nURL: ${tab.url || ''}\n\nKh\u00f4ng th\u1ec3 tr\u00edch xu\u1ea5t n\u1ed9i dung trang. H\u00e3y ph\u00e2n t\u00edch d\u1ef1a tr\u00ean ti\u00eau \u0111\u1ec1 v\u00e0 URL.`;
  }

  return '';
}

/**
 * Extract content from page (injected into page context).
 * IMPORTANT: This function is serialized and executed in the page context,
 * so it CANNOT reference any external variables or imports.
 *
 * Enhanced: Prioritizes article/main, uses meta description fallback,
 * and handles Facebook-specific extraction.
 */
export function extractPageContent() {
  /**
   * Check if we're on Facebook
   */
  function isFacebook() {
    return window.location.hostname.includes('facebook.com');
  }

  /**
   * Facebook-specific content extraction
   */
  function extractFacebookPost() {
    const uiStopwords = [
      'th\u00edch', 'b\u00ecnh lu\u1eadn', 'chia s\u1ebb', 'xem th\u00eam', 'xem b\u1ea3n d\u1ecbch',
      'mua ngay', 'nh\u1eafn tin', 'theo d\u00f5i', '\u0111\u00e3 ch\u1ec9nh s\u1eeda', 'g\u1eedi',
      'ph\u1ea3n \u1ee9ng', 'chia s\u1ebb l\u1ea1i', 'vi\u1ebft b\u00ecnh lu\u1eadn', 'xem t\u1ea5t c\u1ea3',
      'xem th\u00eam b\u00ecnh lu\u1eadn', 'ph\u1ea3n h\u1ed3i', 'tr\u1ea3 l\u1eddi', '\u0111\u00e3 chia s\u1ebb v\u1edbi',
      'c\u00f4ng khai', 'b\u1ea1n b\u00e8', 'ch\u1ec9 m\u00ecnh t\u00f4i', 't\u1ea1o b\u00e0i vi\u1ebft',
      'b\u1ea1n \u0111ang ngh\u0129 g\u00ec', 'b\u00e0i vi\u1ebft tr\u00ean', 'b\u1ea3ng feed',
      'like', 'comment', 'share', 'see more', 'see translation',
      'buy now', 'message', 'follow', 'edited', 'send',
      'react', 'reshare', 'write a comment', 'see all',
      'see more comments', 'reply', 'respond', 'shared with',
      'public', 'friends', 'only me', 'create post',
      "what's on your mind", 'post on', 'news feed'
    ];

    const metadataPatterns = [
      /^\d+\s*(ph\u00fat|gi\u1edd|ng\u00e0y|tu\u1ea7n|th\u00e1ng|n\u0103m|min|hour|day|week|month|year)/i,
      /^(t\u1ea5t c\u1ea3|all)\s+(c\u1ea3m x\u00fac|reactions?):/i,
      /^\d+\s*(b\u00ecnh lu\u1eadn|l\u01b0\u1ee3t chia s\u1ebb|comments?|shares?)/i,
      /^\d+[\d,.\s]*(k|m|b|ngh\u00ecn|tri\u1ec7u|t\u1ef7)?$/i,
      /^(theo d\u00f5i|following?|follow)/i,
      /^(\u0111\u00e3 chia s\u1ebb|shared)/i,
      /^(c\u00f4ng khai|b\u1ea1n b\u00e8|public|friends)/i
    ];

    function isUIText(text) {
      const normalized = text.toLowerCase().trim();
      if (normalized.length < 3) return true;
      for (const pattern of metadataPatterns) {
        if (pattern.test(normalized)) return true;
      }
      for (const stop of uiStopwords) {
        if (normalized === stop || normalized.startsWith(stop) || normalized.includes(stop)) return true;
      }
      if (normalized.length < 30) {
        if (/^(xem|see|view|show|hide|more|less|theo|follow|\u0111\u00e3)/i.test(normalized)) return true;
      }
      return false;
    }

    function findPostContainer() {
      const articles = document.querySelectorAll('[role="article"]');
      let bestArticle = null;
      let bestScore = 0;
      for (const article of articles) {
        const rect = article.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        let score = 0;
        if (rect.top < window.innerHeight) score += 50;
        if (rect.top < 200) score += 30;
        if (rect.height > 200) score += 20;
        if (rect.height > 400) score += 10;
        const textLength = (article.textContent || '').trim().length;
        if (textLength > 100) score += 20;
        if (textLength > 300) score += 15;
        if (score > bestScore) {
          bestScore = score;
          bestArticle = article;
        }
      }
      return bestArticle;
    }

    function extractPrimaryContent(container) {
      const blocks = [];
      const seenTexts = new Set();
      const candidates = container.querySelectorAll('[dir="auto"]');
      for (const el of candidates) {
        const parent = el.closest('a[role="link"], button, [role="button"], [role="menuitem"]');
        if (parent) continue;
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length < 30) continue;
        if (isUIText(text)) continue;
        if (seenTexts.has(text)) continue;
        seenTexts.add(text);
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        const containerHeight = containerRect.height;
        const isInMainArea = relativeTop > 100 && relativeTop < (containerHeight - 100);
        blocks.push({
          element: el, text, length: text.length,
          relativeTop, isInMainArea
        });
      }
      return blocks;
    }

    function selectPrimaryBlock(blocks) {
      if (blocks.length === 0) return null;
      const mainBlocks = blocks.filter(b => b.isInMainArea);
      if (mainBlocks.length === 0) {
        blocks.sort((a, b) => b.length - a.length);
        return blocks[0];
      }
      const scored = mainBlocks.map(block => {
        let score = block.length * 3;
        score += Math.max(0, 5000 - block.relativeTop * 2);
        const avgLength = mainBlocks.reduce((sum, b) => sum + b.length, 0) / mainBlocks.length;
        if (block.length > avgLength * 1.5) score += 2000;
        return { ...block, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0];
    }

    function extractComments(container) {
      const comments = [];
      const seenComments = new Set();
      const commentCandidates = container.querySelectorAll('[dir="auto"]');
      for (const el of commentCandidates) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length < 20) continue;
        if (seenComments.has(text)) continue;
        if (isUIText(text)) continue;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        const containerHeight = containerRect.height;
        if (relativeTop > (containerHeight * 0.4) && text.length < 1000) {
          seenComments.add(text);
          comments.push(text);
        }
      }
      return comments.slice(0, 5);
    }

    const postContainer = findPostContainer();
    if (!postContainer) return null;
    const contentBlocks = extractPrimaryContent(postContainer);
    const primaryBlock = selectPrimaryBlock(contentBlocks);
    if (!primaryBlock) return null;
    let result = primaryBlock.text;
    const comments = extractComments(postContainer);
    if (comments.length > 0) {
      result += '\n\n--- B\u00ccNH LU\u1eacN ---\n\n';
      comments.forEach((comment, index) => {
        result += `[${index + 1}] ${comment}\n\n`;
      });
    }
    return result;
  }

  /**
   * Generic content extraction for non-Facebook sites
   * Enhanced: Prioritizes article/main, meta description fallback
   */
  function extractGenericContent() {
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
        '[aria-hidden="true"]', '[style*="display: none"]', '[style*="display:none"]'
      ];
      unwantedSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
      });
      return clone;
    }

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

    const prioritySelectors = [
      'article[role="article"]',
      'article.post', 'article.article', 'article.entry',
      '.post-content', '.article-content', '.entry-content',
      '.post-body', '.article-body',
      'article', '[role="article"]',
      'main article', 'main [role="main"]',
      'main.content', '.main-content',
      'main', '[role="main"]',
      '#content', '.content'
    ];

    let bestElement = null;
    let bestScore = 0;

    for (const selector of prioritySelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const score = scoreElement(element);
        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      }
      if (bestScore > 40) break;
    }

    let content = '';
    if (bestElement) {
      const cleaned = cleanElement(bestElement);
      content = cleaned.innerText || cleaned.textContent || '';
    }

    // Fallback 1: Use meta description as hint, then try body
    if (!content || content.trim().length < 100) {
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content')
        || document.querySelector('meta[property="og:description"]')?.getAttribute('content');

      const bodyClean = cleanElement(document.body);
      const bodyText = (bodyClean.innerText || bodyClean.textContent || '').trim();

      if (bodyText.length > 200) {
        content = bodyText;
      } else if (metaDesc && metaDesc.trim().length > 50) {
        content = metaDesc;
      } else {
        content = bodyText || metaDesc || '';
      }
    }

    return content;
  }

  // Main extraction logic
  let content = '';

  if (isFacebook()) {
    const fbContent = extractFacebookPost();
    content = fbContent || extractGenericContent();
  } else {
    content = extractGenericContent();
  }

  // Clean up whitespace
  content = content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return content.trim();
}
