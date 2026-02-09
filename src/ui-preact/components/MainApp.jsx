/**
 * MainApp.jsx - Main application container after authentication
 * 
 * Renders the navigation toolbar and current page
 */

import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { Navigation } from './Navigation.jsx';
import { PortfolioPage } from '../pages/PortfolioPage.jsx';
import WatchlistPage from '../pages/WatchlistPage.jsx';
import AssetsPage from '../pages/AssetsPage.jsx';
import { HistoryPage } from '../pages/HistoryPage.jsx';
import { ErrorsPage } from '../pages/ErrorsPage.jsx';
import { JiraPage } from '../pages/JiraPage.jsx';
import { WritingPage } from '../pages/WritingPage.jsx';
import { SettingsPage } from '../settings/SettingsPage.jsx';
import { currentPage, setCurrentPage } from '../state/navigationState.js';
import { useContextMenuListener } from '../hooks/useContextMenuListener.js';

export function MainApp() {
  // Listen for context menu → side panel messages
  useContextMenuListener();
  // Subscribe to navigation state using effect
  const page = currentPage;

  const renderPage = () => {
    switch (page.value) {
      case 'portfolio':
        return <PortfolioPage />;
      case 'watchlist':
        return <WatchlistPage />;
      case 'assets':
        return <AssetsPage />;
      case 'history':
        return <HistoryPage />;
      case 'errors':
        return <ErrorsPage />;
      case 'jira':
        return <JiraPage />;
      case 'writing':
        return <WritingPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <SettingsPage />;
    }
  };

  const handlePageChange = (pageId) => {
    setCurrentPage(pageId);
  };

  return (
    <div class="main-app">
      <Navigation currentPage={page.value} onPageChange={handlePageChange} />
      <div class="page-wrapper">
        {renderPage()}
      </div>
    </div>
  );
}
