import { setActivePage } from './pages.js';
import { refreshPortfolioUI } from './portfolio.js';

export function setupNavigation(dom) {
  const { 
    resultsBtn, portfolioBtn, errorsBtn, englishBtn, settingsBtn, 
    resultsPage, portfolioPage, errorsPage, englishPage, settingsPage, 
    promptInput, autoRunCheckbox, evaluatePreviousCheckbox, reviewPromptCheckbox, realtimeEnabledCheckbox, intervalInput 
  } = dom;

  const pages = [portfolioPage, resultsPage, errorsPage, englishPage, settingsPage];
  const btns = [portfolioBtn, resultsBtn, errorsBtn, englishBtn, settingsBtn];

  portfolioBtn?.addEventListener('click', () => {
    console.log('[Navigation] Portfolio button clicked!');
    setActivePage({ pages, btns, page: 'portfolio' });
    // ✅ Reload portfolio data from Supabase when switching to portfolio tab
    console.log('[Navigation] Calling refreshPortfolioUI...');
    refreshPortfolioUI();
  });

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ pages, btns, page: 'results' });
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
    // ✅ Unified settings loader: src/ui/settings.js::loadAllSettingsAtOnce is called on settings page init
    // setupSettings() already calls loadAllSettingsAtOnce() on page load; no need to load again here
  });
}
