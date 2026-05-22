/**
 * navigationState.js - Navigation state management
 * 
 * Tracks which page is currently active
 */

import { signal } from '@preact/signals';

// Default page when user logs in
export const currentPage = signal('dashboard');

/**
 * Change current page
 * @param {string} pageId - Page identifier (dashboard, portfolio, market, watchlist, assets, history, alerts, writing, errors, jira, prompts, improvement, jobs, settings)
 */
export function setCurrentPage(pageId) {
  currentPage.value = pageId;
}
