/**
 * Global Constants for ChatGPT Assistant
 * Centralized definition of all magic strings and configuration values
 * Follows: Single Source of Truth principle
 */

// ========== STORAGE KEYS ==========
export const STORAGE_KEYS = {
  // Portfolio
  PORTFOLIO: 'portfolio',
  PORTFOLIO_PROMPT: 'portfolioPrompt',
  PORTFOLIO_PRICES: 'portfolioPrices',

  // Results & History
  RUNS: 'runs',
  CHAT_HISTORY: 'chatHistory',
  LAST_RESULT: 'lastResult',
  LAST_RUN_ID: 'lastRunId',

  // Errors & Retrospective
  ERROR_LIST: 'errorList',
  ERRORS: 'errors',

  // Settings & Config
  SETTINGS: 'settings',
  PROMPTS: 'prompts',
  PROMPT_INPUT: 'promptInput',
  STOCK_EVAL_PROMPT: 'stockEvalPrompt',
  TEA_STOCK_PROMPT: 'teaStockPrompt',
  CONTEXT_MENU_PROMPT: 'contextMenuPrompt',

  // Templates
  PROMPT_TEMPLATES: 'promptTemplates',

  // Notes
  NOTES: 'notes',

  // Realtime & Market Data
  REALTIME_ENABLED: 'realtimeEnabled',
  REALTIME_INTERVAL: 'realtimeInterval',
  PORTFOLIO_PRICES_TIMESTAMP: 'portfolioPricesTimestamp',
};

// ========== LIMITS ==========
export const LIMITS = {
  MAX_RUNS: 50,
  MAX_CHAT_HISTORY: 100,
  MAX_ERRORS: 50,
  MAX_TEMPLATES: 100,
  MAX_BACKUPS: 10,
};

// ========== ALARMS ==========
export const ALARMS = {
  CHECK: 'checkChatGPT',
  AUTORUN: 'autoRunPrompt',
  POLL: 'pollResult',
  SYNC: 'periodicSync',
};

// ========== TIMEOUTS ==========
export const TIMEOUTS = {
  EDITOR_FIND: 25000, // ms
  GET_RESULT: 15 * 60 * 1000, // 15 minutes
  SEND_TIMEOUT: 30000, // ms
  RESPONSE_STABLE: 1500, // ms
  API_CALL: 10000, // ms
};

// ========== DEFAULTS ==========
export const DEFAULTS = {
  PROMPT: '',
  AUTO_RUN: false,
  INTERVAL: 5, // minutes
  EVALUATE_PREVIOUS: false,
  REVIEW_PROMPT: false,
  REALTIME_INTERVAL: 800, // ms
  SYNC_INTERVAL: 60, // minutes
};

// ========== ERROR TYPES ==========
export const ERROR_TYPES = {
  GENERAL: 'general',
  PROMPT: 'prompt',
  RESPONSE: 'response',
  CONNECTION: 'connection',
  TIMEOUT: 'timeout',
};

// ========== SEVERITY LEVELS ==========
export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ========== CLASS NAMES ==========
export const CSS_CLASSES = {
  ACTIVE: 'active',
  HIDDEN: 'hidden',
  STATUS_SUCCESS: 'success',
  STATUS_ERROR: 'error',
  STATUS_INFO: 'info',
  STATUS_WARNING: 'warning',
};

// ========== MESSAGE ACTIONS ==========
export const MESSAGE_ACTIONS = {
  // Chat operations
  INPUT_PROMPT: 'input_prompt',
  SEND_INPUT: 'send_input',
  GET_OUTPUT: 'get_output',
  GET_RESULT: 'get_result',
  SEND_PROMPT: 'send_prompt',

  // Session management
  CREATE_NEW_SESSION: 'create_new_session',
  CHECK_RESPONSE_STATUS: 'check_response_status',
  GET_CHAT_METADATA: 'get_chat_metadata',
  GET_MESSAGE_COUNT: 'get_message_count',
  CLEAR_CONVERSATION: 'clear_conversation',
  ENSURE_CHATGPT_OPEN: 'ensure_chatgpt_open',

  // Firebase Auth
  FIREBASE_LOGIN: 'firebase_login',
  FIREBASE_LOGOUT: 'firebase_logout',
  GET_CURRENT_USER: 'get_current_user',

  // Sync & Backup
  SYNC_TO_FIRESTORE: 'sync_to_firestore',
  SYNC_TO_DRIVE: 'sync_to_drive',
  RESTORE_FROM_DRIVE: 'restore_from_drive',

  // Status callbacks
  PROMPT_SENT: 'prompt_sent',
  PROMPT_FAILED: 'prompt_failed',
};

// ========== FIREBASE PATHS ==========
export const FIREBASE_PATHS = {
  USERS: 'users',
  BACKUPS: 'backups',
  BACKUPS_LATEST: 'latest',
  CONFIG: 'config',
  CONFIG_LATEST_BACKUP: 'latestBackup',
};

// ========== CHROMEEXTENSION IDS ==========
export const CHROME_EXTENSION = {
  MIN_MANIFEST_VERSION: 3,
  PERMISSIONS_REQUIRED: [
    'scripting',
    'activeTab',
    'tabGroups',
    'tabs',
    'storage',
    'identity',
  ],
};

// ========== UI DEFAULTS ==========
export const UI_DEFAULTS = {
  ICON_SIZE: 18,
  BUTTON_PADDING: '10px 16px',
  BORDER_RADIUS: '6px',
  TRANSITION_DURATION: '300ms',
};

// ========== COLORS (Theme) ==========
export const THEME_COLORS = {
  PRIMARY: '#667eea',
  SECONDARY: '#764ba2',
  SUCCESS: '#28a745',
  ERROR: '#dc3545',
  WARNING: '#ffc107',
  INFO: '#17a2b8',
  LIGHT_BG: '#f9f9f9',
  BORDER: '#e0e0e0',
};
