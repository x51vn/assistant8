/**
 * @fileoverview Context Menu Handler (Enhanced)
 *
 * Features:
 * - Submenu with 6 analysis modes (summarize, analyze, key-points, translate, rewrite, custom)
 * - Contexts: selection, page, link, image
 * - Prompt caching with TTL (5 min) from Supabase
 * - Smart truncation by sentence boundary (max 10k chars)
 * - Visual feedback via badge text
 * - Source labels in chat history (source, pageTitle, pageUrl, selectionLength)
 * - "Analyze in side panel" option (avoids opening new tab)
 * - "Continue current chat" option (vs. always creating new chat)
 * - Enhanced prompt with context (title, url, selection info)
 * - Improved content extraction (prioritize article/main, meta description fallback)
 * - Vietnamese encoding fixed (proper Unicode)
 */

import { createLogger } from '../../logger.js';
import * as ChatGPTSession from '../../chatgptSession.js';
import { supabase } from '../../supabaseConfig.js';
import { persistPromptSafe } from './_persistPromptHelper.js';

const logger = createLogger('ContextMenu');

// ========== CONSTANTS ==========

/**
 * Menu item IDs.
 * Parent menu is the root; children are analysis modes + options.
 */
export const MENU_IDS = {
  PARENT: 'chatgpt-assistant',
  // Analysis modes
  SUMMARIZE: 'chatgpt-assistant-summarize',
  ANALYZE: 'chatgpt-assistant-analyze',
  KEY_POINTS: 'chatgpt-assistant-keypoints',
  TRANSLATE: 'chatgpt-assistant-translate',
  REWRITE: 'chatgpt-assistant-rewrite',
  CUSTOM: 'chatgpt-assistant-custom',
  // Separator
  SEP_OPTIONS: 'chatgpt-assistant-sep-options',
  // Options (checkbox toggles)
  SIDE_PANEL: 'chatgpt-assistant-sidepanel',
  CONTINUE_CHAT: 'chatgpt-assistant-continue'
};

/**
 * Analysis mode configurations.
 * Each mode has a label (Vietnamese), a prompt template with {CONTENT}/{CONTEXT_INFO}
 * placeholders, and optionally a Supabase prompt key override.
 */
const ANALYSIS_MODES = {
  [MENU_IDS.SUMMARIZE]: {
    label: 'T\u00f3m t\u1eaft nhanh',
    promptTemplate: 'H\u00e3y t\u00f3m t\u1eaft ng\u1eafn g\u1ecdn n\u1ed9i dung sau trong 3-5 c\u00e2u ch\u00ednh:\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\ud83d\udcdd'
  },
  [MENU_IDS.ANALYZE]: {
    label: 'Ph\u00e2n t\u00edch chi ti\u1ebft',
    promptTemplate: null, // Uses Supabase prompt.contextMenu or default
    supabaseKey: 'prompt.contextMenu',
    icon: '\ud83d\udd0d'
  },
  [MENU_IDS.KEY_POINTS]: {
    label: 'Tr\u00edch xu\u1ea5t \u00fd ch\u00ednh',
    promptTemplate: 'H\u00e3y tr\u00edch xu\u1ea5t c\u00e1c \u00fd ch\u00ednh t\u1eeb n\u1ed9i dung sau d\u01b0\u1edbi d\u1ea1ng danh s\u00e1ch g\u1ea1ch \u0111\u1ea7u d\u00f2ng. M\u1ed7i \u00fd ch\u00ednh g\u1ed3m ti\u00eau \u0111\u1ec1 ng\u1eafn v\u00e0 gi\u1ea3i th\u00edch 1-2 c\u00e2u:\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\ud83d\udccb'
  },
  [MENU_IDS.TRANSLATE]: {
    label: 'D\u1ecbch sang Vi\u1ec7t/English',
    promptTemplate: 'D\u1ecbch n\u1ed9i dung sau. N\u1ebfu n\u1ed9i dung l\u00e0 ti\u1ebfng Vi\u1ec7t, d\u1ecbch sang ti\u1ebfng Anh. N\u1ebfu l\u00e0 ti\u1ebfng Anh ho\u1eb7c ng\u00f4n ng\u1eef kh\u00e1c, d\u1ecbch sang ti\u1ebfng Vi\u1ec7t. Gi\u1eef nguy\u00ean \u0111\u1ecbnh d\u1ea1ng v\u00e0 \u00fd ngh\u0129a g\u1ed1c.\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\ud83c\udf10'
  },
  [MENU_IDS.REWRITE]: {
    label: 'Vi\u1ebft l\u1ea1i ng\u1eafn g\u1ecdn',
    promptTemplate: 'H\u00e3y vi\u1ebft l\u1ea1i n\u1ed9i dung sau m\u1ed9t c\u00e1ch ng\u1eafn g\u1ecdn, r\u00f5 r\u00e0ng v\u00e0 d\u1ec5 hi\u1ec3u h\u01a1n. Gi\u1eef nguy\u00ean c\u00e1c th\u00f4ng tin quan tr\u1ecdng v\u00e0 c\u1ea5u tr\u00fac logic:\n\n{CONTEXT_INFO}\n\n{CONTENT}',
    icon: '\u270f\ufe0f'
  },
  [MENU_IDS.CUSTOM]: {
    label: 'Ph\u00e2n t\u00edch (t\u00f9y ch\u1ec9nh)',
    promptTemplate: null, // Uses Supabase prompt.contextMenu
    supabaseKey: 'prompt.contextMenu',
    icon: '\u2699\ufe0f'
  }
};

