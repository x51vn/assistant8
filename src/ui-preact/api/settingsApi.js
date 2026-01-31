/**
 * Settings API - Background communication layer
 * Handles MESSAGE_TYPES.SETTINGS_GET/UPDATE with signal integration
 * 
 * X51LABS-150: Implement Settings Form with Preact Signals
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import {
  masterPrompt,
  portfolioPrompt,
  stockEvalPrompt,
  teaStockPrompt,
  contextMenuPrompt,
  englishPrompt,
  autoRun,
  evaluatePrevious,
  reviewPrompt,
  realtimeEnabled,
  interval
} from '../state/settingsState.js';

/**
 * Load settings from background/Supabase and populate signals
 * @returns {Promise<void>}
 * @throws {Error} if load fails
 */
export async function loadSettings() {
  console.log('[SettingsAPI] Loading settings...');
  
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SETTINGS_GET,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });
  
  console.log('[SettingsAPI] SETTINGS_GET response:', response);
  
  const loadError = response.error?.message || response.errorMessage;
  if (response.error || response.errorCode || loadError) {
    throw new Error(loadError || 'Failed to load settings');
  }
  
  // ⚠️ CRITICAL: createResponse spreads payload directly (not nested in .data)
  // Response structure: { config: { prompts: {...}, autoRun, ... } }
  const config = response.config || {};
  const prompts = config.prompts || {};
  
  console.log('[SettingsAPI] Parsed config:', {
    hasPrompts: !!prompts,
    promptKeys: Object.keys(prompts),
    autoRun: config.autoRun,
    interval: config.interval
  });
  
  // Populate prompt signals (6 fields)
  // ✅ Handle both new (config.prompts.master) and legacy (config.prompt) formats
  masterPrompt.value = prompts.master || config.prompt || '';
  portfolioPrompt.value = prompts.portfolio || '';
  stockEvalPrompt.value = prompts.stockEval || 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
  teaStockPrompt.value = prompts.teaStock || '';
  contextMenuPrompt.value = prompts.contextMenu || 'Hãy phân tích nội dung sau:\n\n{CONTENT}';
  englishPrompt.value = prompts.english || getDefaultEnglishPrompt();
  
  // Populate boolean signals (4 fields)
  autoRun.value = config.autoRun ?? false;
  evaluatePrevious.value = config.evaluatePrevious ?? false;
  reviewPrompt.value = config.reviewPrompt ?? false;
  realtimeEnabled.value = config.realtimeEnabled ?? false;
  
  // Populate number signal (1 field)
  interval.value = config.interval ?? 5;
  
  console.log('[SettingsAPI] All signals populated successfully');
}

/**
 * Save current signal values to background/Supabase
 * @returns {Promise<void>}
 * @throws {Error} if save fails
 */
export async function saveSettings() {
  console.log('[SettingsAPI] Saving settings...');
  
  // Validation (client-side, server also validates)
  if (masterPrompt.value.trim().length === 0) {
    throw new Error('Master prompt cannot be empty');
  }
  
  // Build config object matching background handler expectations
  const config = {
    // Boolean settings
    autoRun: autoRun.value,
    evaluatePrevious: evaluatePrevious.value,
    reviewPrompt: reviewPrompt.value,
    realtimeEnabled: realtimeEnabled.value,
    
    // Number settings
    interval: interval.value,
    
    // Prompts (normalized structure)
    prompts: {
      master: masterPrompt.value,
      portfolio: portfolioPrompt.value,
      stockEval: stockEvalPrompt.value,
      teaStock: teaStockPrompt.value,
      contextMenu: contextMenuPrompt.value,
      english: englishPrompt.value
    }
  };
  
  console.log('[SettingsAPI] Sending SETTINGS_UPDATE with config:', {
    autoRun: config.autoRun,
    interval: config.interval,
    promptLengths: {
      master: config.prompts.master.length,
      portfolio: config.prompts.portfolio.length,
      stockEval: config.prompts.stockEval.length,
      teaStock: config.prompts.teaStock.length,
      contextMenu: config.prompts.contextMenu.length,
      english: config.prompts.english.length
    }
  });
  
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SETTINGS_UPDATE,
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    data: { config }
  });
  
  console.log('[SettingsAPI] SETTINGS_UPDATE response:', response);
  
  const saveError = response.error?.message || response.errorMessage;
  if (response.error || response.errorCode || saveError) {
    throw new Error(saveError || 'Failed to save settings');
  }
  
  console.log('[SettingsAPI] Settings saved successfully');
}

/**
 * Helper: Get default English prompt template
 */
function getDefaultEnglishPrompt() {
  return `Teach me English about: {TOPIC}

Provide:
1. An English sentence/phrase
2. Vietnamese translation
3. Usage example
4. Common situations to use it`;
}

/**
 * Send master prompt immediately to ChatGPT
 * @returns {Promise<void>}
 * @throws {Error} if send fails
 */
export async function sendPromptNow() {
  console.log('[SettingsAPI] Sending master prompt now...');
  
  // Validation
  if (masterPrompt.value.trim().length === 0) {
    throw new Error('Master prompt cannot be empty');
  }
  
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SEND_PROMPT,
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    payload: {
      prompt: masterPrompt.value,
      options: {
        createNewChat: true,
        focusTab: true
      }
    }
  });
  
  console.log('[SettingsAPI] SEND_PROMPT response:', response);
  
  const sendError = response.error?.message || response.errorMessage;
  if (response.type === MESSAGE_TYPES.ERROR || response.errorCode || sendError) {
    throw new Error(sendError || 'Failed to send prompt');
  }
  
  console.log('[SettingsAPI] Prompt sent successfully');
}

/**
 * Delete all user settings from Supabase
 * @returns {Promise<void>}
 * @throws {Error} if delete fails
 */
export async function deleteSettings() {
  console.log('[SettingsAPI] Deleting all settings from Supabase...');
  
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SETTINGS_DELETE,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });
  
  console.log('[SettingsAPI] SETTINGS_DELETE response:', response);
  
  const deleteError = response.error?.message || response.errorMessage;
  if (response.error || response.errorCode || deleteError) {
    throw new Error(deleteError || 'Failed to delete settings');
  }
  
  console.log('[SettingsAPI] Settings deleted successfully from Supabase');
}
