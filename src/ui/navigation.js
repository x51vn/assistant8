import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';

export function setupNavigation(dom) {
  const { 
    resultsBtn, historyBtn, errorsBtn, settingsBtn, 
    resultsPage, historyPage, errorsPage, settingsPage, 
    promptInput, autoRunCheckbox, intervalInput 
  } = dom;

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'results' 
    });
  });

  historyBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'history' 
    });
  });

  errorsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'errors' 
    });
  });

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ 
      resultsPage, historyPage, errorsPage, settingsPage, 
      resultsBtn, historyBtn, errorsBtn, settingsBtn, 
      page: 'settings' 
    });
    loadSettings({ promptInput, autoRunCheckbox, intervalInput });
  });
}
