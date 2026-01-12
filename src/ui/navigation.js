import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';

export function setupNavigation(dom) {
  const { 
    resultsBtn, portfolioBtn, historyBtn, errorsBtn, settingsBtn, 
    resultsPage, portfolioPage, historyPage, errorsPage, settingsPage, 
    promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput 
  } = dom;

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'results' 
    });
  });

  portfolioBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'portfolio' 
    });
  });

  historyBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'history' 
    });
  });

  errorsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'errors' 
    });
  });

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'settings' 
    });
    loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput });
  });
}
