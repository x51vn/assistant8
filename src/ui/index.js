import { byId } from './dom.js';
import { setupNavigation } from './navigation.js';
import { setupResults } from './results.js';
import { setupSettings } from './settings.js';
import { loadCachedResultFast } from './storage.js';

(function init() {
  const dom = {
    resultsBtn: byId('resultsBtn'),
    settingsBtn: byId('settingsBtn'),
    resultsPage: byId('resultsPage'),
    settingsPage: byId('settingsPage'),

    runBtn: byId('runBtn'),
    refreshBtn: byId('refreshBtn'),
    resultText: byId('resultText'),
    loadingSpinner: byId('loadingSpinner'),

    promptInput: byId('promptInput'),
    autoRunCheckbox: byId('autoRunCheckbox'),
    intervalInput: byId('intervalInput'),
    saveBtn: byId('saveBtn'),
    sendBtn: byId('sendBtn'),
    resetBtn: byId('resetBtn'),
    saveStatus: byId('saveStatus'),
  };

  setupNavigation(dom);

  const { getAndDisplayResult } = setupResults(dom);
  setupSettings({ ...dom, getAndDisplayResult });

  loadCachedResultFast(dom.resultText);

  try {
    chrome.runtime.sendMessage({ action: 'ensure_chatgpt_open' });
  } catch {
    // ignore
  }
})();
