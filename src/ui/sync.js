// Firebase sync via background script messaging
let firebaseReady = false;
let currentUser = null;

async function loginWithEmail(email, password) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'firebase_login', email, password }, (response) => {
      resolve(response);
    });
  });
}

async function registerWithEmail(email, password) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'firebase_register', email, password }, (response) => {
      resolve(response);
    });
  });
}

async function logoutFirebase() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'firebase_logout' }, (response) => {
      resolve(response);
    });
  });
}

async function getCurrentUser() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'get_current_user' }, (response) => {
      resolve(response);
    });
  });
}

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

  // Create auth UI
  createAuthUI();

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

  // Check current auth status
  await updateAuthStatus();

  // Auth button - now toggles login form
  authGoogleBtn?.addEventListener('click', async () => {
    const authForm = document.getElementById('firebase-auth-form');
    if (authForm) {
      authForm.style.display = authForm.style.display === 'none' ? 'block' : 'none';
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
            console.error('[Sync] Delete backup error:', err);
          }
        }
      });
    });
  } catch (err) {
    console.error('[Sync] Load backups error:', err);
  }
}

// Create authentication UI
function createAuthUI() {
  const syncContainer = document.querySelector('.sync-section');
  if (!syncContainer) return;

  // Check if already exists
  if (document.getElementById('firebase-auth-form')) return;

  const authHTML = `
    <div id="firebase-auth-form" style="display: none; margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
      <h3 style="margin-top: 0;">🔐 Firebase Login</h3>
      
      <div id="auth-status-display" style="margin-bottom: 15px; padding: 10px; background: #e3f2fd; border-radius: 4px; display: none;">
        <p style="margin: 0;">
          <strong>Logged in as:</strong> <span id="current-user-email"></span>
        </p>
        <button id="logout-btn" style="margin-top: 10px;">Logout</button>
      </div>

      <div id="auth-forms">
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: bold;">Email:</label>
          <input type="email" id="auth-email" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="your@email.com" />
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: bold;">Password:</label>
          <input type="password" id="auth-password" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="••••••••" />
        </div>

        <button id="login-btn" style="width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold;">
          Login
        </button>

        <p style="font-size: 12px; color: #666; margin: 15px 0 0 0;">
          ℹ️ Contact admin to create an account.
        </p>
      </div>

      <div id="auth-message" style="margin-top: 15px; padding: 10px; border-radius: 4px; display: none;"></div>
    </div>
  `;

  // Insert after the auth button
  const authBtn = document.getElementById('authGoogleBtn');
  if (authBtn && authBtn.parentElement) {
    authBtn.parentElement.insertAdjacentHTML('afterend', authHTML);
    attachAuthListeners();
  }
}

// Attach event listeners to auth form
function attachAuthListeners() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const authMessage = document.getElementById('auth-message');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');

  function showAuthMessage(message, type = 'info') {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.style.display = 'block';
    authMessage.style.background = type === 'error' ? '#ffebee' : type === 'success' ? '#e8f5e9' : '#e3f2fd';
    authMessage.style.color = type === 'error' ? '#c62828' : type === 'success' ? '#2e7d32' : '#1565c0';
  }

  // Handle Enter key in password field
  authPassword?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginBtn?.click();
    }
  });

  loginBtn?.addEventListener('click', async () => {
    const email = authEmail?.value.trim();
    const password = authPassword?.value;

    if (!email || !password) {
      showAuthMessage('Please enter email and password', 'error');
      return;
    }

    try {
      showAuthMessage('⏳ Logging in...', 'info');
      const result = await loginWithEmail(email, password);
      
      if (result.success) {
        showAuthMessage('✅ Login successful!', 'success');
        await updateAuthStatus();
        authEmail.value = '';
        authPassword.value = '';
        
        // Hide the form after successful login
        setTimeout(() => {
          const authForm = document.getElementById('firebase-auth-form');
          if (authForm) authForm.style.display = 'none';
        }, 1500);
      } else {
        showAuthMessage(`❌ Login failed: ${result.error}`, 'error');
      }
    } catch (err) {
      showAuthMessage(`❌ Error: ${err.message}`, 'error');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      showAuthMessage('⏳ Logging out...', 'info');
      await logoutFirebase();
      showAuthMessage('✅ Logged out', 'success');
      await updateAuthStatus();
    } catch (err) {
      showAuthMessage(`❌ Logout error: ${err.message}`, 'error');
    }
  });
}

// Update UI based on auth status
async function updateAuthStatus() {
  try {
    const user = await getCurrentUser();
    currentUser = user;
    
    const authStatusDisplay = document.getElementById('auth-status-display');
    const authForms = document.getElementById('auth-forms');
    const authBtn = document.getElementById('authGoogleBtn');
    const syncNowBtn = document.getElementById('syncNowBtn');

    if (user && user.email) {
      // User is logged in
      firebaseReady = true;
      if (authStatusDisplay) {
        document.getElementById('current-user-email').textContent = user.email;
        authStatusDisplay.style.display = 'block';
      }
      if (authForms) authForms.style.display = 'none';
      if (authBtn) authBtn.textContent = '✅ Logged In';
      if (syncNowBtn) syncNowBtn.disabled = false;
      
      // Load backups list
      await loadBackupsList();
    } else {
      // User not logged in
      firebaseReady = false;
      if (authStatusDisplay) authStatusDisplay.style.display = 'none';
      if (authForms) authForms.style.display = 'block';
      if (authBtn) authBtn.textContent = '🔐 Login to Firebase';
      if (syncNowBtn) syncNowBtn.disabled = true;
      
      // Clear backups list
      const backupsList = document.getElementById('backupsList');
      if (backupsList) {
        backupsList.innerHTML = '<p style="color: #999;">Login to view backups</p>';
      }
    }
  } catch (err) {
    console.error('[Sync] Update auth status error:', err);
  }
}

function showStatus(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = `status-message ${type}`;
}
