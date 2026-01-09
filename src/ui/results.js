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
    if (resultText) resultText.textContent = 'Đang gửi prompt và chờ phản hồi từ ChatGPT...';

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
      
      // Keep loading and poll for result every 3 seconds
      const runId = response.runId;
      let pollCount = 0;
      const maxPolls = 100; // Max 5 minutes (100 * 3s)
      
      const pollInterval = setInterval(() => {
        pollCount++;
        if (pollCount > maxPolls) {
          clearInterval(pollInterval);
          showLoading(loadingSpinner, false);
          if (resultText) resultText.textContent = 'Timeout: Không nhận được kết quả sau 5 phút.';
          return;
        }
        
        chrome.runtime.sendMessage({ action: 'get_result' }, (pollResponse) => {
          if (chrome.runtime.lastError) {
            clearInterval(pollInterval);
            showLoading(loadingSpinner, false);
            if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
            return;
          }
          
          // Check if we have a fresh result for this runId
          if (pollResponse && pollResponse.result && pollResponse.source === 'live') {
            clearInterval(pollInterval);
            showLoading(loadingSpinner, false);
            if (resultText) resultText.textContent = pollResponse.result;
          } else {
            // Still waiting, update status text
            if (resultText) resultText.textContent = `Đang chờ phản hồi từ ChatGPT... (${pollCount * 3}s)`;
          }
        });
      }, 3000);
    });
  });

  refreshBtn?.addEventListener('click', () => {
    getAndDisplayResult();
  });

  return { getAndDisplayResult };
}
