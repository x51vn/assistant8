// Side Panel JavaScript (nhẹ, ổn định)

const resultsBtn = document.getElementById('resultsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const resultsPage = document.getElementById('resultsPage');
const settingsPage = document.getElementById('settingsPage');

if (!resultsBtn || !settingsBtn || !resultsPage || !settingsPage) {
  console.error('Side panel DOM missing required elements');
}

resultsBtn?.addEventListener('click', () => {
  resultsPage.classList.add('active');
  settingsPage.classList.remove('active');
  resultsBtn.classList.add('active');
  settingsBtn.classList.remove('active');
});

settingsBtn?.addEventListener('click', () => {
  settingsPage.classList.add('active');
  resultsPage.classList.remove('active');
  settingsBtn.classList.add('active');
  resultsBtn.classList.remove('active');
  loadSettings();
});

// Results
const runBtn = document.getElementById('runBtn');
const refreshBtn = document.getElementById('refreshBtn');
const resultText = document.getElementById('resultText');
const loadingSpinner = document.getElementById('loadingSpinner');

runBtn?.addEventListener('click', async () => {
  const result = await chrome.storage.local.get('prompt');
  const prompt = result.prompt || 'Xin chào!';

  showLoading(true);
  if (resultText) resultText.textContent = 'Đang xử lý...';

  chrome.runtime.sendMessage(
    { action: 'send_prompt', prompt },
    (response) => {
      if (chrome.runtime.lastError) {
        showLoading(false);
        if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!response || response.status !== 'ok') {
        showLoading(false);
        if (resultText) resultText.textContent = 'Không gửi được prompt.';
        return;
      }
      setTimeout(() => {
        getAndDisplayResult();
      }, 2500);
    }
  );
});

refreshBtn?.addEventListener('click', () => {
  getAndDisplayResult();
});

function showLoading(show) {
  if (!loadingSpinner) return;
  if (show) loadingSpinner.classList.remove('hidden');
  else loadingSpinner.classList.add('hidden');
}

async function getAndDisplayResult() {
  chrome.runtime.sendMessage({ action: 'get_result' }, (response) => {
    showLoading(false);
    if (chrome.runtime.lastError) {
      if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (response && response.result) {
      if (resultText) resultText.textContent = response.result;
    } else {
      if (resultText) resultText.textContent = 'Chưa có kết quả. Hãy chắc chắn ChatGPT đã mở và đã gửi prompt.';
    }
  });
}

// Settings
const promptInput = document.getElementById('promptInput');
const autoRunCheckbox = document.getElementById('autoRunCheckbox');
const intervalInput = document.getElementById('intervalInput');
const saveBtn = document.getElementById('saveBtn');
const sendBtn = document.getElementById('sendBtn');
const resetBtn = document.getElementById('resetBtn');
const saveStatus = document.getElementById('saveStatus');

saveBtn?.addEventListener('click', async () => {
  const prompt = (promptInput?.value || '').trim();
  if (!prompt) {
    showStatus('Vui lòng nhập prompt!', 'error');
    return;
  }

  const settings = {
    prompt,
    autoRun: !!autoRunCheckbox?.checked,
    interval: parseInt(intervalInput?.value, 10) || 5,
  };

  await chrome.storage.local.set(settings);
  showStatus('Lưu cấu hình thành công!', 'success');
});

resetBtn?.addEventListener('click', () => {
  if (promptInput) promptInput.value = '';
  if (autoRunCheckbox) autoRunCheckbox.checked = false;
  if (intervalInput) intervalInput.value = 5;
  chrome.storage.local.clear();
  showStatus('Reset cấu hình!', 'info');
});

sendBtn?.addEventListener('click', async () => {
  const prompt = (promptInput?.value || '').trim();
  if (!prompt) {
    showStatus('Vui lòng nhập prompt!', 'error');
    return;
  }

  showStatus('Đang gửi prompt...', 'info');

  chrome.runtime.sendMessage(
    { action: 'send_prompt', prompt },
    (response) => {
      if (chrome.runtime.lastError) {
        showStatus(`Lỗi: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response && response.status === 'ok') {
        showStatus('Prompt đã gửi!', 'success');
        setTimeout(() => {
          resultsPage.classList.add('active');
          settingsPage.classList.remove('active');
          resultsBtn.classList.add('active');
          settingsBtn.classList.remove('active');
          setTimeout(() => {
            getAndDisplayResult();
          }, 2500);
        }, 250);
      } else {
        showStatus('Không gửi được prompt!', 'error');
      }
    }
  );
});

function showStatus(message, type) {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.className = `status-message ${type}`;

  setTimeout(() => {
    saveStatus.textContent = '';
    saveStatus.className = 'status-message';
  }, 3000);
}

function loadSettings() {
  chrome.storage.local.get(['prompt', 'autoRun', 'interval'], (result) => {
    if (promptInput) promptInput.value = result.prompt || '';
    if (autoRunCheckbox) autoRunCheckbox.checked = result.autoRun || false;
    if (intervalInput) intervalInput.value = result.interval || 5;
  });
}

async function loadCachedResultFast() {
  if (!resultText) return;
  const cached = await chrome.storage.local.get(['lastResult']);
  if (cached && cached.lastResult) {
    resultText.textContent = cached.lastResult;
  }
}

loadSettings();
loadCachedResultFast();

chrome.runtime.sendMessage({ action: 'ensure_chatgpt_open' });
