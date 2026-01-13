import { byId } from './dom.js';
import { setupNavigation } from './navigation.js';
import { setupResults } from './results.js';
import { setupSettings } from './settings.js';
import { setupHistory } from './history.js';
import { setupErrors } from './errors.js';
import { setupBackup } from './backup.js';
import { initPortfolio } from './portfolio.js';
import { loadCachedResultFast } from './storage.js';
import { setupTemplates, initializeTemplates } from './templates.js';
import { setupSync } from './sync.js';

(function init() {
  const dom = {
    resultsBtn: byId('resultsBtn'),
    portfolioBtn: byId('portfolioBtn'),
    errorsBtn: byId('errorsBtn'),
    settingsBtn: byId('settingsBtn'),
    resultsPage: byId('resultsPage'),
    portfolioPage: byId('portfolioPage'),
    errorsPage: byId('errorsPage'),
    settingsPage: byId('settingsPage'),

    runBtn: byId('runBtn'),
    stopBtn: byId('stopBtn'),
    refreshBtn: byId('refreshBtn'),

    portfolioTable: byId('portfolioTable')?.querySelector('tbody'),
    addStockBtn: byId('addStockBtn'),
    portfolioPromptInput: byId('portfolioPromptInput'),
    evaluateBtn: byId('evaluateBtn'),
    portfolioModal: byId('portfolioModal'),
    closePortfolioModal: byId('closePortfolioModal'),
    cancelPortfolioBtn: byId('cancelPortfolioBtn'),

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
    exportBtn: byId('exportBtn'),
    importBtn: byId('importBtn'),
    importFileInput: byId('importFileInput'),
    backupStatus: byId('backupStatus'),
    
    // Sync
    syncEnabledCheckbox: byId('syncEnabledCheckbox'),
    authGoogleBtn: byId('authGoogleBtn'),
    syncNowBtn: byId('syncNowBtn'),
    revokeGoogleBtn: byId('revokeGoogleBtn'),
    syncStatus: byId('syncStatus'),
    backupsList: byId('backupsList'),
    
    // Templates
    templatesBtn: byId('templatesBtn'),
    templatesPage: byId('templatesPage'),
    templateList: byId('templateList'),
    newTemplateBtn: byId('newTemplateBtn'),
    templateModal: byId('templateModal'),
    closeTemplateModal: byId('closeTemplateModal'),
    templateNameInput: byId('templateNameInput'),
    templateDescInput: byId('templateDescInput'),
    templateCategorySelect: byId('templateCategorySelect'),
    templateContentInput: byId('templateContentInput'),
    saveTemplateBtn: byId('saveTemplateBtn'),
    cancelTemplateBtn: byId('cancelTemplateBtn'),
  };

  // Initialize templates
  initializeTemplates();

  setupNavigation(dom);

  setupResults(dom);
  setupSettings(dom);
  setupBackup(dom);
  setupSync(dom);
  setupHistory(dom);
  setupErrors(dom);
  setupTemplates(dom);
  initPortfolio({
    portfolioPage: dom.portfolioPage,
    portfolioBtn: dom.portfolioBtn,
    portfolioTable: dom.portfolioTable,
    addStockBtn: dom.addStockBtn,
    stockCodeInput: byId('stockCodeInput'),
    entryInput: byId('stockEntryInput'),
    quantityInput: byId('stockQuantityInput'),
    promptInput: dom.portfolioPromptInput,
    evaluateBtn: dom.evaluateBtn,
  });

  try {
    chrome.runtime.sendMessage({ action: 'ensure_chatgpt_open' });
  } catch {
    // ignore
  }
})();
