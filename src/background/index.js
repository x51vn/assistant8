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
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { flushChatHistoryOutbox } from './services/chatHistoryService.js';
import './handlers/index.js'; // This will register all handlers

// CRITICAL: Static imports to avoid Vite preload helper injection
// Dynamic imports cause Vite to inject document.* code which fails in Service Worker
import * as contextMenuModule from './handlers/contextMenu.js';
import * as alarmsModule from './handlers/alarms.js';
import * as contentScriptReadyModule from './handlers/contentScriptReady.js'; // X51LABS-157
import * as sessionManagerModule from './handlers/sessionManager.js'; // X51LABS-XXX: Session expiration handling

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

// X51LABS-156: Store extension reload marker for debugging
// Helps detect when extension is reloaded without content script being re-injected
const EXTENSION_START_MARKER = `extension_start_${Date.now()}`;
chrome.storage.local.set({ 
  'x51labs_extension_start_marker': EXTENSION_START_MARKER
}).catch(err => {
  logger.warn('Failed to store extension start marker', { error: err.message });
});

// Force session restoration when Service Worker starts
// This ensures user stays logged in after Service Worker reload
logger.info('Service Worker loaded - attempting to restore session...');
// Note: Wrap in setTimeout to avoid blocking message routing
setTimeout(() => {
  restoreSession('sw_start').catch(error => {
    logger.error('Failed to restore session on SW start', { 
      error: error.message 
    });
  });
}, 100);

// ✅ NEW (XST-687): Re-initialize content script registry after SW restart
// This restores knowledge of which tabs have content scripts loaded
// Delay 1000ms to allow content scripts to settle after page load
setTimeout(() => {
  contentScriptReadyModule.initializeOnStartup().catch(error => {
    logger.error('Failed to initialize content script registry on SW start', { 
      error: error.message 
    });
  });
}, 1000);

// Option A: Flush any queued chat_history items on startup (best-effort).
// This helps when prompts/responses were captured while offline or before login.
setTimeout(() => {
  flushChatHistoryOutbox({ reason: 'startup' }).catch(error => {
    logger.warn('Failed to flush chat_history outbox on startup', {
      error: error?.message || String(error)
    });
  });
}, 2000);

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

/**
 * Tab removed handler - cleanup content script ready status
 * X51LABS-157: Prevents memory leaks in contentScriptReady registry
 */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  logger.debug('Tab closed, cleaning up content script status', { 
    tabId, 
    isWindowClosing: removeInfo.isWindowClosing 
  });
  
  try {
    // Use static import (already imported at top of file)
    contentScriptReadyModule.clearContentScriptStatus(tabId);
  } catch (error) {
    logger.error('Failed to clear content script status on tab close', { 
      tabId, 
      error: error.message 
    });
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
    
    // Force session restoration on startup
    await restoreSession('browser_startup');
    
    logger.info('Startup tasks completed');
  } catch (error) {
    logger.error('Startup tasks failed', { error });
  }
}

/**
 * Restore auth session from chrome.storage.local.
 * Called on both SW restart and browser startup.
 * If token is expired, attempts an automatic refresh so the user
 * never has to re-login as long as a valid refresh_token exists.
 *
 * @param {'sw_start'|'browser_startup'} reason
 */
