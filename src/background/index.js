/**
 * @fileoverview Background Service Worker Entry Point
 * 
 * MV3 CRITICAL ARCHITECTURE:
 * 1. All event listeners MUST be registered SYNCHRONOUSLY at top-level
 * 2. NO async initialization before listener registration
 * 3. Service Worker can be terminated at any time - design for short-lived execution
 * 4. Persist ALL important state in chrome.storage, NOT in-memory
 * 
 * Event-Driven Philosophy:
 * - Background SW is NOT always running
 * - It wakes up on events, handles them, then may be terminated
 * - Think "serverless function", not "long-running server"
 */

import { createLogger } from '../logger.js';
import { onMessage } from '../platform/messaging.js';
import { route } from './messageRouter.js';
import { supabase } from '../supabaseConfig.js'; // GPT-003: Supabase client with chromeStorageAdapter
import './handlers/index.js'; // This will register all handlers

// CRITICAL: Static imports to avoid Vite preload helper injection
// Dynamic imports cause Vite to inject document.* code which fails in Service Worker
import * as contextMenuModule from './handlers/contextMenu.js';
import * as alarmsModule from './handlers/alarms.js';
// ❌ REMOVED: import './handlers/telemetry.js'; (dead code - no telemetry events called)

const logger = createLogger('Background');

// ========== CRITICAL: TOP-LEVEL LISTENER REGISTRATION ==========
// These MUST be at module top-level, not inside async functions!

logger.info('Background service worker starting...');

/**
 * Message listener - handles ALL inter-component communication
 * Registered synchronously at module load
 */
const unsubscribeMessage = onMessage(async (message, sender) => {
  // Route to appropriate handler
  return await route(message, sender);
});

/**
 * Installation handler - runs once when extension is installed/updated
 */
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed/updated', { 
    reason: details.reason,
    previousVersion: details.previousVersion 
  });
  
  // Perform one-time setup
  if (details.reason === 'install') {
    onInstall();
  } else if (details.reason === 'update') {
    onUpdate(details.previousVersion);
  }
});

/**
 * Startup handler - runs when browser starts (if extension was enabled)
 */
chrome.runtime.onStartup.addListener(() => {
  logger.info('Browser started, service worker initialized');
  onStartup();
});

/**
 * Action (toolbar icon) click handler
 */
chrome.action.onClicked.addListener(async (tab) => {
  logger.info('Extension icon clicked', { tabId: tab?.id });
  
  try {
    // Check if sidePanel API is available (Chrome 114+)
    if (!chrome.sidePanel) {
      logger.error('Side panel API not available', { 
        chromeVersion: navigator.userAgent,
        suggestion: 'Please update to Chrome 114 or later'
      });
      return;
    }

    // Validate tab
    if (!tab || !tab.id) {
      logger.error('Invalid tab context', { tab });
      return;
    }

    // Open side panel
    // Note: Don't call setOptions() before open() as it causes the user gesture
    // context to expire. Since we have side_panel.default_path in manifest,
    // we can call open() directly.
    logger.debug('Opening side panel', { tabId: tab.id });
    await chrome.sidePanel.open({ tabId: tab.id });
    logger.info('Side panel opened successfully', { tabId: tab.id });
  } catch (error) {
    // Enhanced error logging
    const errorDetails = {
      message: error?.message || 'Unknown error',
      name: error?.name || 'Error',
      stack: error?.stack?.substring(0, 200),
      tabId: tab?.id,
      errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error))
    };
    
    logger.error('Failed to open side panel', errorDetails);
    
    // Check if it's already open error (not critical)
    if (error?.message?.includes('already') || error?.message?.includes('open')) {
      logger.info('Side panel may already be open');
    }
  }
});

/**
 * Context menu click handler
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  logger.info('Context menu clicked', { 
    menuItemId: info.menuItemId, 
    tabId: tab?.id 
  });
  
  // Delegate to feature handler (using static import to avoid Vite preload helper)
  try {
    contextMenuModule.handleContextMenuClick(info, tab);
  } catch (error) {
    logger.error('Context menu handler failed', { error });
  }
});

/**
 * Alarm handler - for periodic tasks
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  logger.info('Alarm triggered', { name: alarm.name });
  
  // Delegate to feature handler (using static import to avoid Vite preload helper)
  try {
    alarmsModule.handleAlarm(alarm);
  } catch (error) {
    logger.error('Alarm handler failed', { error });
  }
});

// ========== INITIALIZATION HANDLERS (can be async) ==========

/**
 * Handle first-time installation
 * This can be async since it runs AFTER listeners are registered
 */
