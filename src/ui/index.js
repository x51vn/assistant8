import { byId } from './dom.js';
import { setupNavigation } from './navigation.js';
import { setupResults } from './results.js';
import { setupSettings } from './settings.js';
import { setupHistory } from './history.js';
import { setupErrors } from './errors.js';
import { loadCachedResultFast } from './storage.js';

(function init() {
  const dom = {
    resultsBtn: byId('resultsBtn'),
    historyBtn: byId('historyBtn'),
    errorsBtn: byId('errorsBtn'),
    settingsBtn: byId('settingsBtn'),
    resultsPage: byId('resultsPage'),
    historyPage: byId('historyPage'),
    errorsPage: byId('errorsPage'),
    settingsPage: byId('settingsPage'),

    runBtn: byId('runBtn'),
    stopBtn: byId('stopBtn'),
    refreshBtn: byId('refreshBtn'),
    resultText: byId('resultText'),
    loadingSpinner: byId('loadingSpinner'),

    historyList: byId('historyList'),
    refreshHistoryBtn: byId('refreshHistoryBtn'),

    errorList: byId('errorList'),
    addErrorBtn: byId('addErrorBtn'),
    retrospectiveBtn: byId('retrospectiveBtn'),
    errorModal: byId('errorModal'),
    errorModalTitle: byId('errorModalTitle'),
    closeErrorModal: byId('closeErrorModal'),
    cancelErrorBtn: byId('cancelErrorBtn'),
    errorTitleInput: byId('errorTitleInput'),
    errorDescInput: byId('errorDescInput'),
    errorTypeInput: byId('errorTypeInput'),
    errorSeverityInput: byId('errorSeverityInput'),
    saveErrorBtn: byId('saveErrorBtn'),

    promptInput: byId('promptInput'),
    autoRunCheckbox: byId('autoRunCheckbox'),
    evaluatePreviousCheckbox: byId('evaluatePreviousCheckbox'),
    reviewPromptCheckbox: byId('reviewPromptCheckbox'),
    intervalInput: byId('intervalInput'),
    saveBtn: byId('saveBtn'),
    sendBtn: byId('sendBtn'),
    resetBtn: byId('resetBtn'),
    saveStatus: byId('saveStatus'),
  };

  setupNavigation(dom);

  const { getAndDisplayResult } = setupResults(dom);
  setupSettings({ ...dom, getAndDisplayResult });
  setupHistory(dom);
  setupErrors(dom);

  loadCachedResultFast(dom.resultText);

  try {
    chrome.runtime.sendMessage({ action: 'ensure_chatgpt_open' });
  } catch {
    // ignore
  }
})();
