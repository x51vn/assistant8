// Cloud Sync Module with Google Drive Integration

const GOOGLE_CLIENT_ID = '1061609434838-glhk7tcpa604kbvl28e7qsqt3tg1ge86.apps.googleusercontent.com';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
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

// Store sync configuration
export async function getSyncConfig() {
  const stored = await chrome.storage.sync.get(['syncEnabled', 'googleDriveFolder', 'lastSyncTime']);
  return stored || {};
}

export async function saveSyncConfig(config) {
  await chrome.storage.sync.set(config);
  console.log('[Sync] Config saved');
}

// Get Google Drive auth token
// Returns null if not authenticated (instead of rejecting)
export async function getGoogleToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        console.debug('[Sync] Not authenticated yet:', chrome.runtime.lastError.message);
        resolve(null);  // Return null instead of rejecting
      } else if (token) {
        resolve(token);
      } else {
        resolve(null);
      }
    });
  });
}

// Interactive auth (user must approve)
export async function authenticateGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('[Sync] Auth failed:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
        // Save auth status
        chrome.storage.sync.set({ googleAuthStatus: 'authenticated', authToken: token });
      }
    });
  });
}

// Revoke token
export async function revokeGoogleAuth() {
  try {
    const token = await getGoogleToken();
    await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    chrome.storage.sync.set({ googleAuthStatus: 'revoked' });
    console.log('[Sync] Auth revoked');
  } catch (err) {
    console.error('[Sync] Revoke error:', err);
  }
}

// Create or get ChatGPT Assistant folder in Google Drive
export async function getOrCreateFolder(token) {
  try {
    // Search for folder
    const searchUrl = 'https://www.googleapis.com/drive/v3/files?q=name=%27ChatGPT-Assistant-Backups%27%20and%20mimeType=%27application/vnd.google-apps.folder%27%20and%20trashed=false&spaces=drive&pageSize=1';
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const searchData = await searchResponse.json();

    if (searchData.files && searchData.files.length > 0) {
      console.log('[Sync] Folder found:', searchData.files[0].id);
      return searchData.files[0].id;
    }

    // Create folder if not found
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'ChatGPT-Assistant-Backups',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    const folderData = await createResponse.json();
    console.log('[Sync] Folder created:', folderData.id);
    return folderData.id;
  } catch (err) {
    console.error('[Sync] Folder operation error:', err);
    throw err;
  }
}

// Upload backup to Google Drive
export async function uploadBackupToDrive(token, folderId, backupData) {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `chatgpt-assistant-backup-${timestamp}.json`;
    
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      parents: [folderId]
    };

    const body = new FormData();
    body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    body.append('file', new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: body
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const fileData = await response.json();
    console.log('[Sync] File uploaded:', fileData.id);
    
    // Update sync time
    const config = await getSyncConfig();
    await saveSyncConfig({
      ...config,
      lastSyncTime: new Date().toISOString(),
      lastUploadedFileId: fileData.id
    });

    return fileData.id;
  } catch (err) {
    console.error('[Sync] Upload error:', err);
    throw err;
  }
}

// Download backup from Google Drive
export async function downloadBackupFromDrive(token, fileId) {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const backup = await response.json();
    console.log('[Sync] File downloaded:', fileId);
    return backup;
  } catch (err) {
    console.error('[Sync] Download error:', err);
    throw err;
  }
}

// List recent backups from Google Drive
export async function listBackupsFromDrive(token, folderId, limit = 10) {
  try {
    const query = `'${folderId}' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&pageSize=${limit}&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data.files || [];
  } catch (err) {
    console.error('[Sync] List error:', err);
    throw err;
  }
}

// Sync all data to Google Drive
export async function syncToGoogleDrive() {
  try {
    const token = await getGoogleToken();
    
    if (!token) {
      throw new Error('Not authenticated. Please connect Google Drive first.');
    }
    
    const folderId = await getOrCreateFolder(token);

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
      description: 'ChatGPT Assistant Extension Backup',
      data: allData
    };

    const fileId = await uploadBackupToDrive(token, folderId, backup);
    return {
      success: true,
      fileId,
      message: 'Backup uploaded to Google Drive successfully!'
    };
  } catch (err) {
    console.error('[Sync] Sync error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Restore data from Google Drive
export async function restoreFromGoogleDrive(fileId) {
  try {
    const token = await getGoogleToken();
    
    if (!token) {
      throw new Error('Not authenticated. Please connect Google Drive first.');
    }
    
    const backup = await downloadBackupFromDrive(token, fileId);

    if (!backup.version || !backup.data) {
      throw new Error('Invalid backup format');
    }

    // Restore data
    await chrome.storage.local.set(backup.data);
    console.log('[Sync] Data restored from Google Drive');
    
    return {
      success: true,
      keysRestored: Object.keys(backup.data).length,
      message: 'Data restored from Google Drive successfully!'
    };
  } catch (err) {
    console.error('[Sync] Restore error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Schedule periodic sync
export function schedulePeriodicSync(intervalMinutes = 60) {
  chrome.alarms.create('googleDriveSync', { periodInMinutes: intervalMinutes });
  console.log(`[Sync] Scheduled periodic sync every ${intervalMinutes} minutes`);
}

// Handle sync alarm
export function handleSyncAlarm() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'googleDriveSync') {
      syncToGoogleDrive().then(result => {
        console.log('[Sync] Alarm sync result:', result);
      });
    }
  });
}
