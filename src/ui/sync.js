import { 
  getSyncConfig, 
  saveSyncConfig, 
  authenticateGoogle, 
  revokeGoogleAuth,
  syncToGoogleDrive,
  restoreFromGoogleDrive,
  getGoogleToken,
  getOrCreateFolder,
  listBackupsFromDrive,
  schedulePeriodicSync,
  handleSyncAlarm
} from './googleDriveSync.js';

export function setupSync(dom) {
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

  // Initialize UI
  initializeSyncUI();

  // Auth button
  authGoogleBtn?.addEventListener('click', async () => {
    try {
      showStatus(syncStatus, '⏳ Connecting to Google Drive...', 'info');
      await authenticateGoogle();
      showStatus(syncStatus, '✅ Successfully connected to Google Drive!', 'success');
      await initializeSyncUI();
    } catch (err) {
      showStatus(syncStatus, `❌ Connection failed: ${err.message}`, 'error');
      console.error('[Sync] Auth error:', err);
    }
  });

  // Sync now button
  syncNowBtn?.addEventListener('click', async () => {
    try {
      showStatus(syncStatus, '⏳ Syncing to Google Drive...', 'info');
      const result = await syncToGoogleDrive();
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

  // Revoke button
  revokeGoogleBtn?.addEventListener('click', async () => {
    if (confirm('Disconnect Google Drive? You can reconnect anytime.')) {
      try {
        await revokeGoogleAuth();
        showStatus(syncStatus, '✅ Disconnected from Google Drive', 'success');
        await initializeSyncUI();
      } catch (err) {
        showStatus(syncStatus, `❌ Disconnect failed: ${err.message}`, 'error');
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
      chrome.alarms.clear('googleDriveSync');
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
    const token = await getGoogleToken().catch(() => null);
    const config = await getSyncConfig();

    if (token) {
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
      // User not authenticated
      authGoogleBtn.style.display = 'inline-block';
      syncNowBtn.style.display = 'none';
      revokeGoogleBtn.style.display = 'none';
      
      const backupsList = document.getElementById('backupsList');
      if (backupsList) {
        backupsList.innerHTML = '<p style="font-size: 12px; color: #666;">Connect to Google Drive to see backups</p>';
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
    const token = await getGoogleToken();
    const folderId = await getOrCreateFolder(token);
    const backups = await listBackupsFromDrive(token, folderId, 10);

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
              <div style="font-weight: 500;">${backup.name}</div>
              <div style="color: #666; font-size: 10px;">
                ${new Date(backup.modifiedTime).toLocaleString()} | ${(backup.size / 1024).toFixed(1)}KB
              </div>
            </div>
            <button class="restore-backup-btn" data-id="${backup.id}" style="padding: 4px 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
              ↓ Restore
            </button>
          </div>
        `).join('')}
      </div>
    `;

    // Add restore button listeners
    backupsList.querySelectorAll('.restore-backup-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const fileId = e.target.dataset.id;
        if (confirm('Restore this backup? Current data will be overwritten.')) {
          const syncStatus = document.getElementById('syncStatus');
          try {
            showStatus(syncStatus, '⏳ Restoring from backup...', 'info');
            const result = await restoreFromGoogleDrive(fileId);
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
