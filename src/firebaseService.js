/**
 * @fileoverview Firebase Service Module
 * Handles all Firebase-related operations: Auth, Firestore, Cloud Sync
 * Separation of Concerns: Isolates Firebase I/O from business logic
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit as firebaseLimit, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  setPersistence, 
  indexedDBLocalPersistence 
} from 'firebase/auth';
import { createLogger } from './logger.js';
import { ERROR_CODES, createSuccessResponse, createErrorResponse, exceptionToErrorResponse } from './types.js';
import { getFirebaseConfig } from './firebaseConfig.js';

const logger = createLogger('FirebaseService');

// X51LABS-89: Retry wrapper for Firestore operations
async function firestoreWithRetry(operation, operationName, maxRetries = 3) {
  const baseDelayMs = 1000;
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        logger.info(`[${operationName}] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable (network, timeout, unavailable)
      const isRetryable = error.code === 'unavailable' || 
                         error.code === 'deadline-exceeded' ||
                         error.message?.includes('network') ||
                         error.message?.includes('timeout');
      
      if (isRetryable && attempt < maxRetries) {
        logger.warn(`[${operationName}] Retryable error, will retry`, {
          attempt: attempt + 1,
          code: error.code,
          message: error.message
        });
        continue;
      }
      
      // Non-retryable or final attempt
      throw error;
    }
  }
  
  throw lastError;
}


// X51LABS-74: Module state - avoid holding state across SW restarts
let firebaseApp = null;
let firebaseDb = null;
let firebaseAuth = null;
let firebaseUser = null;
let firebaseInitPromise = null; // Only for deduplication during single SW session

/**
 * Initialize Firebase services
 * @returns {Promise<boolean>}
 */
async function initFirebase() {
  const correlationId = logger.startOperation('initFirebase');
  
  try {
    // Load Firebase config from environment variables
    const FIREBASE_CONFIG = getFirebaseConfig();
    
    logger.info('Initializing Firebase app', {
      projectId: FIREBASE_CONFIG.projectId,
      authDomain: FIREBASE_CONFIG.authDomain
    });
    
    firebaseApp = initializeApp(FIREBASE_CONFIG);
    logger.info('Firebase app initialized', { appName: firebaseApp.name });
    
    firebaseDb = getFirestore(firebaseApp);
    logger.info('Firestore initialized');
    
    firebaseAuth = getAuth(firebaseApp);
    logger.info('Auth initialized');
    
    // Enable persistence for better auth state management
    try {
      await setPersistence(firebaseAuth, indexedDBLocalPersistence);
      logger.info('Persistence enabled (indexedDB)');
    } catch (persistErr) {
      logger.warn('Persistence setup error', persistErr);
      // Continue even if persistence fails
    }
    
    // Verify Auth is properly initialized
    if (!firebaseAuth || !firebaseAuth.app) {
      throw new Error('Auth object not properly initialized');
    }
    
    // Wait for auth state to be determined
    await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        firebaseUser = user;
        if (user) {
          logger.info('User authenticated', { email: user.email, uid: user.uid });
        } else {
          logger.info('No authenticated user');
        }
        unsubscribe();
        resolve();
      });
    });
    
    logger.endOperation(correlationId, 'success');
    return true;
  } catch (err) {
    logger.endOperation(correlationId, 'error', err);
    throw err;
  }
}

/**
 * X51LABS-74: Lazy Firebase initialization - only init when needed
 * Checks chrome.storage.session cache first to avoid redundant inits
 * @returns {Promise<boolean>}
 */
async function ensureFirebaseInit() {
  // If already initialized in this SW session, return immediately
  if (firebaseApp && firebaseDb && firebaseAuth) {
    return true;
  }
  
  // Deduplicate concurrent init calls
  if (firebaseInitPromise) {
    await firebaseInitPromise;
    return true;
  }
  
  // Check if init is cached in session storage (survives SW restart)
  try {
    const cached = await chrome.storage.session.get('firebaseInitialized');
    if (cached.firebaseInitialized && (Date.now() - cached.firebaseInitialized < 300000)) {
      // Cache valid for 5 minutes
      logger.info('Firebase init cached, reinitializing...');
    }
  } catch (err) {
    logger.warn('Session storage check failed', err);
  }
  
  // Perform actual initialization
  firebaseInitPromise = initFirebase();
  await firebaseInitPromise;
  firebaseInitPromise = null; // Clear after completion
  
  // Cache in session storage
  try {
    await chrome.storage.session.set({ firebaseInitialized: Date.now() });
  } catch (err) {
    logger.warn('Failed to cache init timestamp', err);
  }
  
  return true;
}

