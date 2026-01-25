import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

// ✅ GPT-FIX: No longer cache results locally
export async function loadCachedResultFast(resultText) {
  // No-op: Results are now fetched from Supabase chat_history when needed
  console.log('[Storage] loadCachedResultFast deprecated - use Supabase chat_history');
}

// ✅ GPT-FIX: Load settings from Supabase
export async function loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, reviewPromptCheckbox, realtimeEnabledCheckbox, intervalInput }) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    
    if (response.errorCode) {
      console.warn('[Storage] Failed to load settings from Supabase:', response.errorMessage);
      // Set defaults
      if (promptInput) promptInput.value = '';
      if (autoRunCheckbox) autoRunCheckbox.checked = false;
      if (evaluatePreviousCheckbox) evaluatePreviousCheckbox.checked = false;
      if (reviewPromptCheckbox) reviewPromptCheckbox.checked = false;
      if (realtimeEnabledCheckbox) realtimeEnabledCheckbox.checked = false;
      if (intervalInput) intervalInput.value = 5;
      return;
    }
    
    const config = response.data?.config || {};
    if (promptInput) promptInput.value = config.prompt || '';
    if (autoRunCheckbox) autoRunCheckbox.checked = config.autoRun || false;
    if (evaluatePreviousCheckbox) evaluatePreviousCheckbox.checked = config.evaluatePrevious || false;
    if (reviewPromptCheckbox) reviewPromptCheckbox.checked = config.reviewPrompt || false;
    if (realtimeEnabledCheckbox) realtimeEnabledCheckbox.checked = config.realtimeEnabled || false;
    if (intervalInput) intervalInput.value = config.interval || 5;
  } catch (error) {
    console.error('[Storage] Load settings error:', error);
  }
}
