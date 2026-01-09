import { showLoading } from './status.js';

export function setupResults(dom) {
  const { runBtn, stopBtn, refreshBtn, resultText, loadingSpinner } = dom;
  let currentPollInterval = null;

  function getAndDisplayResult() {
    console.log('[Results] Getting result...');
    chrome.runtime.sendMessage({ action: 'get_result' }, (response) => {
      console.log('[Results] Get result response:', response);
      showLoading(loadingSpinner, false);
      if (chrome.runtime.lastError) {
        console.error('[Results] Get result error:', chrome.runtime.lastError);
        if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (response && response.result) {
        console.log('[Results] Result found, length:', response.result.length);
        if (resultText) resultText.textContent = response.result;
      } else {
        console.log('[Results] No result yet');
        if (resultText) resultText.textContent = 'Chưa có kết quả. Hãy chắc chắn ChatGPT đã mở và đã gửi prompt.';
      }
    });
  }

  function stopPolling() {
    if (currentPollInterval) {
      clearInterval(currentPollInterval);
      currentPollInterval = null;
    }
    showLoading(loadingSpinner, false);
    if (runBtn) runBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
  }

  runBtn?.addEventListener('click', async () => {
    console.log('[Results] Run button clicked');
    const result = await chrome.storage.local.get('prompt');
    const prompt = result.prompt || 'Xin chào!';
    const promptStr = typeof prompt === 'string' ? prompt : String(prompt);
    console.log('[Results] Prompt to send:', promptStr.substring(0, 100) + '...');

    showLoading(loadingSpinner, true);
    if (resultText) resultText.textContent = 'Đang gửi prompt và chờ phản hồi từ ChatGPT...';
    
    // Show stop button, hide run button
    if (runBtn) runBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = '';

    chrome.runtime.sendMessage({ action: 'send_prompt', prompt }, (response) => {
      console.log('[Results] Send prompt response:', response);
      if (chrome.runtime.lastError) {
        stopPolling();
        if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!response || response.status !== 'ok') {
        stopPolling();
        if (resultText) resultText.textContent = 'Không gửi được prompt.';
        return;
      }
      
      // If in review mode, don't poll for result
      if (response.reviewMode) {
        console.log('[Results] Review mode enabled, not polling');
        stopPolling();
        if (resultText) resultText.textContent = 'Prompt đã được điền vào ChatGPT. Hãy kiểm tra và tự bấm gửi khi sẵn sàng.';
        return;
      }
      
      // Keep loading and poll for result every 3 seconds (no timeout - wait indefinitely)
      const runId = response.runId;
      console.log('[Results] Starting poll for runId:', runId);
      let pollCount = 0;
      
      currentPollInterval = setInterval(() => {
        pollCount++;
        console.log('[Results] Poll attempt', pollCount);
        
        chrome.runtime.sendMessage({ action: 'get_result' }, (pollResponse) => {
          console.log('[Results] Poll response:', { hasResult: !!pollResponse?.result, source: pollResponse?.source, pollCount });
          if (chrome.runtime.lastError) {
            console.error('[Results] Poll error:', chrome.runtime.lastError);
            stopPolling();
            if (resultText) resultText.textContent = `Lỗi: ${chrome.runtime.lastError.message}`;
            return;
          }
          
          // Check if we have a fresh result for this runId
          if (pollResponse && pollResponse.result && pollResponse.source === 'live') {
            console.log('[Results] Got live result, stopping poll');
            stopPolling();
            if (resultText) resultText.textContent = pollResponse.result;
          } else {
            console.log('[Results] Still waiting for result...');
            // Still waiting, update status text
            const minutes = Math.floor(pollCount * 3 / 60);
            const seconds = (pollCount * 3) % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            if (resultText) resultText.textContent = `Đang chờ phản hồi từ ChatGPT... (${timeStr})`;
          }
        });
      }, 3000);
    });
  });

  stopBtn?.addEventListener('click', () => {
    stopPolling();
    if (resultText) resultText.textContent = 'Đã dừng chờ. Nhấn "Làm mới" để kiểm tra kết quả hoặc "Chạy ngay" để thử lại.';
  });

  refreshBtn?.addEventListener('click', () => {
    getAndDisplayResult();
  });

  return { getAndDisplayResult };
}
