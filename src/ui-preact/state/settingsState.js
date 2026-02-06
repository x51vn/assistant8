/**
 * Settings State - Preact Signals
 * Centralized reactive state for Settings form
 *
 * X51LABS-150: Implement Settings Form with Preact Signals
 */

import { signal, computed } from '@preact/signals';
import { getAllDefaultPrompts, getAllPromptMetadata } from '../../shared/allPrompts.js';

// ===== BOOLEAN SIGNALS (4 checkboxes) =====
export const autoRun = signal(false);
export const evaluatePrevious = signal(false);
export const reviewPrompt = signal(false);
export const realtimeEnabled = signal(false);

// ===== NUMBER SIGNAL (1 input) =====
export const interval = signal(5); // Default 5 minutes

// ===== ATLASSIAN CREDENTIALS =====
export const atlassianBaseUrl = signal('');
export const atlassianEmail = signal('');
export const atlassianApiToken = signal('');

// ===== UNIFIED PROMPTS SIGNALS (ALL 12 PROMPTS) =====
// All prompts state: 6 system prompts + 6 writing templates
// Keys: prompt.master, prompt.portfolio, prompt.stockEval, prompt.teaStock,
//       prompt.contextMenu, prompt.english, writing.email, writing.social, etc.
export const allPrompts = signal({});

// Track which prompts are expanded (key -> boolean)
export const allPromptsExpanded = signal({});

// ===== UI STATE SIGNALS =====
// NOTE: isLoading removed - use global loading from appState.js
// All pages MUST use setGlobalLoading() / hideLoading() for consistency
export const isSaving = signal(false);

// ===== STATUS MESSAGE SIGNALS =====
export const statusMessage = signal('');
export const statusType = signal('info');
export const statusVisible = signal(false);

let statusTimeoutId = null;

/**
 * Show status message with optional auto-hide duration
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 * @param {number} [duration=3000] - Auto-hide duration in ms (0 = no auto-hide)
 */
export function showStatus(message, type = 'info', duration = 3000) {
  if (!message) return;
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
  statusMessage.value = message;
  statusType.value = type;
  statusVisible.value = true;
  
  if (duration > 0) {
    statusTimeoutId = setTimeout(() => {
      hideStatus();
    }, duration);
  }
}

/**
 * Hide status message and clear any pending timeout
 */
export function hideStatus() {
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
  statusVisible.value = false;
  statusMessage.value = '';
}

// ===== CONFIRMATION DIALOG SIGNALS =====
export const confirmVisible = signal(false);
export const confirmTitle = signal('Xác nhận');
export const confirmMessage = signal('');
export const confirmConfirmText = signal('Xác nhận');
export const confirmCancelText = signal('Hủy');
export const confirmOnConfirm = signal(null);
export const confirmOnCancel = signal(null);

/**
 * Show confirmation dialog
 * @param {Object} options
 * @param {string} options.message
 * @param {string} [options.title]
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {Function} [options.onConfirm]
 * @param {Function} [options.onCancel]
 */
export function showConfirm({
  message,
  title = 'Xác nhận',
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  onConfirm,
  onCancel
}) {
  if (!message) return;
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmConfirmText.value = confirmText;
  confirmCancelText.value = cancelText;
  confirmOnConfirm.value = typeof onConfirm === 'function' ? onConfirm : null;
  confirmOnCancel.value = typeof onCancel === 'function' ? onCancel : null;
  confirmVisible.value = true;
}

/**
 * Hide confirmation dialog and clear callbacks
 */
export function hideConfirm() {
  confirmVisible.value = false;
  confirmMessage.value = '';
  confirmOnConfirm.value = null;
  confirmOnCancel.value = null;
}

// ===== USER INFO SIGNALS =====
export const userEmail = signal('');
export const userName = signal('');
// NOTE: isAuthLoading removed - use global loading from appState.js

