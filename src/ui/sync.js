// Firebase sync via background script messaging
let firebaseReady = false;
let currentUser = null;

// Generic message sender - helper function to avoid duplication
function sendMessage(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      resolve(response);
    });
  });
}

// Auth functions
const loginWithEmail = (email, password) => sendMessage('firebase_login', { email, password });
const logoutFirebase = () => sendMessage('firebase_logout');
const getCurrentUser = () => sendMessage('get_current_user');

// Sync functions
const getSyncConfig = () => sendMessage('get_sync_config').then(r => r || {});
const saveSyncConfig = (config) => sendMessage('save_sync_config', { config });
const syncToFirestore = () => sendMessage('sync_to_firestore');
const restoreFromFirestore = (backupId = null) => sendMessage('restore_from_firestore', { backupId });
const listBackups = (limit = 1) => sendMessage('list_backups', { limit }).then(r => r || []);
const deleteBackup = (backupId) => sendMessage('delete_backup', { backupId });

// Notes functions - One note per day model
async function getNotes() {
  const { notes } = await chrome.storage.local.get(['notes']);
  return Array.isArray(notes) ? notes : [];
}

function getTodayDateKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

async function getTodayNote() {
  const notes = await getNotes();
  const today = getTodayDateKey();
  return notes.find(n => n.dateKey === today);
}

async function saveOrUpdateNote(text) {
  const notes = await getNotes();
  const today = getTodayDateKey();
  const todayNote = notes.find(n => n.dateKey === today);
  
  if (todayNote) {
    // Update existing note
    todayNote.text = text;
    todayNote.updatedAt = Date.now();
  } else {
    // Create new note
    notes.unshift({
      id: `note_${today}`,
      dateKey: today,
      text,
      date: new Date().toISOString(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  
  await chrome.storage.local.set({ notes });
}

// Deprecated - keeping for backward compatibility
const registerWithEmail = () => { throw new Error('Register not supported'); };

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
    syncNowBtn,
    revokeGoogleBtn,
    syncStatus,
    syncEnabledCheckbox
  } = dom;

  // Setup auth listeners
  attachAuthListeners(syncStatus);
  
  // Check current auth status
  await updateAuthStatus(syncStatus, syncNowBtn);

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
        await logoutFirebase();
        showStatus(syncStatus, '✅ Đã đăng xuất', 'success');
        await updateAuthStatus(syncStatus, syncNowBtn);
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
    // Get latest backup only
    const backups = await listBackups(1);

    const backupsList = document.getElementById('backupsList');
    if (!backupsList) return;

    if (backups.length === 0) {
      backupsList.innerHTML = '<p style="font-size: 12px; color: #666; text-align: center; padding: 10px;">Chưa có bản sao lưu. Nhấn "Đồng bộ ngay" để tạo.</p>';
      return;
    }

    const backup = backups[0];
    backupsList.innerHTML = `
      <div style="font-size: 11px;">
        <strong style="display: block; margin-bottom: 8px;">Bản sao lưu:</strong>
        <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 500;">${new Date(backup.exportDate).toLocaleDateString('vi-VN')}</div>
            <div style="color: #666; font-size: 10px;">
              ${new Date(backup.exportDate).toLocaleTimeString('vi-VN')} | ${backup.data ? Object.keys(backup.data).length : 0} mục
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="restore-backup-btn" data-id="${backup.id}" style="padding: 4px 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
              ↓ Khôi phục
            </button>
          </div>
        </div>
      </div>
    `;

    // Add restore button listener
    backupsList.querySelector('.restore-backup-btn').addEventListener('click', async (e) => {
      const backupId = e.target.dataset.id;
      if (confirm('Khôi phục bản sao lưu này? Dữ liệu hiện tại sẽ bị ghi đè.')) {
        const syncStatus = document.getElementById('syncStatus');
        try {
          showStatus(syncStatus, '⏳ Đang khôi phục...', 'info');
          const result = await restoreFromFirestore(backupId);
          if (result.success) {
            showStatus(syncStatus, `✅ ${result.message}`, 'success');
            setTimeout(() => window.location.reload(), 2000);
          } else {
            showStatus(syncStatus, `❌ Khôi phục thất bại: ${result.error}`, 'error');
          }
        } catch (err) {
          showStatus(syncStatus, `❌ Lỗi khôi phục: ${err.message}`, 'error');
        }
      }
    });
  } catch (err) {
    console.error('[Sync] Load backups error:', err);
  }
}

// Attach event listeners to auth form
function attachAuthListeners(syncStatus) {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const authMessage = document.getElementById('auth-message');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');

  const showAuthMessage = (message, type = 'info') => {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.style.display = 'block';
    authMessage.style.background = type === 'error' ? '#ffebee' : type === 'success' ? '#e8f5e9' : '#e3f2fd';
    authMessage.style.color = type === 'error' ? '#c62828' : type === 'success' ? '#2e7d32' : '#1565c0';
  };

  // Handle Enter key in password field
  authPassword?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn?.click();
  });

  loginBtn?.addEventListener('click', async () => {
    const email = authEmail?.value.trim();
    const password = authPassword?.value;

    if (!email || !password) {
      showAuthMessage('Please enter email and password', 'error');
      return;
    }

    try {
      showAuthMessage('⏳ Đăng nhập...', 'info');
      const result = await loginWithEmail(email, password);
      
      if (result.success) {
        showAuthMessage('✅ Đăng nhập thành công!', 'success');
        await updateAuthStatus(syncStatus, document.getElementById('syncNowBtn'));
        authEmail.value = '';
        authPassword.value = '';
      } else {
        showAuthMessage(`❌ Đăng nhập thất bại: ${result.error}`, 'error');
      }
    } catch (err) {
      showAuthMessage(`❌ Lỗi: ${err.message}`, 'error');
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    try {
      showAuthMessage('⏳ Đang đăng xuất...', 'info');
      await logoutFirebase();
      showAuthMessage('✅ Đã đăng xuất', 'success');
      await updateAuthStatus(syncStatus, document.getElementById('syncNowBtn'));
    } catch (err) {
      showAuthMessage(`❌ Lỗi đăng xuất: ${err.message}`, 'error');
    }
  });
}