async function restoreSession(reason = 'sw_start') {
  try {
    logger.info(`Restoring session (${reason})...`);
    
    // Read session from chrome.storage.local (via adapter)
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      logger.warn('Failed to read session', { reason, error: error.message });
      return;
    }
    
    if (!session) {
      logger.info('No session found - user needs to login', { reason });
      return;
    }
    
    // Check if token is expired / expiring → refresh proactively
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at || 0;
    if (expiresAt - nowSec < 120) {
      logger.info('Token expired or expiring soon, refreshing', { reason, secondsLeft: expiresAt - nowSec });
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logger.warn('Session refresh failed on restore', { reason, error: refreshError.message });
        // Token is dead — broadcast will still carry the old session
        // so the UI can show "session expired" gracefully
      } else if (refreshData?.session) {
        logger.info('Session refreshed successfully on restore', { reason });
        // The onAuthStateChange listener in supabaseAuth.js will broadcast
        // AUTH_STATE_CHANGED automatically — no duplicate broadcast needed
        return;
      }
    }
    
    logger.info('Session restored', {
      reason,
      userId: session.user?.id,
      email: session.user?.email,
      expiresAt: new Date(expiresAt * 1000).toLocaleString()
    });
    
    // Broadcast to UI (if open)
    chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.AUTH_STATE_CHANGED,
      correlationId: `auth-restore-${reason}-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email
        }
      }
    }).catch(broadcastError => {
      if (broadcastError?.message?.includes('Receiving end does not exist')) {
        logger.debug('UI not open - session will restore when UI loads');
      } else {
        logger.warn('Auth broadcast failed', { error: broadcastError?.message });
      }
    });
  } catch (error) {
    logger.error('Session restoration failed', { reason, error: error.message });
  }
}

/**
 * Setup periodic alarms
 * - CHECK: Portfolio price check (5 minutes)
 * - AUTORUN: Auto-run evaluation (configurable interval)
 * - COMMODITY: Gold & Crypto price updates (15 minutes, 24/7)
 * - SESSION_CHECK: Session expiration check (1 minute) - X51LABS-XXX
 * 
 * NOTE: This function clears ALL alarms and recreates only CHECK and AUTORUN.
 */
async function setupAlarms() {
  try {
    // Clean up legacy/unknown alarms before (re)creating known alarms
    await cleanupLegacyAlarms([
      'CHECK',
      'AUTORUN',
      'updateCommodityPrices',
      'watchlistPriceUpdate',
      'SESSION_CHECK',
      'promptImprovementPurge'
    ]);

    // CHECK alarm - portfolio price updates (stocks, during market hours)
    chrome.alarms.create('CHECK', { periodInMinutes: 5 });

    // ✅ NEW: Commodity (gold/crypto) price updates - runs 24/7, every 15 minutes
    // Gold and crypto markets operate 24/7, not restricted to VN market hours
    chrome.alarms.create('updateCommodityPrices', { periodInMinutes: 15 });

    // ✅ XST-744: Watchlist price updates - runs every 5 minutes (market hours only)
    // Handler checks market hours before fetching (9:00-15:00 VN weekdays)
    chrome.alarms.create('watchlistPriceUpdate', { periodInMinutes: 5 });

    // ✅ NEW: Session expiration check - runs every 1 minute
    // Proactively checks if session is about to expire
    // Allows graceful handling instead of sudden logout
    chrome.alarms.create('SESSION_CHECK', { periodInMinutes: 1 });

    // ✅ Prompt Improvement purge - runs daily (every 24h)
    // Purges expired prompt_runs (7 days) and archived prompt_lessons
    chrome.alarms.create('promptImprovementPurge', { periodInMinutes: 1440 });

    // ✅ AUTORUN alarm setup moved to settings handler
    // When user enables autoRun, settings.js will create the alarm
    // This avoids reading from chrome.storage.local (deprecated)

    // X51LABS-66: HEARTBEAT removed - MV3 service workers should be allowed to sleep
    // Service worker will restart on-demand when needed (alarms, messages, events)
    // Keeping it alive wastes battery and resources

    logger.info('Alarms setup completed (CHECK: 5min, COMMODITY: 15min, WATCHLIST: 5min, SESSION_CHECK: 1min, PURGE: daily)');
  } catch (error) {
    logger.error('Alarm setup failed', { error });
  }
}

// restoreSessionOnServiceWorkerStart removed — consolidated into restoreSession()

/**
 * Clean up legacy alarms from old versions
 * Known alarms: CHECK, AUTORUN, POLL
 */
async function cleanupLegacyAlarms(knownAlarms = null) {
  try {
    const known = Array.isArray(knownAlarms)
      ? knownAlarms
      : ['CHECK', 'AUTORUN', 'updateCommodityPrices', 'watchlistPriceUpdate', 'SESSION_CHECK'];
    const allAlarms = await chrome.alarms.getAll();
    
    for (const alarm of allAlarms) {
      if (!known.includes(alarm.name)) {
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
 * Delegated to contextMenu module for submenu structure.
 * Idempotent - safe to call multiple times.
 */
async function createContextMenus() {
  try {
    await contextMenuModule.createContextMenus();
    logger.info('Context menus created (delegated to contextMenu module)');
  } catch (error) {
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
