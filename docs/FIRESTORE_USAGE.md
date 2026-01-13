// Example: How to use Firestore Sync Module
// Location: src/ui/firebaseSync.js

import firebaseSync from './firebaseSync.js';

// 1. Initialize on extension startup (background.js or popup.js)
async function setupFirebase() {
  try {
    // Initialize Firebase
    await firebaseSync.initializeFirebase();
    
    // Authenticate anonymously
    await firebaseSync.authenticateFirebase();
    
    console.log('✅ Firebase setup complete');
    return true;
  } catch (err) {
    console.error('❌ Firebase setup failed:', err);
    return false;
  }
}

// 2. Sync data to Firestore (call when user saves settings)
async function backupData() {
  const result = await firebaseSync.syncToFirestore();
  
  if (result.success) {
    console.log('✅ Backup successful:', result.backupId);
    // Show success message to user
  } else {
    console.error('❌ Backup failed:', result.error);
  }
}

// 3. Restore data from Firestore
async function restoreData(backupId = null) {
  const result = await firebaseSync.restoreFromFirestore(backupId);
  
  if (result.success) {
    console.log('✅ Restore successful, items restored:', result.keysRestored);
    // Reload UI after restore
  } else {
    console.error('❌ Restore failed:', result.error);
  }
}

// 4. List all backups
async function showBackups() {
  try {
    const backups = await firebaseSync.listBackups(10);
    
    backups.forEach(backup => {
      console.log(`📅 ${backup.exportDate} - ${backup.itemsCount} items (ID: ${backup.id})`);
    });
  } catch (err) {
    console.error('Error listing backups:', err);
  }
}

// 5. Enable auto-sync (every 60 minutes)
function enableAutoSync() {
  firebaseSync.schedulePeriodicSync(60);
  firebaseSync.handleSyncAlarm();
  
  console.log('✅ Auto-sync enabled');
}

// 6. Setup real-time listener (for multi-device sync)
function setupRealtimeSync() {
  const unsubscribe = firebaseSync.setupRealtimeSync((latestBackup) => {
    console.log('🔄 Remote sync detected! Latest backup:', latestBackup.backupId);
    
    // Auto-restore from latest backup
    restoreData(latestBackup.backupId);
  });
  
  // Store unsubscribe function to call later if needed
  return unsubscribe;
}

// 7. Delete old backup
async function removeBackup(backupId) {
  const result = await firebaseSync.deleteBackup(backupId);
  
  if (result.success) {
    console.log('✅ Backup deleted');
  } else {
    console.error('❌ Delete failed:', result.error);
  }
}

// Export for use in other modules
export { setupFirebase, backupData, restoreData, showBackups, enableAutoSync, setupRealtimeSync, removeBackup };