// Update UI based on auth status
async function updateAuthStatus(syncStatus, syncNowBtn) {
  try {
    const user = await getCurrentUser();
    currentUser = user;
    
    const authStatusDisplay = document.getElementById('auth-status-display');
    const authForms = document.getElementById('auth-forms');

    if (user && user.email) {
      // User is logged in
      firebaseReady = true;
      if (authStatusDisplay) {
        document.getElementById('current-user-email').textContent = user.email;
        authStatusDisplay.style.display = 'block';
      }
      if (authForms) authForms.style.display = 'none';
      if (syncNowBtn) syncNowBtn.disabled = false;
      
      // Load backups list
      await loadBackupsList();
    } else {
      // User not logged in
      firebaseReady = false;
      if (authStatusDisplay) authStatusDisplay.style.display = 'none';
      if (authForms) authForms.style.display = 'block';
      if (syncNowBtn) syncNowBtn.disabled = true;
      
      // Clear backups list
      const backupsList = document.getElementById('backupsList');
      if (backupsList) {
        backupsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Đăng nhập để xem các bản sao lưu</p>';
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

// Notes UI Management
export async function setupNotes() {
  const addNoteBtn = document.getElementById('addNoteBtn');
  const noteForm = document.getElementById('noteForm');
  const noteInput = document.getElementById('noteInput');
  const saveNoteBtn = document.getElementById('saveNoteBtn');
  const cancelNoteBtn = document.getElementById('cancelNoteBtn');
  const notesList = document.getElementById('notesList');
  const syncStatus = document.getElementById('syncStatus');

  // Show form to add/edit today's note
  addNoteBtn?.addEventListener('click', async () => {
    const todayNote = await getTodayNote();
    if (todayNote) {
      noteInput.value = todayNote.text;
    } else {
      noteInput.value = '';
    }
    noteForm.style.display = 'block';
    noteInput.focus();
  });

  // Cancel form
  cancelNoteBtn?.addEventListener('click', () => {
    noteForm.style.display = 'none';
    noteInput.value = '';
  });

  // Save or update note
  saveNoteBtn?.addEventListener('click', async () => {
    const text = noteInput.value.trim();
    if (!text) {
      alert('Please enter some notes');
      return;
    }
    
    await saveOrUpdateNote(text);
    noteInput.value = '';
    noteForm.style.display = 'none';
    await loadNotesList();
  });

  // Load initial notes
  await loadNotesList();
}

async function loadNotesList() {
  const notes = await getNotes();
  const notesList = document.getElementById('notesList');
  
  if (!notesList) return;

  if (notes.length === 0) {
    notesList.innerHTML = '<p class="empty-state">No notes yet. Click + to add today\'s notes.</p>';
    return;
  }

  let html = '';
  notes.forEach(note => {
    const date = new Date(note.date).toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: '2-digit'
    });
    const today = getTodayDateKey();
    const canEdit = note.dateKey >= today; // Allow editing today and future dates
    const isToday = note.dateKey === today;
    const itemClass = isToday ? 'notes-item today' : (canEdit ? 'notes-item future' : 'notes-item');
    const dateClass = isToday ? 'notes-item-date today' : 'notes-item-date';
    
    html += `
      <div class="${itemClass}">
        <div class="notes-item-header">
          <div class="${dateClass}">
            ${isToday ? '📅' : '📋'} ${date}${isToday ? ' (Today)' : ''}
          </div>
          <div class="notes-item-buttons">
            <button class="ask-chatgpt-btn" data-date="${note.dateKey}" style="background: transparent; border: none; color: #764ba2; cursor: pointer; padding: 0; font-size: 14px; transition: opacity 0.2s;" title="Ask ChatGPT about this note">💬</button>
            ${canEdit ? `<button class="edit-note-btn" data-date="${note.dateKey}" style="background: transparent; border: none; color: #667eea; cursor: pointer; padding: 0; font-size: 12px; transition: opacity 0.2s;" title="Edit this note">✏️</button>` : ''}
          </div>
        </div>
        <div class="notes-item-text">
          ${escapeHtml(note.text)}
        </div>
      </div>
    `;
  });

  notesList.innerHTML = html;

  // Add ask ChatGPT listeners for all notes
  notesList.querySelectorAll('.ask-chatgpt-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dateKey = btn.dataset.date;
      const notes = await getNotes();
      const note = notes.find(n => n.dateKey === dateKey);
      if (note) {
        await askChatGPT(note.text);
      }
    });
  });

  // Add edit listeners for editable notes (today and future)
  notesList.querySelectorAll('.edit-note-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dateKey = btn.dataset.date;
      const notes = await getNotes();
      const note = notes.find(n => n.dateKey === dateKey);
      if (note) {
        document.getElementById('noteInput').value = note.text;
        document.getElementById('noteForm').style.display = 'block';
        document.getElementById('noteInput').focus();
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Send note to ChatGPT - reuses existing send_prompt action
async function askChatGPT(noteText) {
  try {
    // Use existing send_prompt action from results.js
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'send_prompt', prompt: noteText }, (response) => {
        resolve(response);
      });
    });
    
    if (response?.status === 'ok') {
      console.log('[Notes] Sent to ChatGPT successfully');
      // Optional: show a brief success message
      const syncStatus = document.getElementById('syncStatus');
      if (syncStatus) {
        syncStatus.textContent = '✅ Sent to ChatGPT';
        syncStatus.className = 'status-message success';
        setTimeout(() => {
          syncStatus.textContent = '';
          syncStatus.className = '';
        }, 2000);
      }
    } else {
      console.error('[Notes] Failed to send to ChatGPT:', response);
      alert('Failed to send to ChatGPT. Make sure ChatGPT tab is open.');
    }
  } catch (err) {
    console.error('[Notes] Error asking ChatGPT:', err);
    alert('Error: ' + err.message);
  }
}
