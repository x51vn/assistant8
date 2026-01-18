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

const logger = createLogger('FirebaseService');

// Firebase configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCj-87I_ixItNqk_GgjUeOKLWkcFVCMT64",
  authDomain: "myfcx51.firebaseapp.com",
  databaseURL: "https://myfcx51-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myfcx51",
  storageBucket: "myfcx51.firebasestorage.app",
  messagingSenderId: "1061609434838",
  appId: "1:1061609434838:web:530a11dfadac7fc162a377",
  measurementId: "G-QMT32YLDK5"
};

// Module state
let firebaseApp = null;
let firebaseDb = null;
let firebaseAuth = null;
let firebaseUser = null;
let firebaseInitPromise = null;

/**
 * Initialize Firebase services
 * @returns {Promise<boolean>}
 */
async function initFirebase() {
  const correlationId = logger.startOperation('initFirebase');
  
  try {
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
    
    logger.endOperation('initFirebase', correlationId, true);
    return true;
  } catch (err) {
    logger.endOperation('initFirebase', correlationId, false, err);
    throw err;
  }
}

// Initialize Firebase on module load
firebaseInitPromise = initFirebase();

/**
 * Ensure Firebase is initialized and user is authenticated
 * @returns {Promise<Object>} Firebase user object
 * @throws {Error} If not authenticated or Firebase not ready
 */
export async function ensureAuth() {
  try {
    await firebaseInitPromise;
  } catch (err) {
    throw new Error(`Firebase initialization failed: ${err.message}`);
  }
  
  if (!firebaseAuth) {
    throw new Error('Firebase Auth not initialized');
  }
  
  if (!firebaseAuth.app) {
    throw new Error('Firebase Auth not properly initialized');
  }
  
  if (!firebaseUser) {
    throw new Error('Not authenticated. Please login first.');
  }
  
  return firebaseUser;
}

/**
 * Sign in with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<ApiResponse>}
 */
export async function signIn(email, password) {
  const correlationId = logger.startOperation('signIn', { email });
  
  try {
    await firebaseInitPromise;
    
    if (!firebaseAuth) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firebase Auth not initialized',
        'signIn'
      );
    }
    
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    firebaseUser = userCredential.user;
    
    logger.endOperation('signIn', correlationId, true);
    return createSuccessResponse({
      email: firebaseUser.email,
      uid: firebaseUser.uid
    });
  } catch (error) {
    logger.endOperation('signIn', correlationId, false, error);
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
    
    logger.endOperation('signOut', correlationId, true);
    return createSuccessResponse({ message: 'Signed out successfully' });
  } catch (error) {
    logger.endOperation('signOut', correlationId, false, error);
    return exceptionToErrorResponse(error, 'signOut');
  }
}

/**
 * Get current authenticated user
 * @returns {Object|null} Firebase user object or null
 */
export function getCurrentUser() {
  return firebaseUser;
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
    const user = await ensureAuth();
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'syncToFirebase'
      );
    }
    
    const backupId = `backup_${Date.now()}`;
    const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', backupId);
    
    const backupData = {
      backupId,
      version: '2.0',
      createdAt: serverTimestamp(),
      data: data,
      size: JSON.stringify(data).length
    };
    
    await setDoc(backupRef, backupData);
    
    // Update latest backup pointer
    const latestRef = doc(firebaseDb, 'users', user.uid, 'config', 'latestBackup');
    await setDoc(latestRef, {
      backupId,
      updatedAt: serverTimestamp()
    });
    
    logger.endOperation('syncToFirebase', correlationId, true);
    return createSuccessResponse({ backupId, size: backupData.size });
  } catch (error) {
    logger.endOperation('syncToFirebase', correlationId, false, error);
    return exceptionToErrorResponse(error, 'syncToFirebase');
  }
}

/**
 * Restore data from Firebase
 * @param {string} [backupId] - Specific backup ID, or latest if not provided
 * @returns {Promise<ApiResponse>}
 */
export async function restoreFromFirebase(backupId = null) {
  const correlationId = logger.startOperation('restoreFromFirebase', { backupId });
  
  try {
    const user = await ensureAuth();
    
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
      const backupSnap = await getDoc(backupRef);
      
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
      const latestSnap = await getDoc(latestRef);
      
      if (!latestSnap.exists()) {
        return createErrorResponse(
          ERROR_CODES.UNKNOWN_ERROR,
          'No backups found',
          'restoreFromFirebase'
        );
      }
      
      const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', latestSnap.data().backupId);
      backup = (await getDoc(backupRef)).data();
    }
    
    if (!backup.version || !backup.data) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Invalid backup format',
        'restoreFromFirebase'
      );
    }
    
    logger.endOperation('restoreFromFirebase', correlationId, true);
    return createSuccessResponse({
      data: backup.data,
      keysRestored: Object.keys(backup.data).length
    });
  } catch (error) {
    logger.endOperation('restoreFromFirebase', correlationId, false, error);
    return exceptionToErrorResponse(error, 'restoreFromFirebase');
  }
}

/**
 * List available backups
 * @param {number} [limitCount=10] - Maximum number of backups to return
 * @returns {Promise<ApiResponse>}
 */
export async function listBackups(limitCount = 10) {
  const correlationId = logger.startOperation('listBackups', { limitCount });
  
  try {
    const user = await ensureAuth();
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'listBackups'
      );
    }
    
    const backupsRef = collection(firebaseDb, 'users', user.uid, 'backups');
    const q = query(backupsRef, orderBy('createdAt', 'desc'), firebaseLimit(limitCount));
    const snapshot = await getDocs(q);
    
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
    
    logger.endOperation('listBackups', correlationId, true);
    return createSuccessResponse({ backups, count: backups.length });
  } catch (error) {
    logger.endOperation('listBackups', correlationId, false, error);
    return exceptionToErrorResponse(error, 'listBackups');
  }
}

/**
 * Delete a specific backup
 * @param {string} backupId - Backup ID to delete
 * @returns {Promise<ApiResponse>}
 */
export async function deleteBackup(backupId) {
  const correlationId = logger.startOperation('deleteBackup', { backupId });
  
  try {
    const user = await ensureAuth();
    
    if (!firebaseDb) {
      return createErrorResponse(
        ERROR_CODES.UNKNOWN_ERROR,
        'Firestore not initialized',
        'deleteBackup'
      );
    }
    
    const backupRef = doc(firebaseDb, 'users', user.uid, 'backups', backupId);
    await deleteDoc(backupRef);
    
    logger.endOperation('deleteBackup', correlationId, true);
    return createSuccessResponse({ message: 'Backup deleted successfully' });
  } catch (error) {
    logger.endOperation('deleteBackup', correlationId, false, error);
    return exceptionToErrorResponse(error, 'deleteBackup');
  }
}
