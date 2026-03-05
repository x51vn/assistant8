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
  interval,
  atlassianBaseUrl,
  atlassianEmail,
  atlassianApiToken
} from '../state/settingsState.js';

/**
 * Load settings from background/Supabase and populate signals
 * @returns {Promise<void>}
 * @throws {Error} if load fails
 */
export async function loadSettings() {
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SETTINGS_GET,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });
  
  const loadError = response.error?.message || response.errorMessage;
  if (response.error || response.errorCode || loadError) {
    throw new Error(loadError || 'Failed to load settings');
  }
  
  // ⚠️ CRITICAL: createResponse spreads payload directly (not nested in .data)
  // Response structure: { config: { interval, ... } }
  const config = response.config || {};

  // Populate number signal (1 field)
  interval.value = config.interval ?? 5;

  // Populate Atlassian credentials
  const atlassian = config.atlassian || {};
  atlassianBaseUrl.value = atlassian.baseUrl || '';
  atlassianEmail.value = atlassian.email || '';
  atlassianApiToken.value = atlassian.apiToken || '';
}

/**
 * Save current signal values to background/Supabase
 * NOTE: System prompts are saved separately via saveSystemPrompts()
 * @returns {Promise<void>}
 * @throws {Error} if save fails
 */
export async function saveSettings() {
  // Build config object matching background handler expectations
  const config = {
    // Number settings
    interval: interval.value,

    // Atlassian credentials
    atlassian: {
      baseUrl: atlassianBaseUrl.value,
      email: atlassianEmail.value,
      apiToken: atlassianApiToken.value
    }
  };

  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SETTINGS_UPDATE,
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    data: { config }
  });
  
  const saveError = response.error?.message || response.errorMessage;
  if (response.error || response.errorCode || saveError) {
    throw new Error(saveError || 'Failed to save settings');
  }
}

/**
 * Send master prompt immediately to the active LLM provider
 * @returns {Promise<void>}
 * @throws {Error} if send fails
 */
export async function sendPromptNow() {
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

  const sendError = response.error?.message || response.errorMessage;
  if (response.type === MESSAGE_TYPES.ERROR || response.errorCode || sendError) {
    throw new Error(sendError || 'Failed to send prompt');
  }
}

/**
 * Delete all user settings from Supabase
 * @returns {Promise<void>}
 * @throws {Error} if delete fails
 */
export async function deleteSettings() {
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type: MESSAGE_TYPES.SETTINGS_DELETE,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });

  const deleteError = response.error?.message || response.errorMessage;
  if (response.error || response.errorCode || deleteError) {
    throw new Error(deleteError || 'Failed to delete settings');
  }
}

/**
 * Load all prompts from background/Supabase (12 total: 6 system + 6 writing templates)
 * Returns prompts from DB or defaults if unavailable
 * @returns {Promise<Object>} - All prompts object with keys
 */
export async function loadAllPrompts() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PROMPTS_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
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
  } catch (error) {
    console.warn('[SettingsAPI] Failed to initialize prompts:', error);
    // Don't throw - initialization failure shouldn't block the UI
  }
}
