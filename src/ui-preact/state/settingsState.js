/**
 * Settings State - Preact Signals
 * Centralized reactive state for Settings form
 * 
 * X51LABS-150: Implement Settings Form with Preact Signals
 */

import { signal, computed } from '@preact/signals';

// ===== PROMPT SIGNALS (6 textareas) =====
export const masterPrompt = signal('');
export const portfolioPrompt = signal('');
export const stockEvalPrompt = signal('');
export const teaStockPrompt = signal('');
export const contextMenuPrompt = signal('');
export const englishPrompt = signal('');

// ===== BOOLEAN SIGNALS (4 checkboxes) =====
export const autoRun = signal(false);
export const evaluatePrevious = signal(false);
export const reviewPrompt = signal(false);
export const realtimeEnabled = signal(false);

// ===== NUMBER SIGNAL (1 input) =====
export const interval = signal(5); // Default 5 minutes

// ===== UI STATE SIGNALS =====
export const isLoading = signal(false);
export const isSaving = signal(false);

// ===== COMPUTED SIGNALS =====
/**
 * Form is valid if master prompt is not empty
 */
export const isFormValid = computed(() => {
  return masterPrompt.value.trim().length > 0;
});

/**
 * Reset all form fields to empty/default values
 */
export function resetAllFields() {
  // Prompts
  masterPrompt.value = '';
  portfolioPrompt.value = '';
  stockEvalPrompt.value = 'Đánh giá mã cổ phiếu {SYMBOL}: xu hướng, điểm mạnh/yếu, khuyến nghị.';
  teaStockPrompt.value = '';
  contextMenuPrompt.value = 'Hãy phân tích nội dung sau:\n\n{CONTENT}';
  englishPrompt.value = `Teach me English about: {TOPIC}

Provide:
1. An English sentence/phrase
2. Vietnamese translation
3. Usage example
4. Common situations to use it`;
  
  // Booleans
  autoRun.value = false;
  evaluatePrevious.value = false;
  reviewPrompt.value = false;
  realtimeEnabled.value = false;
  
  // Number
  interval.value = 5;
}
