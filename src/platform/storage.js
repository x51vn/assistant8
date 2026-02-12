/**
 * @fileoverview Platform Adapter - Chrome Storage
 * Wraps chrome.storage.* APIs for testability and abstraction
 * Core logic should depend on this interface, not chrome.storage directly
 * 
 * Benefits:
 * - Easy to mock in tests
 * - Can switch storage backend without changing business logic
 * - Centralized error handling
 */

import { createLogger } from '../logger.js';
import { createDataResponse, createApiErrorResponse, ERROR_CODES } from '../types.js';

const logger = createLogger('Platform/Storage');

/**
 * Storage area types
 */
export const StorageArea = {
  LOCAL: 'local',
  SYNC: 'sync',
  SESSION: 'session'
};

/**
 * Get items from storage
 * @param {string|string[]|null} keys - Keys to get, or null for all
 * @param {string} [area='local'] - Storage area
 * @returns {Promise<ApiResponse>}
 */
export async function storageGet(keys = null, area = StorageArea.LOCAL) {
  const correlationId = logger.startOperation('storageGet');
  
  try {
    const storage = chrome.storage[area];
    if (!storage) {
      return createApiErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        `Invalid storage area: ${area}`,
        'storageGet'
      );
    }
    
    const data = await storage.get(keys);
    logger.endOperation(correlationId, 'success');
    return createDataResponse(data);
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createApiErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Storage get failed',
      'storageGet',
      error
    );
  }
}

/**
 * Set items in storage
 * @param {Object} items - Key-value pairs to set
 * @param {string} [area='local'] - Storage area
 * @returns {Promise<ApiResponse>}
 */
export async function storageSet(items, area = StorageArea.LOCAL) {
  const correlationId = logger.startOperation('storageSet');
  
  try {
    const storage = chrome.storage[area];
    if (!storage) {
      return createApiErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        `Invalid storage area: ${area}`,
        'storageSet'
      );
    }
    
    await storage.set(items);
    logger.endOperation(correlationId, 'success');
    return createDataResponse({ keysSet: Object.keys(items).length });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createApiErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Storage set failed',
      'storageSet',
      error
    );
  }
}

/**
 * Remove items from storage
 * @param {string|string[]} keys - Keys to remove
 * @param {string} [area='local'] - Storage area
 * @returns {Promise<ApiResponse>}
 */
export async function storageRemove(keys, area = StorageArea.LOCAL) {
  const correlationId = logger.startOperation('storageRemove');
  
  try {
    const storage = chrome.storage[area];
    if (!storage) {
      return createApiErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        `Invalid storage area: ${area}`,
        'storageRemove'
      );
    }
    
    await storage.remove(keys);
    logger.endOperation(correlationId, 'success');
    return createDataResponse({ keysRemoved: Array.isArray(keys) ? keys.length : 1 });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createApiErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Storage remove failed',
      'storageRemove',
      error
    );
  }
}

/**
 * Clear all items from storage
 * @param {string} [area='local'] - Storage area
 * @returns {Promise<ApiResponse>}
 */
export async function storageClear(area = StorageArea.LOCAL) {
  const correlationId = logger.startOperation('storageClear');
  
  try {
    const storage = chrome.storage[area];
    if (!storage) {
      return createApiErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        `Invalid storage area: ${area}`,
        'storageClear'
      );
    }
    
    await storage.clear();
    logger.endOperation(correlationId, 'success');
    return createDataResponse({ message: 'Storage cleared' });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return createApiErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Storage clear failed',
      'storageClear',
      error
    );
  }
}

/**
 * Get storage usage (bytes)
 * @param {string|string[]|null} keys - Keys to check, or null for all
 * @param {string} [area='local'] - Storage area
 * @returns {Promise<ApiResponse>}
 */
export async function storageGetBytesInUse(keys = null, area = StorageArea.LOCAL) {
  try {
    const storage = chrome.storage[area];
    if (!storage || !storage.getBytesInUse) {
      return createApiErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'getBytesInUse not supported in this storage area',
        'storageGetBytesInUse'
      );
    }
    
    const bytes = await storage.getBytesInUse(keys);
    return createDataResponse({ bytes });
  } catch (error) {
    return createApiErrorResponse(
      ERROR_CODES.UNKNOWN_ERROR,
      error?.message || 'Get bytes in use failed',
      'storageGetBytesInUse',
      error
    );
  }
}

/**
 * Listen to storage changes
 * @param {Function} callback - Callback(changes, areaName)
 * @returns {Function} Unsubscribe function
 */
export function onStorageChanged(callback) {
  const listener = (changes, areaName) => {
    logger.debug('Storage changed', { areaName, keys: Object.keys(changes) });
    callback(changes, areaName);
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  // Return unsubscribe function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
