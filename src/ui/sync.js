// Notes management module (local storage only)
// This module provides local notes (chrome.storage.local)

// Public API for notes. All business logic uses Supabase handlers.

// Messaging helper
function sendMessage(action, payload = {}) {
  return Promise.resolve(null);
}

// Deprecated API placeholders have been removed
// Use Supabase handlers for all data operations

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

// Periodic sync - not implemented
function schedulePeriodicSync(/* intervalMinutes = 60 */) {
  // No-op
}

function handleSyncAlarm() {
  // No-op
}

export async function setupSync(dom) {
  const {
    syncNowBtn,
    revokeGoogleBtn,
    syncStatus,
    syncEnabledCheckbox
  } = dom;

  // Setup UI buttons

  syncNowBtn?.addEventListener('click', async () => {
    try {
      showStatus(syncStatus, '❗ Sync feature is not available', 'info');
    } catch (err) {
      console.error('[Sync] Error:', err);
    }
  });

  revokeGoogleBtn?.addEventListener('click', async () => {
    showStatus(syncStatus, '❗ Feature not available', 'info');
  });

  // Sync enabled checkbox
  syncEnabledCheckbox?.addEventListener('change', async (e) => {
    const config = await getSyncConfig();
    await saveSyncConfig({
      ...config,
      syncEnabled: e.target.checked
    });

    if (e.target.checked) {
      showStatus(syncStatus, '❗ Feature not available', 'info');
    } else {
      showStatus(syncStatus, '✅ Disabled', 'success');
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
  const backupsList = document.getElementById('backupsList');

  try {
    if (authGoogleBtn) authGoogleBtn.style.display = 'none';
    if (syncNowBtn) {
      syncNowBtn.style.display = 'inline-block';
      syncNowBtn.disabled = false;
    }
    if (revokeGoogleBtn) revokeGoogleBtn.style.display = 'none';

    if (backupsList) {
      backupsList.innerHTML = '<p style="font-size: 12px; color: #666;">Local notes stored in this browser.</p>';
    }

    if (syncEnabledCheckbox) {
      syncEnabledCheckbox.checked = false;
      syncEnabledCheckbox.disabled = true;
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
    // Auth/logout behaviour removed - show info message
    showAuthMessage('❗ Auth/Sync removed from this build', 'info');
  });
}

async function updateAuthStatus(syncStatus, syncNowBtn) {
  if (syncNowBtn) syncNowBtn.disabled = false;
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
            <button class="ask-chatgpt-btn" data-date="${note.dateKey}" style="background: transparent; border: none; color: #764ba2; cursor: pointer; padding: 0; font-size: 14px; transition: opacity 0.2s;" title="Ask ChatGPT about this note"><i class="fas fa-comments"></i></button>
            ${canEdit ? `<button class="edit-note-btn" data-date="${note.dateKey}" style="background: transparent; border: none; color: #667eea; cursor: pointer; padding: 0; font-size: 12px; transition: opacity 0.2s;" title="Edit this note"><i class="fas fa-edit"></i></button>` : ''}
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

// Send note to ChatGPT - reuses existing send_prompt message
async function askChatGPT(noteText) {
  try {
    // Use SEND_PROMPT message type (schema-compliant)
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        v: 1,
        type: 'SEND_PROMPT',
        correlationId: `send-prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        data: { prompt: noteText }
      }, (response) => {
        resolve(response);
      });
    });
    
    if (response?.status === 'ok') {
      console.log('[Notes] Sent to ChatGPT successfully');
      // Optional: show a brief success message
      const syncStatus = document.getElementById('syncStatus');
      if (syncStatus) {
        syncStatus.textContent = '✓ Sent to ChatGPT';
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
