import { showLoading } from './status.js';

export function setupResults(dom) {
  const { runBtn, refreshBtn, resultText, loadingSpinner } = dom;

  function getAndDisplayResult() {
    chrome.runtime.sendMessage({ action: 'get_result' }, (response) => {
      showLoading(loadingSpinner, false);
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

  runBtn?.addEventListener('click', async () => {
    const result = await chrome.storage.local.get('prompt');
    const prompt = result.prompt || 'Xin chào!';

    showLoading(loadingSpinner, true);
    if (resultText) resultText.textContent = 'Đang xử lý...';

    chrome.runtime.sendMessage({ action: 'send_prompt', prompt }, (response) => {
      if (chrome.runtime.lastError) {
        showLoading(loadingSpinner, false);
        if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!response || response.status !== 'ok') {
        showLoading(loadingSpinner, false);
        if (resultText) resultText.textContent = 'Không gửi được prompt.';
        return;
      }
      setTimeout(() => {
        getAndDisplayResult();
      }, 2500);
    });
  });

  refreshBtn?.addEventListener('click', () => {
    getAndDisplayResult();
  });

  return { getAndDisplayResult };
}
