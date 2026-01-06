import { setActivePage } from './pages.js';
import { loadSettings } from './storage.js';

export function setupNavigation(dom) {
  const { resultsBtn, settingsBtn, resultsPage, settingsPage, promptInput, autoRunCheckbox, intervalInput } = dom;

  resultsBtn?.addEventListener('click', () => {
    setActivePage({ resultsPage, settingsPage, resultsBtn, settingsBtn, page: 'results' });
  });

  settingsBtn?.addEventListener('click', () => {
    setActivePage({ resultsPage, settingsPage, resultsBtn, settingsBtn, page: 'settings' });
    loadSettings({ promptInput, autoRunCheckbox, intervalInput });
  });
}
