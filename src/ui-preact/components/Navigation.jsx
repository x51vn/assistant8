/**
 * Navigation.jsx - Top navigation toolbar for page switching
 * 
 * Provides tabs to navigate between different sections:
 * - Portfolio: Stock holdings & tracking
 * - History: Chat history with ChatGPT
 * - Errors: Error tracking & retrospective
 * - English: English learning module
 * - Settings: User settings
 */

import { h } from 'preact';

export function Navigation({ currentPage, onPageChange }) {
  const pages = [
    { id: 'portfolio', label: 'Portfolio', icon: 'fas fa-chart-pie' },
    { id: 'assets', label: 'Tài sản', icon: 'fas fa-wallet' },
    { id: 'history', label: 'History', icon: 'fas fa-history' },
    { id: 'errors', label: 'Errors', icon: 'fas fa-exclamation-triangle' },
    { id: 'english', label: 'English', icon: 'fas fa-book' },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog' }
  ];

  return (
    <nav class="navbar navbar-tabs">
      <div class="nav-tabs-container">
        {pages.map(page => (
          <button
            key={page.id}
            class={`nav-tab ${currentPage === page.id ? 'active' : ''}`}
            onClick={() => onPageChange(page.id)}
            title={page.label}
            type="button"
          >
            <i class={page.icon}></i>
            <span class="nav-label">{page.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
