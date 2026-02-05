/**
 * Settings API - Background communication layer
 * Handles MESSAGE_TYPES.SETTINGS_GET/UPDATE with signal integration
 * 
 * X51LABS-150: Implement Settings Form with Preact Signals
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';
import { clearTemplateCache } from './writingApi.js';
import {
  allPrompts,
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
  // Response structure: { config: { autoRun, evaluatePrevious, ... } }
  const config = response.config || {};

  console.log('[SettingsAPI] Parsed config:', {
    autoRun: config.autoRun,
    interval: config.interval
  });

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
 * NOTE: System prompts are saved separately via saveSystemPrompts()
 * @returns {Promise<void>}
 * @throws {Error} if save fails
 */
export async function saveSettings() {
  console.log('[SettingsAPI] Saving settings...');

  // Build config object matching background handler expectations
  const config = {
    // Boolean settings
    autoRun: autoRun.value,
    evaluatePrevious: evaluatePrevious.value,
    reviewPrompt: reviewPrompt.value,
    realtimeEnabled: realtimeEnabled.value,

    // Number settings
    interval: interval.value
  };

  console.log('[SettingsAPI] Sending SETTINGS_UPDATE with config:', config);
  
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
 * Send master prompt immediately to ChatGPT
 * @returns {Promise<void>}
 * @throws {Error} if send fails
 */
export async function sendPromptNow() {
  console.log('[SettingsAPI] Sending master prompt now...');

  // Get master prompt from allPrompts
  const masterContent = allPrompts.value['prompt.master']?.content || '';

  // Validation
  if (masterContent.trim().length === 0) {
    throw new Error('Master prompt cannot be empty');
  }

  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SEND_PROMPT,
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    payload: {
      prompt: masterContent,
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

/**
 * Load all prompts from background/Supabase (12 total: 6 system + 6 writing templates)
 * Returns prompts from DB or defaults if unavailable
 * @returns {Promise<Object>} - All prompts object with keys
 */
export async function loadAllPrompts() {
  console.log('[SettingsAPI] Loading all prompts...');

  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PROMPTS_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    console.log('[SettingsAPI] PROMPTS_GET_ALL response:', {
      success: response.success,
      promptsCount: response.prompts ? Object.keys(response.prompts).length : 0,
      isDefaultFallback: response.isDefaultFallback
    });

    if (response.error || response.errorCode) {
      throw new Error(response.error?.message || response.errorMessage || 'Failed to load prompts');
    }

    return response.prompts || {};
  } catch (error) {
    console.error('[SettingsAPI] Failed to load all prompts:', error);
    throw error;
  }
}

/**
 * Save all prompts to background/Supabase (12 total: 6 system + 6 writing templates)
 * Upserts all prompts in bulk
 * @param {Object} prompts - All prompts object with keys and content
 * @returns {Promise<Object>} - Save result with success count
 */
export async function saveAllPrompts(prompts) {
  console.log('[SettingsAPI] Saving all prompts...');

  // Validate prompts
  if (!prompts || typeof prompts !== 'object') {
    throw new Error('Invalid prompts data');
  }

  // Check that master prompt is not empty
  if (!prompts['prompt.master']?.content || typeof prompts['prompt.master'].content !== 'string' || prompts['prompt.master'].content.trim().length === 0) {
    throw new Error('Master prompt cannot be empty');
  }

  try {
    // Prepare prompts for sending
    const promptsToSend = {};
    for (const [key, prompt] of Object.entries(prompts)) {
      promptsToSend[key] = prompt;
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PROMPTS_UPSERT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { prompts: promptsToSend }
    });

    console.log('[SettingsAPI] PROMPTS_UPSERT response:', {
      success: response.success,
      successCount: response.successCount,
      failureCount: response.failureCount,
      partialSuccess: response.partialSuccess,
      results: response.results
    });

    if (response.error || response.errorCode) {
      throw new Error(response.error?.message || response.errorMessage || 'Failed to save prompts');
    }

    // Check for partial failure
    if (response.partialSuccess) {
      const error = new Error(`Lưu prompts thất bại (${response.successCount}/${Object.keys(prompts).length} thành công)`);
      error.partialSuccess = true;
      error.results = response.results;
      throw error;
    }

    // Clear writing template cache so changes take effect immediately
    clearTemplateCache();

    return response;
  } catch (error) {
    console.error('[SettingsAPI] Failed to save all prompts:', error);
    throw error;
  }
}

/**
 * Initialize default prompts for user
 * Called when user first opens Settings or after login
 * Creates prompts if missing, idempotent (safe to run multiple times)
 * @returns {Promise<void>}
 */
export async function initializeAllPrompts() {
  console.log('[SettingsAPI] Initializing prompts...');

  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PROMPTS_INIT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    console.log('[SettingsAPI] PROMPTS_INIT response:', response);

    if (response.error || response.errorCode) {
      console.warn('[SettingsAPI] Failed to initialize prompts:', response.error?.message || response.errorMessage);
      // Don't throw - initialization failure shouldn't block the Settings page
      return;
    }

    console.log('[SettingsAPI] Prompts initialized successfully');
  } catch (error) {
    console.warn('[SettingsAPI] Failed to initialize prompts:', error);
    // Don't throw - initialization failure shouldn't block the UI
  }
}