/**
 * Ensure Firebase is initialized and user is authenticated
 * Returns {success, user?, error?} instead of throwing
 * X51LABS-60: Changed from throwing errors to returning status object
 * X51LABS-74: Calls ensureFirebaseInit() lazily
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function ensureAuth() {
  // X51LABS-74: Ensure Firebase is initialized first (lazy init)
  try {
    await ensureFirebaseInit();
  } catch (err) {
    const errorMsg = `Firebase initialization failed: ${err.message}`;
    logger.error(errorMsg, { error: err });
    return { success: false, error: errorMsg };
  }
  
  if (!firebaseAuth) {
    const errorMsg = 'Firebase Auth not initialized';
    logger.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  if (!firebaseAuth.app) {
    const errorMsg = 'Firebase Auth not properly initialized';
    logger.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  if (!firebaseUser) {
    const errorMsg = 'Not authenticated. Please login first.';
    logger.warn(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  return { success: true, user: firebaseUser };
}

/**
 * Sign in with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<ApiResponse>}
 */
export async function signIn(email, password) {
  const correlationId = logger.startOperation('signIn');
  
  try {
    await ensureFirebaseInit();
    
    if (!firebaseAuth) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firebase Auth not initialized',
        'signIn'
      );
    }
    
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    firebaseUser = userCredential.user;
    
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({
      email: firebaseUser.email,
      uid: firebaseUser.uid
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToErrorResponse(error, 'signIn');
  }
}

/**
 * Sign out current user
 * @returns {Promise<ApiResponse>}
 */
export async function signOutUser() {
  const correlationId = logger.startOperation('signOut');
  
  try {
    await firebaseInitPromise;
    
    if (!firebaseAuth) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firebase Auth not initialized',
        'signOut'
      );
    }
    
    await signOut(firebaseAuth);
    firebaseUser = null;
    
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ message: 'Signed out successfully' });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToErrorResponse(error, 'signOut');
  }
}

/**
 * Get current authenticated user
 * @returns {Object} Response with user or error
 */
export function getCurrentUser() {
  if (firebaseUser) {
    return {
      success: true,
      user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email
      }
    };
  }
  return { success: false, error: 'Not logged in' };
}

/**
 * Login with email and password (alias for signIn)
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<ApiResponse>}
 */
export async function loginWithEmail(email, password) {
  const result = await signIn(email, password);
  if (result.success) {
    return {
      success: true,
      user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email
      }
    };
  }
  return result;
}

/**
 * Logout current user (alias for signOutUser)
 * @returns {Promise<ApiResponse>}
 */
export async function logout() {
  return await signOutUser();
}

/**
 * Get Firestore database instance
 * @returns {Object|null} Firestore instance or null
 */
export function getDb() {
  return firebaseDb;
}

/**
 * Sync data to Firebase
 * @param {Object} data - Data to sync
 * @returns {Promise<ApiResponse>}
 */
