/**
 * Navigation.jsx - Responsive top navigation toolbar for page switching
 *
 * Features:
 * - Responsive design: shows labels on wider screens
 * - Dropdown menu: hides overflow items in a "More" menu on smaller screens
 * - Smooth animations and transitions
 * - Active page highlighting
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';

export function Navigation({ currentPage, onPageChange }) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const pages = [
    { id: 'portfolio', label: 'Portfolio', icon: 'fas fa-chart-pie' },
    { id: 'assets', label: 'Tài sản', icon: 'fas fa-wallet' },
    { id: 'history', label: 'History', icon: 'fas fa-history' },
    { id: 'writing', label: 'Writing', icon: 'fas fa-pen-fancy' },
    { id: 'errors', label: 'Errors', icon: 'fas fa-exclamation-triangle' },
    { id: 'jira', label: 'Jira', icon: 'fab fa-jira' },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog' }
  ];

  // Split pages: primary tabs and hidden tabs
  const primaryPages = pages.slice(0, 4); // First 4 visible
  const hiddenPages = pages.slice(4); // Rest in dropdown

  const handlePageChange = (pageId) => {
    onPageChange(pageId);
    setShowMoreMenu(false);
  };

  return (
    <nav class="navbar navbar-tabs">
      <div class="nav-tabs-container">
        {/* Primary Navigation Tabs */}
        {primaryPages.map(page => (
          <button
            key={page.id}
            class={`nav-tab ${currentPage === page.id ? 'active' : ''}`}
            onClick={() => handlePageChange(page.id)}
            title={page.label}
            type="button"
          >
            <i class={page.icon}></i>
            <span class="nav-label">{page.label}</span>
          </button>
        ))}

        {/* More Menu (Dropdown for hidden items) */}
        <div class={`nav-dropdown-container ${showMoreMenu ? 'open' : ''}`}>
          <button
            class={`nav-tab nav-more-btn ${hiddenPages.some(p => p.id === currentPage) ? 'active' : ''}`}
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title="More options"
            type="button"
          >
            <i class="fas fa-ellipsis-h"></i>
            <span class="nav-label">More</span>
          </button>

          {/* Dropdown Menu */}
          <div class={`nav-dropdown-menu ${showMoreMenu ? 'visible' : ''}`}>
            {hiddenPages.map(page => (
              <button
                key={page.id}
                class={`nav-dropdown-item ${currentPage === page.id ? 'active' : ''}`}
                onClick={() => handlePageChange(page.id)}
                type="button"
              >
                <i class={page.icon}></i>
                <span>{page.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Backdrop for closing dropdown */}
      {showMoreMenu && (
        <div
          class="nav-dropdown-backdrop"
          onClick={() => setShowMoreMenu(false)}
        />
      )}
    </nav>
  );
}
