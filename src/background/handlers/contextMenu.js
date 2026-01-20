/**
 * @fileoverview Context Menu Handler
 * Handles right-click context menu interactions for analyzing content
 */

import { createLogger } from '../../logger.js';
import * as ChatGPTSession from '../../chatgptSession.js';
import { STORAGE_KEYS } from '../../constants.js';

const logger = createLogger('ContextMenu');

/**
 * Handle context menu click event
 * @param {chrome.contextMenus.OnClickData} info - Click info
 * @param {chrome.tabs.Tab} tab - Tab where click occurred
 */
export async function handleContextMenuClick(info, tab) {
  if (info.menuItemId !== 'chatgpt-assistant-analyze') {
    return;
  }

  const correlationId = logger.startOperation('contextMenuAnalyze');
  
  try {
    // X51LABS-87: Early validation for content
    if (!info.selectionText?.trim()) {
      logger.warn('No selection text available', { correlationId });
      // Continue to try page extraction
    }
    
    // Get the context menu prompt from storage
    const settings = await chrome.storage.local.get([STORAGE_KEYS.CONTEXT_MENU_PROMPT]);
    let prompt = settings[STORAGE_KEYS.CONTEXT_MENU_PROMPT] || 'Hãy phân tích nội dung sau:\n\n{CONTENT}';

    // Extract content from the page
    let content = '';
    
    // If user selected text, use that
    if (info.selectionText) {
      content = info.selectionText;
      logger.info('Using selected text', { correlationId, length: content.length });
    } else {
      // Otherwise, inject content script to extract page content
      logger.info('Extracting page content', { correlationId, tabId: tab.id });
      
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent,
          args: []
        });
        
        if (results && results[0] && results[0].result) {
          content = results[0].result;
          logger.info('Page content extracted', { correlationId, length: content.length });
        } else {
          logger.warn('No results from executeScript', { correlationId, results });
        }
      } catch (scriptError) {
        logger.error('Failed to execute content extraction script', { 
          correlationId, 
          error: scriptError.message,
          tabId: tab.id 
        });
        // Continue without content extraction
      }
    }

    if (!content || content.trim().length === 0) {
      logger.warn('No content extracted', { correlationId });
      logger.endOperation(correlationId, 'error', { reason: 'no_content' });
      return;
    }

    // Replace {CONTENT} placeholder in prompt
    const finalPrompt = prompt.replace('{CONTENT}', content);
    logger.info('Prompt prepared', { correlationId, promptLength: finalPrompt.length });

    // Ensure ChatGPT tab is ready
    logger.info('Ensuring ChatGPT tab is ready', { correlationId });
    const tabResult = await ChatGPTSession.ensureChatGPTTab({ 
      createIfNeeded: true, 
      focusTab: true 
    });

    if (tabResult.error) {
      logger.error('Failed to ensure ChatGPT tab', { correlationId, error: tabResult.error });
      logger.endOperation(correlationId, 'error');
      return;
    }

    // Send prompt using ChatGPTSession module
    logger.info('Sending prompt to ChatGPT', { correlationId, tabId: tabResult.tabId });
    const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, finalPrompt, {
      createNewChat: true, // Create new chat for each context menu analysis
      reviewOnly: false // Auto send
    });

    if (sendResult.success) {
      logger.info('Prompt sent successfully', { correlationId });
      logger.endOperation(correlationId, 'success');
    } else {
      logger.error('Failed to send prompt', { correlationId, error: sendResult.error });
      logger.endOperation(correlationId, 'error');
    }

  } catch (error) {
    logger.error('Context menu handler error', { 
      correlationId, 
      error: error.message,
      stack: error.stack 
    });
    logger.endOperation(correlationId, 'error', { error });
  }
}

/**
 * Extract content from page (injected into page context)
 * IMPORTANT: This function is serialized and executed in the page context,
 * so it CANNOT reference any external variables or imports
 */
