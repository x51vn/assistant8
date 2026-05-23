/**
 * @fileoverview Context Menu Handler dispatcher.
 *
 * Keeps the public context menu API stable while delegating constants, prompt
 * caching, content extraction, and send handling to focused sub-modules.
 */

import { createLogger } from '../../../logger.js';
import { MENU_IDS, ANALYSIS_MODES } from './constants.js';
import { getContextMenuPrompt, invalidatePromptCache } from './promptCache.js';
import { buildContextInfo, extractContent, smartTruncate } from './contentExtraction.js';
import {
  getUserPreferences,
  handleOptionToggle,
  sendToChatGPT,
  sendToSidePanel,
  setBadgeFeedback
} from './sendHandlers.js';

export { MENU_IDS } from './constants.js';
export { invalidatePromptCache } from './promptCache.js';

const logger = createLogger('ContextMenu');

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
      title: 'Assistant8',
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

    // Writing Assistant items (XST-780)
    chrome.contextMenus.create({
      id: MENU_IDS.IMPROVE,
      parentId: MENU_IDS.PARENT,
      title: '\u2728 C\u1ea3i thi\u1ec7n v\u0103n b\u1ea3n',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: MENU_IDS.EXPLAIN,
      parentId: MENU_IDS.PARENT,
      title: '\ud83d\udca1 Gi\u1ea3i th\u00edch \u0111o\u1ea1n n\u00e0y',
      contexts: ['selection']
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
