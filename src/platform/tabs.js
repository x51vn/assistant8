/**
 * @fileoverview Platform Adapter - Chrome Tabs
 * Wraps chrome.tabs.* APIs
 * Pure I/O layer - no business logic
 */

import { createLogger } from '../logger.js';
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from '../types.js';

const logger = createLogger('Platform/Tabs');

/**
 * Query tabs
 * @param {Object} queryInfo - Query parameters
 * @returns {Promise<ApiResponse>}
 */
export async function queryTabs(queryInfo = {}) {
  const correlationId = logger.startOperation('queryTabs', queryInfo);
  
  try {
    const tabs = await chrome.tabs.query(queryInfo);
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ tabs, count: tabs.length });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Query tabs failed',
      'queryTabs',
      error
    );
  }
}

/**
 * Get specific tab by ID
 * @param {number} tabId - Tab ID
 * @returns {Promise<ApiResponse>}
 */
export async function getTab(tabId) {
  const correlationId = logger.startOperation('getTab');
  
  try {
    const tab = await chrome.tabs.get(tabId);
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ tab });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.TAB_NOT_FOUND,
      error?.message || 'Tab not found',
      'getTab',
      { tabId }
    );
  }
}

/**
 * Create a new tab
 * @param {Object} createProperties - Tab creation properties
 * @returns {Promise<ApiResponse>}
 */
export async function createTab(createProperties) {
  const correlationId = logger.startOperation('createTab', createProperties);
  
  try {
    const tab = await chrome.tabs.create(createProperties);
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ tab });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Create tab failed',
      'createTab',
      error
    );
  }
}

/**
 * Update tab properties
 * @param {number} tabId - Tab ID
 * @param {Object} updateProperties - Properties to update
 * @returns {Promise<ApiResponse>}
 */
export async function updateTab(tabId, updateProperties) {
  const correlationId = logger.startOperation('updateTab');
  
  try {
    const tab = await chrome.tabs.update(tabId, updateProperties);
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ tab });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Update tab failed',
      'updateTab',
      { tabId }
    );
  }
}

/**
 * Close tab(s)
 * @param {number|number[]} tabIds - Tab ID(s) to close
 * @returns {Promise<ApiResponse>}
 */
export async function closeTabs(tabIds) {
  const correlationId = logger.startOperation('closeTabs');
  
  try {
    await chrome.tabs.remove(tabIds);
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ 
      closed: Array.isArray(tabIds) ? tabIds.length : 1 
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Close tabs failed',
      'closeTabs',
      { tabIds }
    );
  }
}

/**
 * Reload tab
 * @param {number} tabId - Tab ID
 * @param {Object} [reloadProperties] - Reload options
 * @returns {Promise<ApiResponse>}
 */
export async function reloadTab(tabId, reloadProperties = {}) {
  const correlationId = logger.startOperation('reloadTab');
  
  try {
    await chrome.tabs.reload(tabId, reloadProperties);
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ message: 'Tab reloaded' });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Reload tab failed',
      'reloadTab',
      { tabId }
    );
  }
}

/**
 * Execute script in tab
 * @param {number} tabId - Tab ID
 * @param {Object} injection - Script injection details
 * @returns {Promise<ApiResponse>}
 */
export async function executeScript(tabId, injection) {
  const correlationId = logger.startOperation('executeScript');
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      ...injection
    });
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ results });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Execute script failed',
      'executeScript',
      { tabId }
    );
  }
}

/**
 * Listen for tab updates
 * Must be called at top-level (MV3 requirement)
 * 
 * @param {Function} callback - (tabId, changeInfo, tab) => void
 * @returns {Function} Unsubscribe function
 */
export function onTabUpdated(callback) {
  const listener = (tabId, changeInfo, tab) => {
    logger.debug('Tab updated', { tabId, status: changeInfo.status, url: tab.url });
    callback(tabId, changeInfo, tab);
  };
  
  chrome.tabs.onUpdated.addListener(listener);
  logger.info('Tab update listener registered');
  
  return () => {
    chrome.tabs.onUpdated.removeListener(listener);
    logger.info('Tab update listener removed');
  };
}

/**
 * Listen for tab activation
 * Must be called at top-level (MV3 requirement)
 * 
 * @param {Function} callback - (activeInfo) => void
 * @returns {Function} Unsubscribe function
 */
export function onTabActivated(callback) {
  const listener = (activeInfo) => {
    logger.debug('Tab activated', { tabId: activeInfo.tabId });
    callback(activeInfo);
  };
  
  chrome.tabs.onActivated.addListener(listener);
  logger.info('Tab activated listener registered');
  
  return () => {
    chrome.tabs.onActivated.removeListener(listener);
    logger.info('Tab activated listener removed');
  };
}

/**
 * Listen for tab removal
 * Must be called at top-level (MV3 requirement)
 * 
 * @param {Function} callback - (tabId, removeInfo) => void
 * @returns {Function} Unsubscribe function
 */
export function onTabRemoved(callback) {
  const listener = (tabId, removeInfo) => {
    logger.debug('Tab removed', { tabId });
    callback(tabId, removeInfo);
  };
  
  chrome.tabs.onRemoved.addListener(listener);
  logger.info('Tab removed listener registered');
  
  return () => {
    chrome.tabs.onRemoved.removeListener(listener);
    logger.info('Tab removed listener removed');
  };
}
