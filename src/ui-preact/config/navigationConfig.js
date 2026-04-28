/**
 * Centralized navigation metadata.
 */

export const NAVIGATION_PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-tachometer-alt', primary: true, order: 1 },
  { id: 'portfolio', label: 'Portfolio', icon: 'fas fa-chart-pie', primary: true, order: 2 },
  { id: 'market', label: 'Thị trường', icon: 'fas fa-chart-area', primary: true, order: 3 },
  { id: 'watchlist', label: 'Watchlist', icon: 'fas fa-list-check', primary: true, order: 4 },
  { id: 'assets', label: 'Tài sản', icon: 'fas fa-wallet', primary: true, order: 5 },
  { id: 'journal', label: 'Journal', icon: 'fas fa-book', primary: true, order: 5.5 },
  { id: 'history', label: 'History', icon: 'fas fa-history', primary: false, order: 6 },
  { id: 'alerts', label: 'Alerts', icon: 'fas fa-bell', primary: false, order: 7 },
  { id: 'writing', label: 'Writing', icon: 'fas fa-pen-fancy', primary: false, order: 8 },
  { id: 'errors', label: 'Errors', icon: 'fas fa-exclamation-triangle', primary: false, order: 9 },
  { id: 'jira', label: 'Jira', icon: 'fab fa-jira', primary: false, order: 10 },
  { id: 'prompts', label: 'Prompts', icon: 'fas fa-scroll', primary: false, order: 11 },
  { id: 'improvement', label: 'Đánh giá', icon: 'fas fa-star-half-alt', primary: false, order: 12 },
  { id: 'jobs', label: 'Jobs', icon: 'fas fa-tasks', primary: false, order: 13 },
  { id: 'settings', label: 'Settings', icon: 'fas fa-cog', primary: false, order: 14 },
];

export function getNavigationPages() {
  return [...NAVIGATION_PAGES].sort((a, b) => a.order - b.order);
}