async function onInstall() {
  logger.info('Performing first-time setup...');
  
  try {
    // Create context menu
    await createContextMenus();
    
    // Setup periodic alarms
    await setupAlarms();
    
    // ✅ Default settings now managed by Supabase (via settings handler)
    // No longer setting defaults in chrome.storage.local
    
    logger.info('First-time setup completed');
  } catch (error) {
    logger.error('First-time setup failed', { error });
  }
}

/**
 * Handle extension update
 */
async function onUpdate(previousVersion) {
  logger.info('Performing update tasks...', { previousVersion });
  
  try {
    // Recreate context menus (in case they changed)
    await createContextMenus();
    
    // Perform any data migration if needed
    // await migrateData(previousVersion);
    
    logger.info('Update tasks completed');
  } catch (error) {
    logger.error('Update tasks failed', { error });
  }
}

/**
 * Handle browser startup
 */
async function onStartup() {
  try {
    // Recreate context menus (they don't persist across browser restarts)
    await createContextMenus();
    
    // Setup periodic alarms
    await setupAlarms();
    
    logger.info('Startup tasks completed');
  } catch (error) {
    logger.error('Startup tasks failed', { error });
  }
}

/**
 * Setup periodic alarms
 * - CHECK: Portfolio price check (5 minutes)
 * - AUTORUN: Auto-run evaluation (configurable interval)
 * 
 * NOTE: This function clears ALL alarms and recreates only CHECK and AUTORUN.
 */
async function setupAlarms() {
  try {
    // IMPORTANT: Only clear specific alarms, not all
    await chrome.alarms.clear('CHECK');
    await chrome.alarms.clear('AUTORUN');
    
    // CHECK alarm - portfolio price updates
    chrome.alarms.create('CHECK', { periodInMinutes: 5 });
    
    // ✅ AUTORUN alarm setup moved to settings handler
    // When user enables autoRun, settings.js will create the alarm
    // This avoids reading from chrome.storage.local (deprecated)
    
    // Clean up legacy/unknown alarms
    await cleanupLegacyAlarms();
    
    // X51LABS-66: HEARTBEAT removed - MV3 service workers should be allowed to sleep
    // Service worker will restart on-demand when needed (alarms, messages, events)
    // Keeping it alive wastes battery and resources
    
    logger.info('Alarms setup completed');
  } catch (error) {
    logger.error('Alarm setup failed', { error });
  }
}

/**
 * Clean up legacy alarms from old versions
 * Known alarms: CHECK, AUTORUN, POLL
 */
async function cleanupLegacyAlarms() {
  try {
    const knownAlarms = ['CHECK', 'AUTORUN', 'POLL'];
    const allAlarms = await chrome.alarms.getAll();
    
    for (const alarm of allAlarms) {
      if (!knownAlarms.includes(alarm.name)) {
        await chrome.alarms.clear(alarm.name);
        logger.info('Cleared legacy alarm', { name: alarm.name });
      }
    }
  } catch (error) {
    logger.warn('Failed to cleanup legacy alarms', { error });
  }
}

/**
 * Create context menus
 * Idempotent - safe to call multiple times
 */
async function createContextMenus() {
  try {
    // Remove all existing menus first
    await chrome.contextMenus.removeAll();
    
    // Create new menu
    chrome.contextMenus.create({
      id: 'chatgpt-assistant-analyze',
      title: 'ChatGPT Assistant - Phân tích',
      contexts: ['selection', 'page']
    });
    
    logger.info('Context menus created');
  } catch (error) {
    // Ignore errors (menu might already exist)
    logger.debug('Context menu creation note', { error: error?.message });
  }
}

// ========== SERVICE WORKER LIFECYCLE LOGGING ==========

/**
 * Log when SW is about to be suspended (for debugging)
 * This is NOT reliable - SW can be terminated without warning
 */
self.addEventListener('beforeunload', () => {
  logger.info('Service worker suspending...');
});

logger.info('Background service worker initialized successfully', {
  timestamp: new Date().toISOString()
});
