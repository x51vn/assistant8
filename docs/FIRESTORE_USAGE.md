# Firestore / Firebase (REMOVED)

This module and all Firebase/Firestore functionality have been completely removed from the codebase.

For sync functionality, use Supabase background handlers instead.
  
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
