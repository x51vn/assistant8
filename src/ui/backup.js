import { showStatus } from './status.js';

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
  'settings'
];

export function setupBackup(dom) {
  const { exportBtn, importBtn, importFileInput, backupStatus } = dom;

  // Export button
  exportBtn?.addEventListener('click', async () => {
    try {
      showStatus(backupStatus, '📦 Đang xuất dữ liệu...', 'info');
      
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

      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `chatgpt-assistant-backup-${timestamp}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      console.log('[Backup] Export completed');
      showStatus(backupStatus, '✅ Xuất dữ liệu thành công!', 'success');
    } catch (err) {
      console.error('[Backup] Export error:', err);
      showStatus(backupStatus, `❌ Lỗi xuất: ${err.message}`, 'error');
    }
  });

  // Import button
  importBtn?.addEventListener('click', () => {
    importFileInput?.click();
  });

  // File input change
  importFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showStatus(backupStatus, '📂 Đang nhập dữ liệu...', 'info');
      
      const text = await file.text();
      const backup = JSON.parse(text);

      // Validate backup format
      if (!backup.version || !backup.data) {
        throw new Error('Format file không hợp lệ');
      }

      // Restore data
      await chrome.storage.local.set(backup.data);
      
      console.log('[Backup] Import completed:', Object.keys(backup.data).length, 'keys');
      showStatus(backupStatus, '✅ Nhập dữ liệu thành công! Vui lòng reload trang.', 'success');
      
      // Clear file input
      e.target.value = '';
    } catch (err) {
      console.error('[Backup] Import error:', err);
      showStatus(backupStatus, `❌ Lỗi nhập: ${err.message}`, 'error');
      e.target.value = '';
    }
  });
}