function extractPageContent() {
  // This function runs in PAGE context, not background
  // It has access to document, window, etc.
  
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
    // UI stopwords to filter out (Vietnamese + English)
    const uiStopwords = [
      // Vietnamese
      'thích', 'bình luận', 'chia sẻ', 'xem thêm', 'xem bản dịch', 
      'mua ngay', 'nhắn tin', 'theo dõi', 'đã chỉnh sửa', 'gửi',
      'phản ứng', 'chia sẻ lại', 'viết bình luận', 'xem tất cả',
      'xem thêm bình luận', 'phản hồi', 'trả lời', 'đã chia sẻ với',
      'công khai', 'bạn bè', 'chỉ mình tôi', 'tạo bài viết',
      'bạn đang nghĩ gì', 'bài viết trên', 'bảng feed',
      // English
      'like', 'comment', 'share', 'see more', 'see translation',
      'buy now', 'message', 'follow', 'edited', 'send',
      'react', 'reshare', 'write a comment', 'see all',
      'see more comments', 'reply', 'respond', 'shared with',
      'public', 'friends', 'only me', 'create post',
      "what's on your mind", 'post on', 'news feed'
    ];
    
    // Metadata patterns (reactions, timestamps, etc)
    const metadataPatterns = [
      /^\d+\s*(phút|giờ|ngày|tuần|tháng|năm|min|hour|day|week|month|year)/i, // timestamps
      /^(tất cả|all)\s+(cảm xúc|reactions?):/i,
      /^\d+\s*(bình luận|lượt chia sẻ|comments?|shares?)/i,
      /^\d+[\d,.\s]*(k|m|b|nghìn|triệu|tỷ)?$/i, // counts like "337", "1.2K"
      /^(theo dõi|following?|follow)/i,
      /^(đã chia sẻ|shared)/i,
      /^(công khai|bạn bè|public|friends)/i
    ];
    
    /**
     * Check if text is likely UI/CTA or metadata
     */
    function isUIText(text) {
      const normalized = text.toLowerCase().trim();
      
      // Empty or very short
      if (normalized.length < 3) return true;
      
      // Check metadata patterns first
      for (const pattern of metadataPatterns) {
        if (pattern.test(normalized)) {
          return true;
        }
      }
      
      // Check UI stopwords
      for (const stop of uiStopwords) {
        if (normalized === stop || normalized.startsWith(stop) || normalized.includes(stop)) {
          return true;
        }
      }
      
      // Short text that looks like UI (< 30 chars)
      if (normalized.length < 30) {
        // Contains common UI patterns
        if (/^(xem|see|view|show|hide|more|less|theo|follow|đã)/i.test(normalized)) {
          return true;
        }
      }
      
      return false;
    }
    
    /**
     * Find post container (role="article" or structure-based)
     */
    function findPostContainer() {
      // Priority 1: role="article" (most reliable)
      const articles = document.querySelectorAll('[role="article"]');
      
      // Find the article that's most visible and central
      let bestArticle = null;
      let bestScore = 0;
      
      for (const article of articles) {
        const rect = article.getBoundingClientRect();
        
        // Skip if not visible
        if (rect.width === 0 || rect.height === 0) continue;
        
        // Score based on position (prefer center, top of viewport)
        let score = 0;
        
        // Prefer articles near top of page
        if (rect.top < window.innerHeight) score += 50;
        if (rect.top < 200) score += 30;
        
        // Prefer articles with substantial height (real posts vs tiny elements)
        if (rect.height > 200) score += 20;
        if (rect.height > 400) score += 10;
        
        // Prefer posts with text content
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
    
    /**
     * Extract primary content blocks (main post text)
     */
    function extractPrimaryContent(container) {
      const blocks = [];
      const seenTexts = new Set();
      
      // Strategy: Find text blocks with dir="auto" that are NOT in buttons/links
      const candidates = container.querySelectorAll('[dir="auto"]');
      
      for (const el of candidates) {
        // Skip if inside button, link, or has role=button
        const parent = el.closest('a[role="link"], button, [role="button"], [role="menuitem"]');
        if (parent) continue;
        
        const text = (el.innerText || el.textContent || '').trim();
        
        // Skip empty, too short, or UI text
        if (!text || text.length < 30) continue;
        if (isUIText(text)) continue;
        
        // Skip duplicates
        if (seenTexts.has(text)) continue;
        seenTexts.add(text);
        
        // Calculate position in container
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        
        // Check if this is likely the main content:
        // - Not in first 100px (usually author/time)
        // - Not in last 100px (usually reactions/buttons)
        const containerHeight = containerRect.height;
        const isInMainArea = relativeTop > 100 && relativeTop < (containerHeight - 100);
        
        blocks.push({
          element: el,
          text: text,
          length: text.length,
          relativeTop: relativeTop,
          isInMainArea: isInMainArea
        });
      }
      
      return blocks;
    }
    
    /**
     * Select the primary text block (main post content)
     */
    function selectPrimaryBlock(blocks) {
      if (blocks.length === 0) return null;
      
      // Filter: only consider blocks in main area
      const mainBlocks = blocks.filter(b => b.isInMainArea);
      
      if (mainBlocks.length === 0) {
        // Fallback: take longest block
        blocks.sort((a, b) => b.length - a.length);
        return blocks[0];
      }
      
      // Score each main block
      const scored = mainBlocks.map(block => {
        let score = 0;
        
        // Length is very important
        score += block.length * 3;
        
        // Prefer blocks that appear first (after header)
        const positionScore = Math.max(0, 5000 - block.relativeTop * 2);
        score += positionScore;
        
        // Bonus if significantly longer than average
        const avgLength = mainBlocks.reduce((sum, b) => sum + b.length, 0) / mainBlocks.length;
        if (block.length > avgLength * 1.5) score += 2000;
        
        return { ...block, score };
      });
      
      scored.sort((a, b) => b.score - a.score);
      return scored[0];
    }
    
    /**
     * Extract comments from post
     */
    function extractComments(container) {
      const comments = [];
      const seenComments = new Set();
      
      // Facebook comments are usually in specific structures
      // Look for comment-like patterns
      const commentCandidates = container.querySelectorAll('[dir="auto"]');
      
      for (const el of commentCandidates) {
        const text = (el.innerText || el.textContent || '').trim();
        
        // Skip if too short or already seen
        if (!text || text.length < 20) continue;
        if (seenComments.has(text)) continue;
        if (isUIText(text)) continue;
        
        // Check if this looks like a comment:
        // - Has reasonable length (20-1000 chars)
        // - Not too long (probably main content)
        // - Appears in lower part of container
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        const containerHeight = containerRect.height;
        
        // Comments usually appear in bottom 60% of post
        const isInCommentArea = relativeTop > (containerHeight * 0.4);
        
        if (isInCommentArea && text.length < 1000) {
          seenComments.add(text);
          comments.push(text);
        }
      }
      
      // Limit to first 5 comments to avoid overwhelming
      return comments.slice(0, 5);
    }
    
    // Main Facebook extraction logic
    const postContainer = findPostContainer();
    
    if (!postContainer) {
      return null;
    }
    
    // Extract primary content
    const contentBlocks = extractPrimaryContent(postContainer);
    const primaryBlock = selectPrimaryBlock(contentBlocks);
    
    if (!primaryBlock) {
      return null;
    }
    
    let result = primaryBlock.text;
    
    // Extract and append comments
    const comments = extractComments(postContainer);
    
    if (comments.length > 0) {
      result += '\n\n--- BÌNH LUẬN ---\n\n';
      comments.forEach((comment, index) => {
        result += `[${index + 1}] ${comment}\n\n`;
      });
    }
    
    return result;
  }
  
  /**
   * Generic content extraction for non-Facebook sites
   */
  function extractGenericContent() {
    /**
     * Remove unwanted elements from a cloned container
     */
    function cleanElement(element) {
      const clone = element.cloneNode(true);
      
      // Remove elements that are typically not main content
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
    
    /**
     * Score an element based on content quality indicators
     */
    function scoreElement(element) {
      let score = 0;
      const text = element.textContent || '';
      const textLength = text.trim().length;
      
      // Length score (prefer substantial content)
      if (textLength > 200) score += 10;
      if (textLength > 500) score += 15;
      if (textLength > 1000) score += 20;
      
      // Paragraph density (good articles have many paragraphs)
      const paragraphs = element.querySelectorAll('p');
      score += Math.min(paragraphs.length * 3, 30);
      
      // Penalize if too many links (likely navigation/menu)
      const links = element.querySelectorAll('a');
      const linkDensity = links.length / Math.max(textLength / 100, 1);
      if (linkDensity > 1) score -= 20;
      
      // Bonus for semantic article tags
      if (element.tagName === 'ARTICLE') score += 15;
      if (element.getAttribute('role') === 'article') score += 15;
      if (element.tagName === 'MAIN') score += 10;
      
      // Bonus for common article class names
      const className = element.className || '';
      if (/post|article|entry|content|story|body/i.test(className)) score += 10;
      
      // Bonus for heading hierarchy (well-structured content)
      const headings = element.querySelectorAll('h1, h2, h3');
      if (headings.length > 0 && headings.length < 10) score += 10;
      
      return score;
    }
    
    // Priority selectors for article content (more specific first)
    const prioritySelectors = [
      'article[role="article"]',
      'article.post',
      'article.article',
      'article.entry',
      '.post-content',
      '.article-content', 
      '.entry-content',
      '.post-body',
      '.article-body',
      'article',
      '[role="article"]',
      'main article',
      'main [role="main"]',
      'main.content',
      '.main-content',
      'main',
      '[role="main"]',
      '#content',
      '.content'
    ];

    let bestElement = null;
    let bestScore = 0;
    
    // Try each selector and score the results
    for (const selector of prioritySelectors) {
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        const score = scoreElement(element);
        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      }
      
      // If we found a high-scoring element, stop searching
      if (bestScore > 40) break;
    }
    
    let content = '';
    
    if (bestElement) {
      // Clean the element and extract text
      const cleaned = cleanElement(bestElement);
      content = cleaned.innerText || cleaned.textContent || '';
    }

    // Fallback: if no good content found, use body but clean it
    if (!content || content.trim().length < 100) {
      const cleaned = cleanElement(document.body);
      content = cleaned.innerText || cleaned.textContent || '';
    }
    
    return content;
  }
  
  // Main extraction logic - choose strategy based on site
  let content = '';
  
  if (isFacebook()) {
    // Use Facebook-specific extraction
    const fbContent = extractFacebookPost();
    if (fbContent) {
      content = fbContent;
    } else {
      // Fallback to generic if Facebook extraction fails
      content = extractGenericContent();
    }
  } else {
    // Use generic extraction for other sites
    content = extractGenericContent();
  }
  
  // Clean up whitespace
  content = content
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' ')     // Normalize spaces
    .trim();

  // Limit content length to avoid overwhelming ChatGPT
  const maxLength = 10000;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n\n[... nội dung đã được cắt ngắn ...]';
  }

  return content.trim();
}
