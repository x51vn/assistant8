import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';

export function setupNavigation(dom) {
  const { 
    notesBtn, resultsBtn, portfolioBtn, errorsBtn, englishBtn, templatesBtn, settingsBtn, 
    notesPage, resultsPage, portfolioPage, errorsPage, englishPage, templatesPage, settingsPage, 
    promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput 
  } = dom;

  const pages = [notesPage, portfolioPage, resultsPage, errorsPage, englishPage, templatesPage, settingsPage];
  const btns = [notesBtn, portfolioBtn, resultsBtn, errorsBtn, englishBtn, templatesBtn, settingsBtn];

  notesBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'notes' });
  });

  portfolioBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'portfolio' });
  });

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'results' });
  });

  errorsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'errors' });
  });
  
  englishBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'english' });
  });

  templatesBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'templates' });
  });

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'settings' });
    loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput });
  });
}