// ===== COMPUTED SIGNALS =====
/**
 * Form is valid if master prompt is not empty
 */
export const isFormValid = computed(() => {
  const masterContent = allPrompts.value['prompt.master']?.content || '';
  return masterContent.trim().length > 0;
});

/**
 * Build default prompt map (12 prompts)
 * @returns {Object} - Prompt map keyed by prompt key
 */
export function buildDefaultPrompts() {
  const defaults = getAllDefaultPrompts();
  const metadata = getAllPromptMetadata();
  const result = {};

  for (const meta of metadata) {
    result[meta.key] = {
      key: meta.key,
      title: meta.title,
      content: defaults[meta.key] || '',
      tags: meta.tags || [],
      promptType: meta.prompt_type,
      isSystem: meta.is_system,
      description: meta.description,
      icon: meta.icon,
      required: meta.required,
      variables: meta.variables
    };
  }

  return result;
}

/**
 * Reset all form fields to empty/default values
 */
export function resetAllFields() {
  // All prompts (unified)
  const defaults = buildDefaultPrompts();
  allPrompts.value = defaults;
  allPromptsExpanded.value = {};

  // Booleans
  autoRun.value = false;
  evaluatePrevious.value = false;
  reviewPrompt.value = false;
  realtimeEnabled.value = false;

  // Number
  interval.value = 5;

  return defaults;
}

/**
 * Update a single prompt (system or writing template)
 * @param {string} key - Prompt key (e.g., 'prompt.master', 'writing.email')
 * @param {string} content - New prompt content
 */
export function updateAllPrompt(key, content) {
  const prompts = { ...allPrompts.value };
  if (prompts[key]) {
    // ✅ PRESERVE ALL FIELDS (title, description, tags, etc.) - only update content
    prompts[key] = {
      ...prompts[key],  // Keep ALL existing fields
      content           // Update content
    };
    allPrompts.value = prompts;
  }
}

/**
 * Toggle prompt expanded/collapsed state
 * @param {string} key - Prompt key
 */
export function toggleAllPromptExpanded(key) {
  const expanded = { ...allPromptsExpanded.value };
  expanded[key] = !expanded[key];
  allPromptsExpanded.value = expanded;
}

/**
 * Expand all prompts
 */
export function expandAllPrompts() {
  const expanded = {};
  for (const key of Object.keys(allPrompts.value)) {
    expanded[key] = true;
  }
  allPromptsExpanded.value = expanded;
}

/**
 * Collapse all prompts
 */
export function collapseAllPrompts() {
  const expanded = {};
  for (const key of Object.keys(allPrompts.value)) {
    expanded[key] = false;
  }
  allPromptsExpanded.value = expanded;
}

/**
 * Get master prompt from allPrompts
 * @returns {string} Master prompt content
 */
export function getMasterPrompt() {
  return allPrompts.value['prompt.master']?.content || '';
}

/**
 * Get portfolio prompt from allPrompts
 * @returns {string} Portfolio prompt content
 */
export function getPortfolioPrompt() {
  return allPrompts.value['prompt.portfolio']?.content || '';
}

/**
 * Get stock evaluation prompt from allPrompts
 * @returns {string} Stock eval prompt content
 */
export function getStockEvalPrompt() {
  return allPrompts.value['prompt.stockEval']?.content || '';
}

/**
 * Get tea stock prompt from allPrompts
 * @returns {string} Tea stock prompt content
 */
export function getTeaStockPrompt() {
  return allPrompts.value['prompt.teaStock']?.content || '';
}

/**
 * Get context menu prompt from allPrompts
 * @returns {string} Context menu prompt content
 */
export function getContextMenuPrompt() {
  return allPrompts.value['prompt.contextMenu']?.content || '';
}

/**
 * Get English learning prompt from allPrompts
 * @returns {string} English learning prompt content
 */
export function getEnglishPrompt() {
  return allPrompts.value['prompt.english']?.content || '';
}
