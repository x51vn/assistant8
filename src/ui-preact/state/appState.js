/**
 * App State - Global reactive state
 * 
 * Centralized loading state for entire application
 * Ensures only ONE loading bar is shown at a time
 * 
 * X51LABS: Single loading bar requirement
 */

import { signal } from '@preact/signals';

/**
 * Global loading state - SINGLE SOURCE OF TRUTH
 * All pages MUST use this instead of local loading states
 */
export const globalLoading = signal(false);

/**
 * Loading message - describes what's loading
 */
export const loadingMessage = signal('Đang tải...');

/**
 * Set global loading state with optional message
 * @param {boolean} isLoading
 * @param {string} [message='Đang tải...']
 */
export function setGlobalLoading(isLoading, message = 'Đang tải...') {
  globalLoading.value = isLoading;
  loadingMessage.value = message;
  console.log('[AppState] Global loading:', isLoading, message);
}

/**
 * Show loading with custom message
 * @param {string} message
 */
export function showLoading(message = 'Đang tải...') {
  setGlobalLoading(true, message);
}

/**
 * Hide loading
 */
export function hideLoading() {
  setGlobalLoading(false);
}
