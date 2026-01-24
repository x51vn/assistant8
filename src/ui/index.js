import { byId } from './dom.js';
import { setupNavigation } from './navigation.js';
import { setupResults } from './results.js';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
import { setupSettings } from './settings.js';
import { setupErrors } from './errors.js';
import { setupBackup } from './backup.js';
import { initPortfolio, refreshPortfolioOnLogin, refreshPortfolioUI } from './portfolio.js';
import { initEnglish } from './english.js';
import { checkAuthStatus, renderLoginScreen, hideLoginScreen, listenAuthStateChanges } from './auth.js';
let authContainer = null;
let mainContainer = null;

async function init() {
  // Create auth container
  authContainer = document.createElement('div');
  authContainer.id = 'authContainer';
  document.body.appendChild(authContainer);

  // Get main container
  mainContainer = document.querySelector('.container');

  // Check auth status
  const { authenticated, user } = await checkAuthStatus();

  if (!authenticated) {
    // Show login screen
    console.log('[Auth] User not authenticated, showing login screen');
    showLoginScreen();
  } else {
    // User is authenticated, proceed with normal UI
    console.log('[Auth] User authenticated:', user);
    hideLoginAndInitializeApp();
  }

  // Listen for auth state changes
  listenAuthStateChanges(({ authenticated, user }) => {
    if (authenticated) {
      console.log('[Auth] User logged in:', user);
      hideLoginAndInitializeApp();
      // ✅ Auto-refresh portfolio data on login
      refreshPortfolioOnLogin();
    } else {
      console.log('[Auth] User logged out');
      showLoginScreen();
    }
  });
}

function showLoginScreen() {
  // Hide main UI
  if (mainContainer) {
    mainContainer.style.display = 'none';
  }

  // Show login screen
  if (authContainer) {
    authContainer.style.display = 'block';
    renderLoginScreen(authContainer, (user) => {
      console.log('[Auth] Login success, initializing app for user:', user);
      hideLoginAndInitializeApp();
    });
  }
}

function hideLoginAndInitializeApp() {
  // Hide login screen
  if (authContainer) {
    hideLoginScreen(authContainer);
  }

  // Show main UI
  if (mainContainer) {
    mainContainer.style.display = 'flex';
  }

  // Initialize app (only once)
  if (!window.__appInitialized) {
    initializeApp();
    window.__appInitialized = true;
  }
}

function initializeApp() {
  const dom = {
    // Nav buttons
    resultsBtn: byId('resultsBtn'),
    portfolioBtn: byId('portfolioBtn'),
    errorsBtn: byId('errorsBtn'),
    englishBtn: byId('englishBtn'),
    settingsBtn: byId('settingsBtn'),
    
    // Pages
    resultsPage: byId('resultsPage'),
    portfolioPage: byId('portfolioPage'),
    errorsPage: byId('errorsPage'),
    englishPage: byId('englishPage'),
    settingsPage: byId('settingsPage'),

    runBtn: byId('runBtn'),
    stopBtn: byId('stopBtn'),

    portfolioTable: byId('portfolioTable')?.querySelector('tbody'),
    addStockBtn: byId('addStockBtn'),
    portfolioPromptInput: byId('portfolioPromptInput'),
    evaluateBtn: byId('evaluateBtn'),
    teaStockBtn: byId('teaStockBtn'),
    teaStockPromptInput: byId('teaStockPromptInput'),
    portfolioModal: byId('portfolioModal'),
    closePortfolioModal: byId('closePortfolioModal'),
    cancelPortfolioBtn: byId('cancelPortfolioBtn'),

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
    realtimeEnabledCheckbox: byId('realtimeEnabledCheckbox'),
    intervalInput: byId('intervalInput'),
    saveBtn: byId('saveBtn'),
    sendBtn: byId('sendBtn'),
    resetBtn: byId('resetBtn'),
    saveStatus: byId('saveStatus'),
    portfolioPromptInput: byId('portfolioPromptInput'),
    stockEvalPromptInput: byId('stockEvalPromptInput'),
    teaStockPromptInput: byId('teaStockPromptInput'),
    contextMenuPromptInput: byId('contextMenuPromptInput'),
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
    
    // English Learning
    englishTopicInput: byId('englishTopicInput'),
    generateSentenceBtn: byId('generateSentenceBtn'),
    englishResultArea: byId('englishResultArea'),
    savedSentencesList: byId('savedSentencesList'),
    englishPromptInput: byId('englishPromptInput'),
  };


  setupNavigation(dom);

  setupResults(dom);
  setupSettings(dom);
  setupBackup(dom);
  setupErrors(dom);
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
    teaStockBtn: dom.teaStockBtn,
    teaStockPromptInput: dom.teaStockPromptInput,
  });
  
  initEnglish({
    englishPage: dom.englishPage,
    englishBtn: dom.englishBtn,
    englishTopicInput: dom.englishTopicInput,
    generateSentenceBtn: dom.generateSentenceBtn,
    englishResultArea: dom.englishResultArea,
    savedSentencesList: dom.savedSentencesList,
  });

  try {
    const message = {
      v: 1,
      type: MESSAGE_TYPES.ENSURE_CHATGPT_OPEN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    };
    chrome.runtime.sendMessage(message);
  } catch {
    // ignore
  }
}

// Start the app
init().catch(error => {
  console.error('[Auth] Failed to initialize app:', error);
});
