/**
 * MainApp.jsx - Main application container after authentication
 * 
 * Renders the navigation toolbar and current page
 */

import { h } from 'preact';
import { Navigation } from './Navigation.jsx';
import { PortfolioPage } from '../pages/PortfolioPage.jsx';
import WatchlistPage from '../pages/WatchlistPage.jsx';
import AssetsPage from '../pages/AssetsPage.jsx';
import { HistoryPage } from '../pages/HistoryPage.jsx';
import { ErrorsPage } from '../pages/ErrorsPage.jsx';
import { JiraPage } from '../pages/JiraPage.jsx';
import { WritingPage } from '../pages/WritingPage.jsx';
import { AlertsPage } from '../pages/AlertsPage.jsx';
import { JobsPage } from '../pages/JobsPage.jsx';
import { SettingsPage } from '../settings/SettingsPage.jsx';
import { DashboardPage } from '../pages/DashboardPage.jsx';
import { PromptsPage } from '../pages/PromptsPage.jsx';
import { MarketPage } from '../pages/MarketPage.jsx';
import { PromptImprovementPage } from '../pages/PromptImprovementPage.jsx';
import { OnboardingWizard, useOnboardingGate } from './OnboardingWizard.jsx';
import { ShortcutsHelp } from './ShortcutsHelp.jsx';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { currentPage, setCurrentPage } from '../state/navigationState.js';
import { useContextMenuListener } from '../hooks/useContextMenuListener.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePromptsBootstrap } from '../hooks/usePromptsBootstrap.js';

export function MainApp() {
  // Listen for context menu → side panel messages
  useContextMenuListener();
  const { user } = useAuth();
  usePromptsBootstrap(user);
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  const { showOnboarding, handleDone, handleSkip } = useOnboardingGate(!!user);
  // Subscribe to navigation state using effect
  const page = currentPage;

  const renderPage = () => {
    switch (page.value) {
      case 'dashboard':
        return <DashboardPage />;
      case 'prompts':
        return <PromptsPage />;
      case 'portfolio':
        return <PortfolioPage />;
      case 'market':
        return <MarketPage />;
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
      case 'alerts':
        return <AlertsPage />;
      case 'jobs':
        return <JobsPage />;
      case 'writing':
        return <WritingPage />;
      case 'improvement':
        return <PromptImprovementPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
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
      {showOnboarding && <OnboardingWizard onDone={handleDone} onSkip={handleSkip} />}
      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}
