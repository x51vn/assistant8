// Firebase sync via background script messaging
let firebaseReady = false;

async function getSyncConfig() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'get_sync_config' }, (response) => {
      resolve(response || {});
    });
  });
}

async function saveSyncConfig(config) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'save_sync_config', config }, (response) => {
      resolve(response);
    });
  });
}

async function syncToFirestore() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'sync_to_firestore' }, (response) => {
      resolve(response);
    });
  });
}

async function restoreFromFirestore(backupId = null) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'restore_from_firestore', backupId }, (response) => {
      resolve(response);
    });
  });
}

async function listBackups(limit_count = 10) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'list_backups', limit: limit_count }, (response) => {
      resolve(response || []);
    });
  });
}

async function deleteBackup(backupId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'delete_backup', backupId }, (response) => {
      resolve(response);
    });
  });
}

function schedulePeriodicSync(intervalMinutes = 60) {
  chrome.alarms.create('firebaseSync', { periodInMinutes: intervalMinutes });
  console.log(`[Sync] Scheduled periodic sync every ${intervalMinutes} minutes`);
}

function handleSyncAlarm() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'firebaseSync') {
      syncToFirestore().then(result => {
        console.log('[Sync] Alarm sync result:', result);
      });
    }
  });
}

export async function setupSync(dom) {
  const {
    syncEnabledCheckbox,
    authGoogleBtn,
    syncNowBtn,
    revokeGoogleBtn,
    syncStatus,
    backupsList,
    saveStatus
  } = dom;

  if (!authGoogleBtn) return;

  // Initialize Firebase via background
  try {
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'init_firebase' }, (response) => {
        resolve(response);
      });
    });
    
    if (result && result.success) {
      firebaseReady = true;
      console.log('[Sync] Firebase ready');
    } else {
      throw new Error(result?.error || 'Firebase init failed');
    }
  } catch (err) {
    console.error('[Sync] Firebase init failed:', err);
    showStatus(syncStatus, '⚠️ Firebase not available', 'error');
    return;
  }

  // Initialize UI
  await initializeSyncUI();

  // Auth button (for Firestore, just ensures authentication)
  authGoogleBtn?.addEventListener('click', async () => {
    try {
      showStatus(syncStatus, '⏳ Connecting to Firestore...', 'info');
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'ensure_firebase_auth' }, (response) => {
          resolve(response);
        });
      });
      
      if (result && result.success) {
        firebaseReady = true;
        showStatus(syncStatus, '✅ Successfully connected to Firestore!', 'success');
        await initializeSyncUI();
      } else {
        throw new Error(result?.error || 'Auth failed');
      }
    } catch (err) {
      showStatus(syncStatus, `❌ Connection failed: ${err.message}`, 'error');
      console.error('[Sync] Auth error:', err);
    }
  });

  // Sync now button
  syncNowBtn?.addEventListener('click', async () => {
    try {
      showStatus(syncStatus, '⏳ Syncing to Firestore...', 'info');
      const result = await syncToFirestore();
      if (result.success) {
        showStatus(syncStatus, `✅ ${result.message}`, 'success');
        await loadBackupsList();
      } else {
        showStatus(syncStatus, `❌ Sync failed: ${result.error}`, 'error');
      }
    } catch (err) {
      showStatus(syncStatus, `❌ Sync error: ${err.message}`, 'error');
      console.error('[Sync] Error:', err);
    }
  });

  // Revoke button (clear local config)
  revokeGoogleBtn?.addEventListener('click', async () => {
    if (confirm('Clear sync configuration? Your Firestore backups will remain.')) {
      try {
        await saveSyncConfig({ syncEnabled: false });
        showStatus(syncStatus, '✅ Sync disabled', 'success');
        await initializeSyncUI();
      } catch (err) {
        showStatus(syncStatus, `❌ Failed: ${err.message}`, 'error');
      }
    }
  });

  // Sync enabled checkbox
  syncEnabledCheckbox?.addEventListener('change', async (e) => {
    const config = await getSyncConfig();
    await saveSyncConfig({
      ...config,
      syncEnabled: e.target.checked
    });

    if (e.target.checked) {
      schedulePeriodicSync(60); // Sync every 60 minutes
      showStatus(syncStatus, '✅ Auto-sync enabled', 'success');
    } else {
      chrome.alarms.clear('firebaseSync');
      showStatus(syncStatus, '✅ Auto-sync disabled', 'success');
    }
  });

  // Handle alarm
  handleSyncAlarm();
}

