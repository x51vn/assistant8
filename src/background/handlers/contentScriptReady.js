/**
 * @fileoverview Content Script Readiness Handler
 * Manages the registry of content scripts that have signaled readiness
 * 
 * Ticket: X51LABS-157-001 - Create Content Script Ready Handler
 * 
 * Architecture:
 * - Maintains a registry (Map) of which tabs have ready content scripts
 * - Handles 'content_script_ready' messages from content.js
 * - Provides O(1) lookup to avoid polling
 * - Cleans up entries when tabs close (via chrome.tabs.onRemoved)
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';

const logger = createLogger('Handlers/ContentScriptReady');

/**
 * @typedef {Object} ReadyStatus
 * @property {boolean} ready - Whether content script is ready
 * @property {number} timestamp - When the ready signal was received
 * @property {string} url - Content script's tab URL
 * @property {string} hostname - Content script's tab hostname
 * @property {boolean} markerSet - Whether window.__ChatGPTAssistantReady was set
 * @property {number} receivedAt - When the status was received (server-side)
 */

/**
 * Global registry: Map<tabId, ReadyStatus>
 * Stores which content scripts are ready for communication
 * 
 * Key: Tab ID (number)
 * Value: ReadyStatus object with timing and metadata
 * 
 * Lifecycle:
 * - Entry added when content_script_ready message received
 * - Entry removed when tab closes (chrome.tabs.onRemoved)
 * - Entry removed on extension reload
 */
export const contentScriptReadyRegistry = new Map();

/**
 * Handle 'content_script_ready' message from content script
 * 
 * Incoming message structure:
 * {
 *   type: 'CONTENT_SCRIPT_READY',
 *   url: 'https://chatgpt.com/...',
 *   hostname: 'chatgpt.com',
 *   timestamp: 1234567890,
 *   markerSet: true
 * }
 */
registerHandler(MESSAGE_TYPES.CONTENT_SCRIPT_READY, async (message, sender) => {
  const tabId = sender?.tab?.id;
  const correlationId = message.correlationId;
  
  if (!tabId) {
    logger.warn('content_script_ready: Missing tab ID', { correlationId });
    return createErrorResponse(
      message,
      ERROR_CODES.INVALID_TAB_ID,
      'Could not determine tab ID from sender'
    );
  }
  
  // Extract readiness data from message
  const readyStatus = {
    ready: true,
    timestamp: message.timestamp || Date.now(),
    url: message.url || sender.tab?.url || 'unknown',
    hostname: message.hostname || 'unknown',
    markerSet: message.markerSet ?? true,
    receivedAt: Date.now() // Server timestamp
  };
  
  // Store in registry
  contentScriptReadyRegistry.set(tabId, readyStatus);
  
  logger.info('Content script ready signal received', {
    correlationId,
    tabId,
    hostname: readyStatus.hostname,
    markerSet: readyStatus.markerSet,
    url: readyStatus.url
  });
  
  // Acknowledge receipt
  return createResponse(message, MESSAGE_TYPES.CONTENT_SCRIPT_READY, {
    success: true,
    tabId,
    acknowledged: true,
    registrySize: contentScriptReadyRegistry.size
  });
});

/**
 * Check if a content script is ready (O(1) lookup)
 * 
 * @param {number} tabId - Tab ID to check
 * @returns {boolean} True if content script is ready
 */
export function isContentScriptReady(tabId) {
  const status = contentScriptReadyRegistry.get(tabId);
  return status?.ready ?? false;
}

/**
 * Get the readiness status for a tab
 * 
 * @param {number} tabId - Tab ID to check
 * @returns {ReadyStatus | undefined} Status object or undefined if not found
 */
export function getContentScriptStatus(tabId) {
  return contentScriptReadyRegistry.get(tabId);
}

/**
 * Clear readiness status for a tab
 * Called when tab closes or needs reset
 * 
 * @param {number} tabId - Tab ID to clear
 */
export function clearContentScriptStatus(tabId) {
  if (contentScriptReadyRegistry.has(tabId)) {
    contentScriptReadyRegistry.delete(tabId);
    logger.debug('Cleared content script status', { tabId, registrySize: contentScriptReadyRegistry.size });
  }
}

/**
 * Clear entire registry (for testing or extension reload)
 */
export function clearAllContentScriptStatus() {
  const size = contentScriptReadyRegistry.size;
  contentScriptReadyRegistry.clear();
  logger.info('Cleared all content script statuses', { clearedCount: size });
}

/**
 * Re-initialize registry after Service Worker restart
 * Queries all ChatGPT tabs and pings them to restore registry state
 * 
 * Called on extension startup to detect already-loaded content scripts
 */
export async function reinitializeContentScriptRegistry() {
  try {
    // Clear any stale entries
    const oldSize = contentScriptReadyRegistry.size;
    contentScriptReadyRegistry.clear();
    
    logger.info('Reinitializing content script registry', { clearedStaleEntries: oldSize });
    
    // Query all tabs with ChatGPT URLs
    const allTabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    
    if (allTabs.length === 0) {
      logger.debug('No ChatGPT tabs found during re-initialization');
      return;
    }
    
    logger.info('Found ChatGPT tabs to re-initialize', { tabCount: allTabs.length });
    
    // Ping each tab to restore their ready status
    // (content script will respond with CONTENT_SCRIPT_READY if it's loaded)
    const pingPromises = allTabs.map(tab => {
      return chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'PING',
          action: 'ping',
          reason: 'sw_reinitialize'
        }
      ).catch(err => {
        // Content script may not be ready yet - that's expected
        logger.debug('Ping failed during re-init', { tabId: tab.id, error: err.message });
      });
    });
    
    // Wait for all pings (with some timeout)
    await Promise.allSettled(pingPromises);
    
    logger.info('Content script registry re-initialization complete', { 
      registrySize: contentScriptReadyRegistry.size,
      totalTabs: allTabs.length
    });
    
  } catch (error) {
    logger.error('Failed to reinitialize content script registry', {
      error: error.message
    });
    // Don't throw - SW startup should not be blocked
  }
}

/**
 * Initialize registry on Service Worker startup
 * Should be called shortly after background/index.js loads
 */
export async function initializeOnStartup() {
  // Delay slightly to allow other handlers to register first
  setTimeout(async () => {
    logger.info('Running startup initialization for content script registry');
    await reinitializeContentScriptRegistry();
  }, 1000);
}

// Log handler registration
logger.info('contentScriptReady handler registered');