// ========== PROMPT CACHE ==========

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
async function getContextMenuPrompt() {
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

// ========== VISUAL FEEDBACK ==========

/**
 * Set badge text on extension icon (brief visual feedback).
 * @param {string} text - Short badge text (max 4 chars)
 * @param {string} color - Badge background color
 * @param {number} [clearAfterMs=3000] - Clear badge after ms (0 = permanent)
 */
async function setBadgeFeedback(text, color, clearAfterMs = 3000) {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    if (clearAfterMs > 0) {
      setTimeout(async () => {
        try {
          await chrome.action.setBadgeText({ text: '' });
        } catch { /* SW may have terminated */ }
      }, clearAfterMs);
    }
  } catch (err) {
    logger.debug('Badge feedback failed (non-critical)', { error: err.message });
  }
}

// ========== CONTEXT INFO BUILDER ==========

/**
 * Build context information string from tab and click info.
 * Adds page title, URL, selection info, link/image info.
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @returns {string}
 */
function buildContextInfo(info, tab) {
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

// ========== SMART TRUNCATION ==========

/**
 * Truncate content at sentence boundary, not mid-word.
 * Informs user how many characters were removed.
 * @param {string} content - Original content
 * @param {number} maxLength - Max character length
 * @returns {{ text: string, truncated: boolean, originalLength: number }}
 */
function smartTruncate(content, maxLength = 10000) {
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

// ========== MENU CREATION ==========

/**
 * Create context menus with parent + submenu structure.
 * Idempotent - safe to call multiple times.
 * Called from index.js onInstall/onUpdate/onStartup.
 */
export async function createContextMenus() {
  try {
    // Remove all existing menus first
    await chrome.contextMenus.removeAll();

    // Read user preferences for checkbox states
    const prefs = await getUserPreferences();

    // Parent menu
    chrome.contextMenus.create({
      id: MENU_IDS.PARENT,
      title: 'ChatGPT Assistant',
      contexts: ['selection', 'page', 'link', 'image']
    });

    // Analysis mode sub-items
    chrome.contextMenus.create({
      id: MENU_IDS.SUMMARIZE,
      parentId: MENU_IDS.PARENT,
      title: '\ud83d\udcdd T\u00f3m t\u1eaft nhanh',
      contexts: ['selection', 'page', 'link', 'image']
    });

    chrome.contextMenus.create({
      id: MENU_IDS.ANALYZE,
      parentId: MENU_IDS.PARENT,
      title: '\ud83d\udd0d Ph\u00e2n t\u00edch chi ti\u1ebft',
      contexts: ['selection', 'page', 'link', 'image']
    });

    chrome.contextMenus.create({
      id: MENU_IDS.KEY_POINTS,
      parentId: MENU_IDS.PARENT,
      title: '\ud83d\udccb Tr\u00edch xu\u1ea5t \u00fd ch\u00ednh',
      contexts: ['selection', 'page', 'link', 'image']
    });

    chrome.contextMenus.create({
      id: MENU_IDS.TRANSLATE,
      parentId: MENU_IDS.PARENT,
      title: '\ud83c\udf10 D\u1ecbch sang Vi\u1ec7t/English',
      contexts: ['selection', 'page', 'link', 'image']
    });

    chrome.contextMenus.create({
      id: MENU_IDS.REWRITE,
      parentId: MENU_IDS.PARENT,
      title: '\u270f\ufe0f Vi\u1ebft l\u1ea1i ng\u1eafn g\u1ecdn',
      contexts: ['selection', 'page', 'link', 'image']
    });

    chrome.contextMenus.create({
      id: MENU_IDS.CUSTOM,
      parentId: MENU_IDS.PARENT,
      title: '\u2699\ufe0f Ph\u00e2n t\u00edch (t\u00f9y ch\u1ec9nh)',
      contexts: ['selection', 'page', 'link', 'image']
    });

    // Separator
    chrome.contextMenus.create({
      id: MENU_IDS.SEP_OPTIONS,
      parentId: MENU_IDS.PARENT,
      type: 'separator',
      contexts: ['selection', 'page', 'link', 'image']
    });

    // Option: Analyze in side panel
    chrome.contextMenus.create({
      id: MENU_IDS.SIDE_PANEL,
      parentId: MENU_IDS.PARENT,
      title: 'Ph\u00e2n t\u00edch trong Side Panel',
      type: 'checkbox',
      checked: prefs.useSidePanel,
      contexts: ['selection', 'page', 'link', 'image']
    });

    // Option: Continue current chat
    chrome.contextMenus.create({
      id: MENU_IDS.CONTINUE_CHAT,
      parentId: MENU_IDS.PARENT,
      title: 'Ti\u1ebfp t\u1ee5c chat hi\u1ec7n t\u1ea1i',
      type: 'checkbox',
      checked: prefs.continueChat,
      contexts: ['selection', 'page', 'link', 'image']
    });

    logger.info('Context menus created (parent + 6 modes + 2 options)');
  } catch (error) {
    logger.debug('Context menu creation note', { error: error?.message });
  }
}

// ========== MAIN HANDLER ==========

/**
 * Handle context menu click event.
 * Routes to appropriate analysis mode or option toggle.
 * @param {chrome.contextMenus.OnClickData} info - Click info
 * @param {chrome.tabs.Tab} tab - Tab where click occurred
 */
export async function handleContextMenuClick(info, tab) {
  const menuItemId = info.menuItemId;

  // Ignore clicks on parent menu
  if (menuItemId === MENU_IDS.PARENT) return;

  // Check if it's one of our menu items
  const isOurMenu = Object.values(MENU_IDS).includes(menuItemId);
  if (!isOurMenu) return;

  // Handle option toggles (checkbox items)
  if (menuItemId === MENU_IDS.SIDE_PANEL || menuItemId === MENU_IDS.CONTINUE_CHAT) {
    await handleOptionToggle(menuItemId, info);
    return;
  }

  // Ignore separator clicks
  if (menuItemId === MENU_IDS.SEP_OPTIONS) return;

  const correlationId = logger.startOperation('contextMenuAnalyze');
  const modeConfig = ANALYSIS_MODES[menuItemId];

  if (!modeConfig) {
    logger.warn('Unknown menu item', { menuItemId, correlationId });
    return;
  }

  logger.info('Context menu action', {
    correlationId,
    mode: menuItemId,
    modeLabel: modeConfig.label,
    hasSelection: !!info.selectionText,
    hasLink: !!info.linkUrl,
    hasSrcUrl: !!info.srcUrl,
    tabUrl: tab?.url
  });

  // Visual feedback: "working" badge
  await setBadgeFeedback('...', '#2196F3', 0);

  try {
    // 1. Extract content
    let content = await extractContent(info, tab, correlationId);

    if (!content || content.trim().length === 0) {
      logger.warn('No content extracted', { correlationId });
      await setBadgeFeedback('!', '#FF5722', 3000);
      logger.endOperation(correlationId, 'error', { reason: 'no_content' });
      return;
    }

    // 2. Smart truncation
    const truncation = smartTruncate(content);
    content = truncation.text;
    if (truncation.truncated) {
      logger.info('Content truncated', {
        correlationId,
        originalLength: truncation.originalLength,
        truncatedLength: content.length
      });
    }

    // 3. Build context info
    const contextInfo = buildContextInfo(info, tab);

    // 4. Get prompt template for this mode
    let promptTemplate;
    if (modeConfig.promptTemplate) {
      promptTemplate = modeConfig.promptTemplate;
    } else {
      // Use Supabase prompt (with cache)
      promptTemplate = await getContextMenuPrompt();
    }

    // 5. Replace placeholders
    const finalPrompt = promptTemplate
      .replace('{CONTEXT_INFO}', contextInfo)
      .replace('{CONTENT}', content);

    logger.info('Prompt prepared', {
      correlationId,
      promptLength: finalPrompt.length,
      mode: modeConfig.label
    });

    // 6. Read user preferences
    const prefs = await getUserPreferences();

    // 7. Send to ChatGPT or Side Panel
    if (prefs.useSidePanel) {
      await sendToSidePanel(finalPrompt, modeConfig, info, tab, correlationId, truncation);
    } else {
      await sendToChatGPT(finalPrompt, modeConfig, prefs, info, tab, correlationId, truncation);
    }

    // 8. Success feedback
    await setBadgeFeedback('\u2714', '#4CAF50', 3000);

  } catch (error) {
    logger.error('Context menu handler error', {
      correlationId,
      error: error.message,
      stack: error.stack
    });
    await setBadgeFeedback('\u2716', '#F44336', 3000);
    logger.endOperation(correlationId, 'error', { error });
  }
}

// ========== OPTION TOGGLES ==========

/**
 * Handle toggling of side panel / continue chat options.
 * Chrome checkbox menus auto-toggle checked state; we persist to storage.
 * @param {string} menuItemId
 * @param {chrome.contextMenus.OnClickData} info
 */
async function handleOptionToggle(menuItemId, info) {
  const prefs = await getUserPreferences();

  if (menuItemId === MENU_IDS.SIDE_PANEL) {
    // info.checked reflects the NEW state after Chrome auto-toggles
    prefs.useSidePanel = !!info.checked;
  } else if (menuItemId === MENU_IDS.CONTINUE_CHAT) {
    prefs.continueChat = !!info.checked;
  }

  await chrome.storage.local.set({ 'x51labs_context_menu_prefs': prefs });

  logger.info('Context menu preference toggled', {
    menuItemId,
    useSidePanel: prefs.useSidePanel,
    continueChat: prefs.continueChat
  });
}

/**
 * Get user preferences for context menu behavior.
 * @returns {Promise<{ useSidePanel: boolean, continueChat: boolean }>}
 */
async function getUserPreferences() {
  try {
    const result = await chrome.storage.local.get('x51labs_context_menu_prefs');
    return result['x51labs_context_menu_prefs'] || {
      useSidePanel: false,
      continueChat: false
    };
  } catch {
    return { useSidePanel: false, continueChat: false };
  }
}

// ========== CONTENT EXTRACTION ==========

/**
 * Extract content based on context (selection, link, image, or page).
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @param {string} correlationId
 * @returns {Promise<string>}
 */
async function extractContent(info, tab, correlationId) {
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

// ========== SEND FUNCTIONS ==========

/**
 * Send prompt to ChatGPT tab.
 * @param {string} finalPrompt
 * @param {Object} modeConfig
 * @param {{ useSidePanel: boolean, continueChat: boolean }} prefs
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @param {string} correlationId
 * @param {{ truncated: boolean, originalLength: number }} truncation
 */
async function sendToChatGPT(finalPrompt, modeConfig, prefs, info, tab, correlationId, truncation) {
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

  const createNewChat = !prefs.continueChat;
  logger.info('Sending prompt to ChatGPT', {
    correlationId,
    tabId: tabResult.tabId,
    createNewChat,
    mode: modeConfig.label
  });

  const sendResult = await ChatGPTSession.sendInput(tabResult.tabId, finalPrompt, {
    createNewChat,
    runId: correlationId,
    reviewOnly: false
  });

  const chatId = sendResult.data?.chatId || null;
  const chatUrl = sendResult.data?.chatUrl || null;

  if (sendResult.success) {
    logger.info('Prompt sent successfully', { correlationId });

    // Persist to chat history with enhanced source labels
    await persistPromptSafe(correlationId, finalPrompt, chatId, chatUrl, {
      source: 'CONTEXT_MENU',
      mode: modeConfig.label,
      pageTitle: tab?.title || null,
      pageUrl: tab?.url || null,
      selectionLength: info.selectionText?.length || 0,
      linkUrl: info.linkUrl || null,
      srcUrl: info.srcUrl || null,
      contentTruncated: truncation.truncated,
      originalContentLength: truncation.originalLength,
      createNewChat
    });

    logger.endOperation(correlationId, 'success');
  } else {
    logger.error('Failed to send prompt', { correlationId, error: sendResult.error });
    logger.endOperation(correlationId, 'error');
  }
}

/**
 * Send prompt to side panel for analysis (avoids opening ChatGPT tab).
 * Falls back to ChatGPT tab if side panel is not open.
 * @param {string} finalPrompt
 * @param {Object} modeConfig
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @param {string} correlationId
 * @param {{ truncated: boolean, originalLength: number }} truncation
 */
async function sendToSidePanel(finalPrompt, modeConfig, info, tab, correlationId, truncation) {
  let sidePanelReached = false;

  try {
    // Broadcast prompt to side panel via chrome.runtime.sendMessage
    await chrome.runtime.sendMessage({
      v: 1,
      type: 'CONTEXT_MENU_TO_SIDEPANEL',
      correlationId,
      timestamp: Date.now(),
      data: {
        prompt: finalPrompt,
        mode: modeConfig.label,
        icon: modeConfig.icon
      }
    });

    sidePanelReached = true;
    logger.info('Prompt sent to side panel', { correlationId });

    // Persist to chat history
    await persistPromptSafe(correlationId, finalPrompt, null, null, {
      source: 'CONTEXT_MENU',
      mode: modeConfig.label,
      destination: 'side_panel',
      pageTitle: tab?.title || null,
      pageUrl: tab?.url || null,
      selectionLength: info.selectionText?.length || 0,
      linkUrl: info.linkUrl || null,
      srcUrl: info.srcUrl || null,
      contentTruncated: truncation.truncated,
      originalContentLength: truncation.originalLength
    });

    logger.endOperation(correlationId, 'success');
  } catch (error) {
    // Side panel not open -> fall back to ChatGPT tab
    if (!sidePanelReached && error?.message?.includes('Receiving end does not exist')) {
      logger.info('Side panel not open, falling back to ChatGPT tab', { correlationId });
      const prefs = await getUserPreferences();
      await sendToChatGPT(finalPrompt, modeConfig, prefs, info, tab, correlationId, truncation);
    } else {
      logger.error('Failed to send to side panel', { correlationId, error: error.message });
      // Still try ChatGPT as last resort
      const prefs = await getUserPreferences();
      await sendToChatGPT(finalPrompt, modeConfig, prefs, info, tab, correlationId, truncation);
    }
  }
}

// ========== PAGE CONTENT EXTRACTION (Injected) ==========

/**
 * Extract content from page (injected into page context).
 * IMPORTANT: This function is serialized and executed in the page context,
 * so it CANNOT reference any external variables or imports.
 *
 * Enhanced: Prioritizes article/main, uses meta description fallback,
 * and handles Facebook-specific extraction.
 */
function extractPageContent() {
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
