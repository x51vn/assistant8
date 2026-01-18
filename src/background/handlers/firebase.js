/**
 * @fileoverview Firebase Handlers
 * Handles Firebase authentication and data synchronization
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../types.js';
import * as firebaseService from '../../firebaseService.js';

const logger = createLogger('FirebaseHandlers');

// Track Firebase user state for alarms
let firebaseUser = null;

/**
 * FIREBASE_SYNC - Sync data to Firestore
 */
registerHandler(MESSAGE_TYPES.FIREBASE_SYNC, async (message, sender) => {
  const correlationId = logger.startOperation('firebaseSync', message.correlationId);
  
  try {
    logger.info('Starting Firebase sync', { correlationId });
    
    const result = await syncToFirebaseHandler();
    
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.FIREBASE_SYNCED, result);
    
  } catch (error) {
    logger.error('Firebase sync failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * FIREBASE_RESTORE - Restore data from Firestore
 */
registerHandler(MESSAGE_TYPES.FIREBASE_RESTORE, async (message, sender) => {
  const correlationId = logger.startOperation('firebaseRestore', message.correlationId);
  const { backupId } = message.payload || {};
  
  try {
    logger.info('Starting Firebase restore', { correlationId, backupId });
    
    const result = await restoreFromFirebaseHandler(backupId);
    
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.FIREBASE_RESTORED, result);
    
  } catch (error) {
    logger.error('Firebase restore failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * FIREBASE_LIST_BACKUPS - List available backups
 */
registerHandler(MESSAGE_TYPES.FIREBASE_LIST_BACKUPS, async (message, sender) => {
  const correlationId = logger.startOperation('firebaseListBackups', message.correlationId);
  
  try {
    logger.info('Listing Firebase backups', { correlationId });
    
    const backups = await listBackupsHandler();
    
    logger.endOperation(correlationId, 'success', { count: backups.length });
    return createResponse(message, MESSAGE_TYPES.FIREBASE_BACKUPS_LISTED, { backups });
    
  } catch (error) {
    logger.error('Firebase list backups failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, error.message);
  }
});

/**
 * Sync to Firebase handler
 * @returns {Promise<{message: string, backupId: string}>}
 */
export async function syncToFirebaseHandler() {
  const correlationId = logger.startOperation('syncToFirebase');
  
  try {
    // Ensure user is authenticated
    const authResult = await firebaseService.ensureAuth();
    if (!authResult.success) {
      throw new Error(authResult.error || 'Authentication failed');
    }
    
    // Update user state for alarms
    firebaseUser = authResult.user;
    
    // Get all data from storage
    const data = await chrome.storage.local.get(null);
    
    // Sync to Firebase
    const syncResult = await firebaseService.syncToFirebase(data);
    
    if (!syncResult.success) {
      throw new Error(syncResult.error || 'Sync failed');
    }
    
    logger.info('Firebase sync completed', { correlationId, backupId: syncResult.backupId });
    logger.endOperation(correlationId, 'success');
    
    return {
      message: 'Đồng bộ thành công',
      backupId: syncResult.backupId
    };
    
  } catch (error) {
    logger.error('Sync to Firebase failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    throw error;
  }
}

/**
 * Restore from Firebase handler
 * @param {string} backupId - Backup ID to restore from
 * @returns {Promise<{message: string}>}
 */
export async function restoreFromFirebaseHandler(backupId) {
  const correlationId = logger.startOperation('restoreFromFirebase', undefined, { backupId });
  
  try {
    // Ensure user is authenticated
    const authResult = await firebaseService.ensureAuth();
    if (!authResult.success) {
      throw new Error(authResult.error || 'Authentication failed');
    }
    
    // Restore from Firebase
    const restoreResult = await firebaseService.restoreFromFirebase(backupId);
    
    if (!restoreResult.success) {
      throw new Error(restoreResult.error || 'Restore failed');
    }
    
    // Save restored data to storage
    await chrome.storage.local.set(restoreResult.data);
    
    logger.info('Firebase restore completed', { correlationId, backupId });
    logger.endOperation(correlationId, 'success');
    
    return {
      message: 'Khôi phục thành công'
    };
    
  } catch (error) {
    logger.error('Restore from Firebase failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    throw error;
  }
}

/**
 * List backups handler
 * @returns {Promise<Array>}
 */
export async function listBackupsHandler() {
  const correlationId = logger.startOperation('listBackups');
  
  try {
    // Ensure user is authenticated
    const authResult = await firebaseService.ensureAuth();
    if (!authResult.success) {
      throw new Error(authResult.error || 'Authentication failed');
    }
    
    // List backups
    const backupsResult = await firebaseService.listBackups();
    
    if (!backupsResult.success) {
      throw new Error(backupsResult.error || 'List backups failed');
    }
    
    logger.info('Firebase backups listed', { correlationId, count: backupsResult.backups.length });
    logger.endOperation(correlationId, 'success');
    
    return backupsResult.backups;
    
  } catch (error) {
    logger.error('List backups failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', { error });
    throw error;
  }
}

/**
 * Get Firebase user (for alarms)
 * @returns {any} Firebase user object
 */
export function getFirebaseUser() {
  return firebaseUser;
}
