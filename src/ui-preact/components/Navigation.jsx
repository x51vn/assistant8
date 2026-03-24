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
import { getNavigationPages } from '../config/navigationConfig.js';

export function Navigation({ currentPage, onPageChange }) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const pages = getNavigationPages();

  // Split pages by explicit config field
  const primaryPages = pages.filter((page) => page.primary);
  const hiddenPages = pages.filter((page) => !page.primary);

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