export async function syncToFirebase(data) {
  const correlationId = logger.startOperation('syncToFirebase');
  
  try {
    const authResult = await ensureAuth();
    if (!authResult.success) {
      return createErrorResponse(
        ERROR_CODES.AUTH_FAILED,
        authResult.error,
        'syncToFirebase'
      );
    }
    
    const user = authResult.user;
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'syncToFirebase'
      );
    }
    
    // X51LABS-71: Estimate size BEFORE serialization to prevent memory waste
    const FIRESTORE_LIMIT = 1048576; // 1MB in bytes
    const WARNING_THRESHOLD = FIRESTORE_LIMIT * 0.8; // 80% of limit
    
    // Early size estimation (rough approximation)
    let estimatedSize = 0;
    const estimateObjectSize = (obj) => {
      if (obj === null || obj === undefined) return 4;
      if (typeof obj === 'boolean') return 4;
      if (typeof obj === 'number') return 8;
      if (typeof obj === 'string') return obj.length * 2; // Unicode chars can be 2 bytes
      if (Array.isArray(obj)) {
        return obj.reduce((sum, item) => sum + estimateObjectSize(item), 16); // Array overhead
      }
      if (typeof obj === 'object') {
        return Object.entries(obj).reduce((sum, [key, value]) => 
          sum + key.length * 2 + estimateObjectSize(value), 16); // Object overhead
      }
      return 0;
    };
    
    estimatedSize = estimateObjectSize(data);
    
    // If estimate exceeds 90% of limit, try chunking large arrays
    if (estimatedSize > FIRESTORE_LIMIT * 0.9) {
      logger.warn('Data size estimated to exceed safe threshold, attempting to reduce', {
        correlationId,
        estimatedSize,
        threshold: FIRESTORE_LIMIT * 0.9
      });
      
      // Trim large arrays (chatHistory, runs, errorList) to stay under limit
      if (data.chatHistory && Array.isArray(data.chatHistory) && data.chatHistory.length > 50) {
        logger.warn('Trimming chatHistory to prevent size limit', {
          original: data.chatHistory.length,
          trimmed: 50
        });
        data = {
          ...data,
          chatHistory: data.chatHistory.slice(-50) // Keep last 50 items
        };
      }
      
      if (data.runs && Array.isArray(data.runs) && data.runs.length > 30) {
        logger.warn('Trimming runs to prevent size limit', {
          original: data.runs.length,
          trimmed: 30
        });
        data = {
          ...data,
          runs: data.runs.slice(-30) // Keep last 30 items
        };
      }
      
      if (data.errorList && Array.isArray(data.errorList) && data.errorList.length > 30) {
        logger.warn('Trimming errorList to prevent size limit', {
          original: data.errorList.length,
          trimmed: 30
        });
        data = {
          ...data,
          errorList: data.errorList.slice(-30) // Keep last 30 items
        };
      }
      
      // Recalculate estimate after trimming
      estimatedSize = estimateObjectSize(data);
    }
    
    // Now serialize for actual size check
    const dataString = JSON.stringify(data);
    const dataSize = dataString.length;
    
    if (dataSize >= FIRESTORE_LIMIT) {
      logger.error('Data exceeds Firestore 1MB limit even after trimming', { 
        correlationId, 
        dataSize, 
        limit: FIRESTORE_LIMIT,
        estimatedSize
      });
      return createErrorResponse(
        ERROR_CODES.OPERATION_FAILED,
        `Data size (${(dataSize / 1024).toFixed(0)}KB) exceeds Firestore 1MB limit. Consider using Firestore subcollections for large datasets.`,
        'syncToFirebase',
        { dataSize, limit: FIRESTORE_LIMIT }
      );
    }
    
    if (dataSize >= WARNING_THRESHOLD) {
      logger.warn('Data size approaching Firestore limit', { 
        correlationId, 
        dataSize, 
        threshold: WARNING_THRESHOLD,
        percentUsed: ((dataSize / FIRESTORE_LIMIT) * 100).toFixed(1)
      });
    }
    
    const backupId = `backup_${Date.now()}`;
    const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', backupId);
    
    const backupData = {
      backupId,
      version: '2.0',
      createdAt: serverTimestamp(),
      data: data,
      size: dataSize
    };
    
    // X51LABS-89: Wrap setDoc with retry logic
    await firestoreWithRetry(
      () => setDoc(backupRef, backupData),
      'syncToFirebase-setDoc'
    );
    
    // Update latest backup pointer
    const latestRef = doc(firebaseDb, 'users', user.uid, 'config', 'latestBackup');
    
    // X51LABS-89: Wrap setDoc with retry logic
    await firestoreWithRetry(
      () => setDoc(latestRef, {
        backupId,
        updatedAt: serverTimestamp()
      }),
      'syncToFirebase-updateLatest'
    );
    
    logger.endOperation(correlationId, 'success', { 
      size: dataSize,
      sizeKB: (dataSize / 1024).toFixed(2),
      percentOfLimit: ((dataSize / FIRESTORE_LIMIT) * 100).toFixed(1)
    });
    return createSuccessResponse({ 
      backupId, 
      size: dataSize,
      sizeKB: (dataSize / 1024).toFixed(2),
      warning: dataSize >= WARNING_THRESHOLD ? 'Approaching 1MB limit' : null
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToErrorResponse(error, 'syncToFirebase');
  }
}

