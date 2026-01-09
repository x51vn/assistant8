export function setupHistory(dom) {
  const { historyBtn, historyPage, historyList, refreshHistoryBtn } = dom;

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} ngày trước`;
    if (hours > 0) return `${hours} giờ trước`;
    if (minutes > 0) return `${minutes} phút trước`;
    return 'Vừa xong';
  }

  function truncate(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  function renderHistoryItem(item) {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.dataset.chatId = item.chatId;
    
    div.innerHTML = `
      <div class="history-item-header">
        <span class="history-timestamp">${formatDate(item.timestamp)}</span>
        <span class="history-chat-id">${truncate(item.chatId, 12)}</span>
      </div>
      <div class="history-prompt"><strong>Prompt:</strong> ${truncate(item.prompt, 150)}</div>
      <div class="history-response"><strong>Response:</strong> ${truncate(item.response, 200)}</div>
    `;

    div.addEventListener('click', () => {
      showHistoryDetail(item);
    });

    return div;
  }

  function showHistoryDetail(item) {
    if (!item) return;
    
    // Navigate to results page and display the full response
    const resultsBtn = document.getElementById('resultsBtn');
    const resultText = document.getElementById('resultText');
    
    if (resultsBtn) resultsBtn.click();
    if (resultText) {
      resultText.textContent = `--- Lịch sử Chat ---\n\nChat ID: ${item.chatId}\nThời gian: ${new Date(item.timestamp).toLocaleString('vi-VN')}\n\nPrompt:\n${item.prompt}\n\nResponse:\n${item.response}`;
    }
  }

  function loadHistory() {
    chrome.runtime.sendMessage({ action: 'get_chat_history' }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== 'ok') {
        if (historyList) {
          historyList.innerHTML = '<p class="empty-state">Lỗi tải lịch sử.</p>';
        }
        return;
      }

      const history = response.history || [];
      
      if (!historyList) return;

      if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-state">Chưa có lịch sử. Chạy prompt để bắt đầu.</p>';
        return;
      }

      historyList.innerHTML = '';
      history.forEach(item => {
        const itemEl = renderHistoryItem(item);
        historyList.appendChild(itemEl);
      });
    });
  }

  // Load history when switching to history page
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      loadHistory();
    });
  }

  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', () => {
      loadHistory();
    });
  }

  return { loadHistory };
}
