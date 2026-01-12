import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';

export function setupNavigation(dom) {
  const { 
    resultsBtn, portfolioBtn, errorsBtn, templatesBtn, settingsBtn, 
    resultsPage, portfolioPage, errorsPage, templatesPage, settingsPage, 
    promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput 
  } = dom;

  const pages = [resultsPage, portfolioPage, errorsPage, templatesPage, settingsPage];
  const btns = [resultsBtn, portfolioBtn, errorsBtn, templatesBtn, settingsBtn];

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'results' });
  });

  portfolioBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'portfolio' });
  });

  errorsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'errors' });
  });

  templatesBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'templates' });
  });

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'settings' });
    loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput });
  });
}
