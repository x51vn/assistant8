/**
 * navigationState.js - Navigation state management
 * 
 * Tracks which page is currently active
 */

import { signal } from '@preact/signals';

// Default page when user logs in
export const currentPage = signal('portfolio');

/**
 * Change current page
 * @param {string} pageId - Page identifier (portfolio, history, errors, english, settings)
 */
export function setCurrentPage(pageId) {
  currentPage.value = pageId;
}
