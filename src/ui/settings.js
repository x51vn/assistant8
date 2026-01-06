import { setActivePage } from './pages.js';
import { showStatus } from './status.js';
import { loadSettings } from './storage.js';

export function setupSettings(dom) {
  const {
    promptInput,
    autoRunCheckbox,
    intervalInput,
    saveBtn,
    sendBtn,
    resetBtn,
    saveStatus,
    resultsPage,
    settingsPage,
    resultsBtn,
    settingsBtn,
    getAndDisplayResult,
  } = dom;

  saveBtn?.addEventListener('click', async () => {
    const prompt = (promptInput?.value || '').trim();
    if (!prompt) {
      showStatus(saveStatus, 'Vui lòng nhập prompt!', 'error');
      return;
    }

    const settings = {
      prompt,
      autoRun: !!autoRunCheckbox?.checked,
      interval: parseInt(intervalInput?.value, 10) || 5,
    };

    await chrome.storage.local.set(settings);
    showStatus(saveStatus, 'Lưu cấu hình thành công!', 'success');
  });

  resetBtn?.addEventListener('click', () => {
    if (promptInput) promptInput.value = '';
    if (autoRunCheckbox) autoRunCheckbox.checked = false;
    if (intervalInput) intervalInput.value = 5;
    chrome.storage.local.clear();
    showStatus(saveStatus, 'Reset cấu hình!', 'info');
  });

  sendBtn?.addEventListener('click', async () => {
    const prompt = (promptInput?.value || '').trim();
    if (!prompt) {
      showStatus(saveStatus, 'Vui lòng nhập prompt!', 'error');
      return;
    }

    showStatus(saveStatus, 'Đang gửi prompt...', 'info');

    chrome.runtime.sendMessage({ action: 'send_prompt', prompt }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(saveStatus, `Lỗi: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response && response.status === 'ok') {
        showStatus(saveStatus, 'Prompt đã gửi!', 'success');

        setTimeout(() => {
          setActivePage({ resultsPage, settingsPage, resultsBtn, settingsBtn, page: 'results' });
          setTimeout(() => {
            getAndDisplayResult?.();
          }, 2500);
        }, 250);
      } else {
        showStatus(saveStatus, 'Không gửi được prompt!', 'error');
      }
    });
  });

  loadSettings({ promptInput, autoRunCheckbox, intervalInput });
}
