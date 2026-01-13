// Firestore Sync Module - Replaces Google Drive Integration

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

// Firebase Configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDq6vF8mZpNH6Q2hX5kL9pQ8rS1tU2vW3x", // UPDATE THIS
  authDomain: "myfcx51.firebaseapp.com",
  projectId: "myfcx51",
  storageBucket: "myfcx51.appspot.com",
  messagingSenderId: "563584335869",
  appId: "1:563584335869:web:a1b2c3d4e5f6g7h8i9j0k"
};

// Storage keys to sync
const STORAGE_KEYS = [
  'portfolio',
  'portfolioPrompt',
  'prompt',
  'autoRun',
  'evaluatePrevious',
  'reviewPrompt',
  'interval',
  'chatHistory',
  'errorList',
  'runs',
  'settings',
  'promptTemplates'
];

// Initialize Firebase
let db = null;
let auth = null;
let currentUser = null;

export async function initializeFirebase() {
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    auth = getAuth(app);

    // Setup auth state listener
    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      if (user) {
        console.log('[Firebase] Authenticated:', user.uid);
      }
    });

    console.log('[Firebase] Initialized successfully');
    return true;
  } catch (err) {
    console.error('[Firebase] Init failed:', err);
    return false;
  }
}

// Authenticate anonymously (for extension without user login)
export async function authenticateFirebase() {
  try {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }

    if (currentUser) {
      console.log('[Firebase] Already authenticated:', currentUser.uid);
      return currentUser;
    }

    const result = await signInAnonymously(auth);
    currentUser = result.user;
    console.log('[Firebase] Anonymous auth successful:', currentUser.uid);
    return currentUser;
  } catch (err) {
    console.error('[Firebase] Auth failed:', err);
    throw err;
  }
}

// Get sync configuration
export async function getSyncConfig() {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    const docRef = doc(db, 'users', currentUser.uid, 'config', 'sync');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    return {
      syncEnabled: false,
      lastSyncTime: null,
      autoSync: false,
      syncInterval: 60 // minutes
    };
  } catch (err) {
    console.error('[Firebase] Get config failed:', err);
    return {};
  }
}

// Save sync configuration
export async function saveSyncConfig(config) {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    const docRef = doc(db, 'users', currentUser.uid, 'config', 'sync');
    await setDoc(docRef, {
      ...config,
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log('[Firebase] Config saved');
  } catch (err) {
    console.error('[Firebase] Save config failed:', err);
    throw err;
  }
}

// Sync all data to Firestore
export async function syncToFirestore() {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    // Gather all data
    const allData = {};
    const stored = await chrome.storage.local.get(STORAGE_KEYS);

    STORAGE_KEYS.forEach(key => {
      if (stored[key] !== undefined) {
        allData[key] = stored[key];
      }
    });

    const backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      description: 'ChatGPT Assistant Firestore Backup',
      data: allData,
      syncedAt: serverTimestamp()
    };

    // Save backup document
    const backupRef = doc(db, 'users', currentUser.uid, 'backups', `backup-${Date.now()}`);
    await setDoc(backupRef, backup);

    // Update latest backup reference
    const latestRef = doc(db, 'users', currentUser.uid, 'config', 'latestBackup');
    await setDoc(latestRef, {
      backupId: backupRef.id,
      timestamp: serverTimestamp(),
      itemsCount: Object.keys(allData).length
    }, { merge: true });

    // Update sync time
    const config = await getSyncConfig();
    await saveSyncConfig({
      ...config,
      lastSyncTime: new Date().toISOString(),
      lastBackupId: backupRef.id
    });

    console.log('[Firebase] Sync completed:', backupRef.id);
    return {
      success: true,
      backupId: backupRef.id,
      message: 'Data synced to Firestore successfully!'
    };
  } catch (err) {
    console.error('[Firebase] Sync failed:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Restore data from Firestore
export async function restoreFromFirestore(backupId = null) {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    let backup;

    if (backupId) {
      // Restore from specific backup
      const docRef = doc(db, 'users', currentUser.uid, 'backups', backupId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Backup not found');
      }
      backup = docSnap.data();
    } else {
      // Restore from latest backup
      const latestRef = doc(db, 'users', currentUser.uid, 'config', 'latestBackup');
      const latestSnap = await getDoc(latestRef);

      if (!latestSnap.exists()) {
        throw new Error('No backups found');
      }

      const latestBackupId = latestSnap.data().backupId;
      const docRef = doc(db, 'users', currentUser.uid, 'backups', latestBackupId);
      const docSnap = await getDoc(docRef);
      backup = docSnap.data();
    }

    if (!backup.version || !backup.data) {
      throw new Error('Invalid backup format');
    }

    // Restore data
    await chrome.storage.local.set(backup.data);
    console.log('[Firebase] Data restored');

    return {
      success: true,
      keysRestored: Object.keys(backup.data).length,
      message: 'Data restored from Firestore successfully!'
    };
  } catch (err) {
    console.error('[Firebase] Restore failed:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// List all backups
export async function listBackups(limit_count = 10) {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    const backupRef = collection(db, 'users', currentUser.uid, 'backups');
    const q = query(backupRef, orderBy('syncedAt', 'desc'), limit(limit_count));
    const snapshot = await getDocs(q);

    const backups = [];
    snapshot.forEach(doc => {
      backups.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return backups;
  } catch (err) {
    console.error('[Firebase] List failed:', err);
    throw err;
  }
}

// Real-time sync listener (auto-sync when data changes)
export function setupRealtimeSync(callback) {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    const latestRef = doc(db, 'users', currentUser.uid, 'config', 'latestBackup');
    
    const unsubscribe = onSnapshot(latestRef, (doc) => {
      if (doc.exists()) {
        console.log('[Firebase] Remote sync detected:', doc.data());
        if (callback) {
          callback(doc.data());
        }
      }
    });

    return unsubscribe;
  } catch (err) {
    console.error('[Firebase] Real-time setup failed:', err);
    return null;
  }
}

// Delete a backup
export async function deleteBackup(backupId) {
  try {
    if (!currentUser || !db) {
      throw new Error('Not authenticated or Firebase not initialized');
    }

    const docRef = doc(db, 'users', currentUser.uid, 'backups', backupId);
    await deleteDoc(docRef);
    console.log('[Firebase] Backup deleted:', backupId);
    return { success: true };
  } catch (err) {
    console.error('[Firebase] Delete failed:', err);
    return { success: false, error: err.message };
  }
}

// Schedule periodic sync using Chrome alarms
export function schedulePeriodicSync(intervalMinutes = 60) {
  chrome.alarms.create('firebaseSync', { periodInMinutes: intervalMinutes });
  console.log(`[Firebase] Scheduled periodic sync every ${intervalMinutes} minutes`);
}

// Handle sync alarm
export function handleSyncAlarm() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'firebaseSync') {
      syncToFirestore().then(result => {
        console.log('[Firebase] Alarm sync result:', result);
      });
    }
  });
}

// Export all functions
export default {
  initializeFirebase,
  authenticateFirebase,
  getSyncConfig,
  saveSyncConfig,
  syncToFirestore,
  restoreFromFirestore,
  listBackups,
  setupRealtimeSync,
  deleteBackup,
  schedulePeriodicSync,
  handleSyncAlarm
};
