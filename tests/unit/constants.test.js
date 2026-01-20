import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEYS,
  LIMITS,
  ALARMS,
  TIMEOUTS,
  DEFAULTS,
  ERROR_TYPES,
  SEVERITY,
  CSS_CLASSES,
  MESSAGE_ACTIONS,
  FIREBASE_PATHS,
  CHROME_EXTENSION,
  UI_DEFAULTS,
  THEME_COLORS
} from '../../src/constants.js';

describe('constants.js', () => {
  describe('STORAGE_KEYS', () => {
    it('should define all storage keys', () => {
      expect(STORAGE_KEYS.PORTFOLIO).toBe('portfolio');
      expect(STORAGE_KEYS.PORTFOLIO_PROMPT).toBe('portfolioPrompt');
      expect(STORAGE_KEYS.PORTFOLIO_PRICES).toBe('portfolioPrices');
      expect(STORAGE_KEYS.RUNS).toBe('runs');
      expect(STORAGE_KEYS.CHAT_HISTORY).toBe('chatHistory');
      expect(STORAGE_KEYS.LAST_RESULT).toBe('lastResult');
      expect(STORAGE_KEYS.LAST_RUN_ID).toBe('lastRunId');
      expect(STORAGE_KEYS.ERROR_LIST).toBe('errorList');
      expect(STORAGE_KEYS.ERRORS).toBe('errors');
      expect(STORAGE_KEYS.SETTINGS).toBe('settings');
      expect(STORAGE_KEYS.PROMPTS).toBe('prompts');
      expect(STORAGE_KEYS.PROMPT_INPUT).toBe('promptInput');
      expect(STORAGE_KEYS.STOCK_EVAL_PROMPT).toBe('stockEvalPrompt');
      expect(STORAGE_KEYS.TEA_STOCK_PROMPT).toBe('teaStockPrompt');
      expect(STORAGE_KEYS.CONTEXT_MENU_PROMPT).toBe('contextMenuPrompt');
      expect(STORAGE_KEYS.PROMPT_TEMPLATES).toBe('promptTemplates');
      expect(STORAGE_KEYS.NOTES).toBe('notes');
      expect(STORAGE_KEYS.REALTIME_ENABLED).toBe('realtimeEnabled');
      expect(STORAGE_KEYS.REALTIME_INTERVAL).toBe('realtimeInterval');
      expect(STORAGE_KEYS.PORTFOLIO_PRICES_TIMESTAMP).toBe('portfolioPricesTimestamp');
    });

    it('should have unique values', () => {
      const values = Object.values(STORAGE_KEYS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('LIMITS', () => {
    it('should define all limit values', () => {
      expect(LIMITS.MAX_RUNS).toBe(50);
      expect(LIMITS.MAX_CHAT_HISTORY).toBe(100);
      expect(LIMITS.MAX_ERRORS).toBe(50);
      expect(LIMITS.MAX_TEMPLATES).toBe(100);
      expect(LIMITS.MAX_BACKUPS).toBe(10);
    });

    it('should have positive integer limits', () => {
      Object.values(LIMITS).forEach(limit => {
        expect(limit).toBeGreaterThan(0);
        expect(Number.isInteger(limit)).toBe(true);
      });
    });
  });

  describe('ALARMS', () => {
    it('should define all alarm types', () => {
      expect(ALARMS.CHECK).toBe('checkChatGPT');
      expect(ALARMS.AUTORUN).toBe('autoRunPrompt');
      expect(ALARMS.POLL).toBe('pollResult');
      expect(ALARMS.SYNC).toBe('periodicSync');
    });

    it('should have unique alarm names', () => {
      const values = Object.values(ALARMS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('TIMEOUTS', () => {
    it('should define all timeout values', () => {
      expect(TIMEOUTS.EDITOR_FIND).toBe(25000);
      expect(TIMEOUTS.GET_RESULT).toBe(15 * 60 * 1000);
      expect(TIMEOUTS.SEND_TIMEOUT).toBe(30000);
      expect(TIMEOUTS.RESPONSE_STABLE).toBe(1500);
      expect(TIMEOUTS.API_CALL).toBe(10000);
    });

    it('should have positive timeout values', () => {
      Object.values(TIMEOUTS).forEach(timeout => {
        expect(timeout).toBeGreaterThan(0);
        expect(Number.isInteger(timeout)).toBe(true);
      });
    });
  });

  describe('DEFAULTS', () => {
    it('should define all default values', () => {
      expect(DEFAULTS.PROMPT).toBe('');
      expect(DEFAULTS.AUTO_RUN).toBe(false);
      expect(DEFAULTS.INTERVAL).toBe(5);
      expect(DEFAULTS.EVALUATE_PREVIOUS).toBe(false);
      expect(DEFAULTS.REVIEW_PROMPT).toBe(false);
      expect(DEFAULTS.REALTIME_INTERVAL).toBe(800);
      expect(DEFAULTS.SYNC_INTERVAL).toBe(60);
    });
  });

  describe('ERROR_TYPES', () => {
    it('should define all error types', () => {
      expect(ERROR_TYPES.GENERAL).toBe('general');
      expect(ERROR_TYPES.PROMPT).toBe('prompt');
      expect(ERROR_TYPES.RESPONSE).toBe('response');
      expect(ERROR_TYPES.CONNECTION).toBe('connection');
      expect(ERROR_TYPES.TIMEOUT).toBe('timeout');
    });
  });

  describe('SEVERITY', () => {
    it('should define all severity levels', () => {
      expect(SEVERITY.LOW).toBe('low');
      expect(SEVERITY.MEDIUM).toBe('medium');
      expect(SEVERITY.HIGH).toBe('high');
      expect(SEVERITY.CRITICAL).toBe('critical');
    });
  });

  describe('CSS_CLASSES', () => {
    it('should define all CSS class names', () => {
      expect(CSS_CLASSES.ACTIVE).toBe('active');
      expect(CSS_CLASSES.HIDDEN).toBe('hidden');
      expect(CSS_CLASSES.STATUS_SUCCESS).toBe('success');
      expect(CSS_CLASSES.STATUS_ERROR).toBe('error');
      expect(CSS_CLASSES.STATUS_INFO).toBe('info');
      expect(CSS_CLASSES.STATUS_WARNING).toBe('warning');
    });
  });

  describe('MESSAGE_ACTIONS', () => {
    it('should define all message actions', () => {
      expect(MESSAGE_ACTIONS.INPUT_PROMPT).toBe('input_prompt');
      expect(MESSAGE_ACTIONS.SEND_INPUT).toBe('send_input');
      expect(MESSAGE_ACTIONS.GET_OUTPUT).toBe('get_output');
      expect(MESSAGE_ACTIONS.GET_RESULT).toBe('get_result');
      expect(MESSAGE_ACTIONS.SEND_PROMPT).toBe('send_prompt');
      expect(MESSAGE_ACTIONS.CREATE_NEW_SESSION).toBe('create_new_session');
      expect(MESSAGE_ACTIONS.CHECK_RESPONSE_STATUS).toBe('check_response_status');
      expect(MESSAGE_ACTIONS.GET_CHAT_METADATA).toBe('get_chat_metadata');
      expect(MESSAGE_ACTIONS.GET_MESSAGE_COUNT).toBe('get_message_count');
      expect(MESSAGE_ACTIONS.CLEAR_CONVERSATION).toBe('clear_conversation');
      expect(MESSAGE_ACTIONS.ENSURE_CHATGPT_OPEN).toBe('ensure_chatgpt_open');
      expect(MESSAGE_ACTIONS.FIREBASE_LOGIN).toBe('firebase_login');
      expect(MESSAGE_ACTIONS.FIREBASE_LOGOUT).toBe('firebase_logout');
      expect(MESSAGE_ACTIONS.GET_CURRENT_USER).toBe('get_current_user');
      expect(MESSAGE_ACTIONS.SYNC_TO_FIRESTORE).toBe('sync_to_firestore');
      expect(MESSAGE_ACTIONS.SYNC_TO_DRIVE).toBe('sync_to_drive');
      expect(MESSAGE_ACTIONS.RESTORE_FROM_DRIVE).toBe('restore_from_drive');
      expect(MESSAGE_ACTIONS.PROMPT_SENT).toBe('prompt_sent');
      expect(MESSAGE_ACTIONS.PROMPT_FAILED).toBe('prompt_failed');
    });

    it('should have unique action names', () => {
      const values = Object.values(MESSAGE_ACTIONS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });
  });

  describe('FIREBASE_PATHS', () => {
    it('should define all Firebase paths', () => {
      expect(FIREBASE_PATHS.USERS).toBe('users');
      expect(FIREBASE_PATHS.BACKUPS).toBe('backups');
      expect(FIREBASE_PATHS.BACKUPS_LATEST).toBe('latest');
      expect(FIREBASE_PATHS.CONFIG).toBe('config');
      expect(FIREBASE_PATHS.CONFIG_LATEST_BACKUP).toBe('latestBackup');
    });
  });

  describe('CHROME_EXTENSION', () => {
    it('should define Chrome extension config', () => {
      expect(CHROME_EXTENSION.MIN_MANIFEST_VERSION).toBe(3);
      expect(Array.isArray(CHROME_EXTENSION.PERMISSIONS_REQUIRED)).toBe(true);
      expect(CHROME_EXTENSION.PERMISSIONS_REQUIRED).toContain('scripting');
      expect(CHROME_EXTENSION.PERMISSIONS_REQUIRED).toContain('activeTab');
      expect(CHROME_EXTENSION.PERMISSIONS_REQUIRED).toContain('tabGroups');
      expect(CHROME_EXTENSION.PERMISSIONS_REQUIRED).toContain('tabs');
      expect(CHROME_EXTENSION.PERMISSIONS_REQUIRED).toContain('storage');
      expect(CHROME_EXTENSION.PERMISSIONS_REQUIRED).toContain('identity');
    });
  });

  describe('UI_DEFAULTS', () => {
    it('should define all UI defaults', () => {
      expect(UI_DEFAULTS.ICON_SIZE).toBe(18);
      expect(UI_DEFAULTS.BUTTON_PADDING).toBe('10px 16px');
      expect(UI_DEFAULTS.BORDER_RADIUS).toBe('6px');
      expect(UI_DEFAULTS.TRANSITION_DURATION).toBe('300ms');
    });
  });

  describe('THEME_COLORS', () => {
    it('should define all theme colors', () => {
      expect(THEME_COLORS.PRIMARY).toBe('#667eea');
      expect(THEME_COLORS.SECONDARY).toBe('#764ba2');
      expect(THEME_COLORS.SUCCESS).toBe('#28a745');
      expect(THEME_COLORS.ERROR).toBe('#dc3545');
      expect(THEME_COLORS.WARNING).toBe('#ffc107');
      expect(THEME_COLORS.INFO).toBe('#17a2b8');
      expect(THEME_COLORS.LIGHT_BG).toBe('#f9f9f9');
      expect(THEME_COLORS.BORDER).toBe('#e0e0e0');
    });

    it('should have valid hex color values', () => {
      Object.values(THEME_COLORS).forEach(color => {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  });
});