/**
 * Restore data from Firebase
 * @param {string} [backupId] - Specific backup ID, or latest if not provided
 * @returns {Promise<ApiResponse>}
 */
export async function restoreFromFirebase(backupId = null) {
  const correlationId = logger.startOperation('restoreFromFirebase');
  
  try {
    const authResult = await ensureAuth();
    if (!authResult.success) {
      return createErrorResponse(
        ERROR_CODES.AUTH_FAILED,
        authResult.error,
        'restoreFromFirebase'
      );
    }
    
    const user = authResult.user;
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'restoreFromFirebase'
      );
    }
    
    let backup;
    if (backupId) {
      const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', backupId);
      // X51LABS-89: Wrap getDoc with retry
      const backupSnap = await firestoreWithRetry(
        () => getDoc(backupRef),
        'restoreFromFirebase-getDoc'
      );
      
      if (!backupSnap.exists()) {
        return createErrorResponse(
          ERROR_CODES.UNKNOWN_ERROR,
          'Backup not found',
          'restoreFromFirebase'
        );
      }
      
      backup = backupSnap.data();
    } else {
      const latestRef = doc(firebaseDb, 'users', user.uid, 'config', 'latestBackup');
      // X51LABS-89: Wrap getDoc with retry
      const latestSnap = await firestoreWithRetry(
        () => getDoc(latestRef),
        'restoreFromFirebase-getLatest'
      );
      
      if (!latestSnap.exists()) {
        return createErrorResponse(
          ERROR_CODES.UNKNOWN_ERROR,
          'No backups found',
          'restoreFromFirebase'
        );
      }
      
      const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', latestSnap.data().backupId);
      // X51LABS-89: Wrap getDoc with retry
      const backupSnap = await firestoreWithRetry(
        () => getDoc(backupRef),
        'restoreFromFirebase-getBackup'
      );
      backup = backupSnap.data();
    }
    
    if (!backup.version || !backup.data) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Invalid backup format',
        'restoreFromFirebase'
      );
    }
    
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({
      data: backup.data,
      keysRestored: Object.keys(backup.data).length
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToErrorResponse(error, 'restoreFromFirebase');
  }
}

/**
 * List available backups
 * @param {number} [limitCount=10] - Maximum number of backups to return
 * @returns {Promise<ApiResponse>}
 */
export async function listBackups(limitCount = 10) {
  const correlationId = logger.startOperation('listBackups');
  
  try {
    const authResult = await ensureAuth();
    if (!authResult.success) {
      return createErrorResponse(
        ERROR_CODES.AUTH_FAILED,
        authResult.error,
        'listBackups'
      );
    }
    
    const user = authResult.user;
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'listBackups'
      );
    }
    
    const backupsRef = collection(firebaseDb, 'users', user.uid, 'backups');
    const q = query(backupsRef, orderBy('createdAt', 'desc'), firebaseLimit(limitCount));
    // X51LABS-89: Wrap getDocs with retry
    const snapshot = await firestoreWithRetry(
      () => getDocs(q),
      'listBackups-getDocs'
    );
    
    const backups = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      backups.push({
        id: doc.id,
        backupId: data.backupId,
        createdAt: data.createdAt?.toDate?.() || null,
        size: data.size || 0,
        version: data.version || 'unknown'
      });
    });
    
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ backups, count: backups.length });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToErrorResponse(error, 'listBackups');
  }
}

/**
 * Delete a specific backup
 * @param {string} backupId - Backup ID to delete
 * @returns {Promise<ApiResponse>}
 */
export async function deleteBackup(backupId) {
  const correlationId = logger.startOperation('deleteBackup');
  
  try {
    const authResult = await ensureAuth();
    if (!authResult.success) {
      return createErrorResponse(
        ERROR_CODES.AUTH_FAILED,
        authResult.error,
        'deleteBackup'
      );
    }
    
    const user = authResult.user;
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'deleteBackup'
      );
    }
    
    const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', backupId);
    await deleteDoc(backupRef);
    
    logger.endOperation(correlationId, 'success');
    return createSuccessResponse({ message: 'Backup deleted successfully' });
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToErrorResponse(error, 'deleteBackup');
  }
}
