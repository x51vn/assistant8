import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';
import { refreshPortfolioUI } from './portfolio.js';

export function setupNavigation(dom) {
  const { 
    resultsBtn, portfolioBtn, errorsBtn, englishBtn, settingsBtn, 
    resultsPage, portfolioPage, errorsPage, englishPage, settingsPage, 
    promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput 
  } = dom;

  const pages = [portfolioPage, resultsPage, errorsPage, englishPage, settingsPage];
  const btns = [portfolioBtn, resultsBtn, errorsBtn, englishBtn, settingsBtn];

  portfolioBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'portfolio' });
    // ✅ Reload portfolio data from Supabase when switching to portfolio tab
    refreshPortfolioUI();
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

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'settings' });
    loadSettings({ promptInput, autoRunCheckbox, evaluatePreviousCheckbox, intervalInput });
  });
}