async function initializeSyncUI() {
  const syncEnabledCheckbox = document.getElementById('syncEnabledCheckbox');
  const authGoogleBtn = document.getElementById('authGoogleBtn');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const revokeGoogleBtn = document.getElementById('revokeGoogleBtn');

  try {
    // Check auth status
    const config = await getSyncConfig();

    if (firebaseReady) {
      // User is authenticated
      authGoogleBtn.style.display = 'none';
      syncNowBtn.style.display = 'inline-block';
      revokeGoogleBtn.style.display = 'inline-block';
      
      // Load backups list
      await loadBackupsList();

      // Set checkbox state
      if (syncEnabledCheckbox) {
        syncEnabledCheckbox.checked = config.syncEnabled === true;
      }
    } else {
      // Firebase not ready
      authGoogleBtn.style.display = 'inline-block';
      syncNowBtn.style.display = 'none';
      revokeGoogleBtn.style.display = 'none';
      
      const backupsList = document.getElementById('backupsList');
      if (backupsList) {
        backupsList.innerHTML = '<p style="font-size: 12px; color: #666;">Connecting to Firestore...</p>';
      }

      if (syncEnabledCheckbox) {
        syncEnabledCheckbox.checked = false;
      }
    }
  } catch (err) {
    console.error('[Sync] Init error:', err);
  }
}

async function loadBackupsList() {
  try {
    const backups = await listBackups(10);

    const backupsList = document.getElementById('backupsList');
    if (!backupsList) return;

    if (backups.length === 0) {
      backupsList.innerHTML = '<p style="font-size: 12px; color: #666;">No backups yet. Sync to create one.</p>';
      return;
    }

    backupsList.innerHTML = `
      <div style="font-size: 11px;">
        <strong>Recent Backups:</strong>
        ${backups.map(backup => `
          <div style="padding: 6px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 500;">${new Date(backup.exportDate).toLocaleDateString()}</div>
              <div style="color: #666; font-size: 10px;">
                ${new Date(backup.exportDate).toLocaleTimeString()} | ${backup.data ? Object.keys(backup.data).length : 0} items
              </div>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="restore-backup-btn" data-id="${backup.id}" style="padding: 4px 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                ↓ Restore
              </button>
              <button class="delete-backup-btn" data-id="${backup.id}" style="padding: 4px 8px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                🗑️
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Add restore button listeners
    backupsList.querySelectorAll('.restore-backup-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const backupId = e.target.dataset.id;
        if (confirm('Restore this backup? Current data will be overwritten.')) {
          const syncStatus = document.getElementById('syncStatus');
          try {
            showStatus(syncStatus, '⏳ Restoring from backup...', 'info');
            const result = await restoreFromFirestore(backupId);
            if (result.success) {
              showStatus(syncStatus, `✅ ${result.message}`, 'success');
              setTimeout(() => window.location.reload(), 2000);
            } else {
              showStatus(syncStatus, `❌ Restore failed: ${result.error}`, 'error');
            }
          } catch (err) {
            showStatus(syncStatus, `❌ Restore error: ${err.message}`, 'error');
          }
        }
      });
    });

    // Add delete button listeners
    backupsList.querySelectorAll('.delete-backup-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const backupId = e.target.dataset.id;
        if (confirm('Delete this backup? This cannot be undone.')) {
          try {
            const result = await deleteBackup(backupId);
            if (result.success) {
              await loadBackupsList();
            }
          } catch (err) {
            console.error('[Sync] Delete error:', err);
          }
        }
      });
    });
  } catch (err) {
    console.error('[Sync] Load backups error:', err);
    const backupsList = document.getElementById('backupsList');
    if (backupsList) {
      backupsList.innerHTML = `<p style="font-size: 12px; color: #d00;">Error loading backups: ${err.message}</p>`;
    }
  }
}

function showStatus(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = `status-message ${type}`;
}
