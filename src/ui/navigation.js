import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';

export function setupNavigation(dom) {
  const { 
    resultsBtn, portfolioBtn, errorsBtn, settingsBtn, 
    resultsPage, portfolioPage, errorsPage, settingsPage, 
    promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput 
  } = dom;

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, errorsBtn, settingsBtn, 
      page: 'results' 
    });
  });

  portfolioBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, errorsBtn, settingsBtn, 
      page: 'portfolio' 
    });
  });

  errorsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, errorsBtn, settingsBtn, 
      page: 'errors' 
    });
  });

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, portfolioPage, errorsPage, settingsPage, 
      resultsBtn, portfolioBtn, errorsBtn, settingsBtn, 
      page: 'settings' 
    });
    loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput });
  });
}
