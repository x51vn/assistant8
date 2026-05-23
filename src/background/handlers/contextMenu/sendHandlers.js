/**
 * Context menu sending, preferences, and visual feedback handlers.
 */

import { createLogger } from '../../../logger.js';
import { LLMProviderFactory } from '../../../shared/llm/LLMProviderFactory.js';
import { getProviderConfig } from '../llm.js';
import { supabase } from '../../../supabaseConfig.js';
import { persistPromptSafe } from '../_persistPromptHelper.js';
import { enqueue } from '../../services/promptQueue.js';
import { MENU_IDS } from './constants.js';

const logger = createLogger('ContextMenu');

/**
 * Set badge text on extension icon (brief visual feedback).
 * @param {string} text - Short badge text (max 4 chars)
 * @param {string} color - Badge background color
 * @param {number} [clearAfterMs=3000] - Clear badge after ms (0 = permanent)
 */
export async function setBadgeFeedback(text, color, clearAfterMs = 3000) {
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

/**
 * Handle toggling of side panel / continue chat options.
 * Chrome checkbox menus auto-toggle checked state; we persist to storage.
 * @param {string} menuItemId
 * @param {chrome.contextMenus.OnClickData} info
 */
export async function handleOptionToggle(menuItemId, info) {
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
export async function getUserPreferences() {
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

/**
 * Send prompt via the active LLM provider (ChatGPT / Gemini / Claude).
 * Provider is resolved from user settings; defaults to ChatGPT.
 * The provider's sendPrompt() serializes via p-queue internally.
 *
 * @param {string} finalPrompt
 * @param {Object} modeConfig
 * @param {{ useSidePanel: boolean, continueChat: boolean }} prefs
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 * @param {string} correlationId
 * @param {{ truncated: boolean, originalLength: number }} truncation
 */
export async function sendToChatGPT(finalPrompt, modeConfig, prefs, info, tab, correlationId, truncation) {
  // Resolve active LLM provider from user settings (default: chatgpt)
  let providerConfig = { provider: 'chatgpt' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      providerConfig = await getProviderConfig(session.user.id);
    }
  } catch {
    // Use default chatgpt provider if settings can't be loaded
  }

  const provider = LLMProviderFactory.create(providerConfig, { enqueue });
  const createNewChat = !prefs.continueChat;

  logger.info('Sending prompt via LLM provider', {
    correlationId,
    provider: providerConfig.provider,
    createNewChat,
    mode: modeConfig.label
  });

  // provider.sendPrompt() serializes via p-queue internally
  const result = await provider.sendPrompt(finalPrompt, {
    createNewChat,
    runId: correlationId,
  });

  const chatId = result.chatId || null;
  const chatUrl = result.chatUrl || null;

  logger.info('Prompt sent successfully', { correlationId, provider: providerConfig.provider });

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
export async function sendToSidePanel(finalPrompt, modeConfig, info, tab, correlationId, truncation) {
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
