// Popup JavaScript (nhẹ, ổn định)

// Quản lý navigation
const resultsBtn = document.getElementById('resultsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const resultsPage = document.getElementById('resultsPage');
const settingsPage = document.getElementById('settingsPage');

if (!resultsBtn || !settingsBtn || !resultsPage || !settingsPage) {
  console.error('Popup DOM missing required elements');
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

// Results Page Logic
const runBtn = document.getElementById('runBtn');
const refreshBtn = document.getElementById('refreshBtn');
const resultText = document.getElementById('resultText');
const loadingSpinner = document.getElementById('loadingSpinner');

runBtn?.addEventListener('click', async () => {
  // Lấy prompt từ storage
  const result = await chrome.storage.local.get('prompt');
  const prompt = result.prompt || 'Xin chào!';

  showLoading(true);
  resultText.textContent = 'Đang xử lý...';

  // Gửi prompt tới background
  chrome.runtime.sendMessage(
    {
      action: 'send_prompt',
      prompt: prompt
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showLoading(false);
        resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!response || response.status !== 'ok') {
        showLoading(false);
        resultText.textContent = 'Không gửi được prompt.';
        return;
      }
      // Chờ một chút rồi lấy kết quả
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
  if (show) {
    loadingSpinner.classList.remove('hidden');
  } else {
    loadingSpinner.classList.add('hidden');
  }
}

async function getAndDisplayResult() {
  chrome.runtime.sendMessage(
    { action: 'get_result' },
    (response) => {
      showLoading(false);
      if (chrome.runtime.lastError) {
        resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (response && response.result) {
        resultText.textContent = response.result;
      } else {
        resultText.textContent = 'Chưa có kết quả. Hãy chắc chắn ChatGPT đã mở và đã gửi prompt.';
      }
    }
  );
}

// Settings Page Logic
const promptInput = document.getElementById('promptInput');
const autoRunCheckbox = document.getElementById('autoRunCheckbox');
const intervalInput = document.getElementById('intervalInput');
const saveBtn = document.getElementById('saveBtn');
const sendBtn = document.getElementById('sendBtn');
const resetBtn = document.getElementById('resetBtn');
const saveStatus = document.getElementById('saveStatus');

saveBtn?.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  
  if (!prompt) {
    showStatus('Vui lòng nhập prompt!', 'error');
    return;
  }

  const settings = {
    prompt: prompt,
    autoRun: autoRunCheckbox.checked,
    interval: parseInt(intervalInput.value) || 5
  };

  await chrome.storage.local.set(settings);
  showStatus('Lưu cấu hình thành công!', 'success');

  // Background sẽ tự bắt storage.onChanged để cập nhật alarm.
});

resetBtn?.addEventListener('click', () => {
  promptInput.value = '';
  autoRunCheckbox.checked = false;
  intervalInput.value = 5;
  chrome.storage.local.clear();
  showStatus('Reset cấu hình!', 'info');
});

sendBtn?.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  
  if (!prompt) {
    showStatus('Vui lòng nhập prompt!', 'error');
    return;
  }

  showStatus('Đang gửi prompt...', 'info');

  // Gửi prompt tới background
  chrome.runtime.sendMessage(
    {
      action: 'send_prompt',
      prompt: prompt
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showStatus(`Lỗi: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (response && response.status === 'ok') {
        showStatus('Prompt đã gửi!', 'success');
        // Chuyển sang tab Results để xem kết quả
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
  saveStatus.textContent = message;
  saveStatus.className = `status-message ${type}`;
  
  setTimeout(() => {
    saveStatus.textContent = '';
    saveStatus.className = 'status-message';
  }, 3000);
}

function loadSettings() {
  chrome.storage.local.get(['prompt', 'autoRun', 'interval'], (result) => {
    promptInput.value = result.prompt || '';
    autoRunCheckbox.checked = result.autoRun || false;
    intervalInput.value = result.interval || 5;
  });
}

async function loadCachedResultFast() {
  if (!resultText) return;
  const cached = await chrome.storage.local.get(['lastResult']);
  if (cached && cached.lastResult) {
    resultText.textContent = cached.lastResult;
  }
}

// Load nhanh khi popup mở
loadSettings();
loadCachedResultFast();

// Đảm bảo ChatGPT mở (không block UI)
chrome.runtime.sendMessage({ action: 'ensure_chatgpt_open' });
