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
    const str = typeof text === 'string' ? text : String(text);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
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
    
    console.log('[History] Opening chat:', item.chatId);
    
    // Open ChatGPT tab with the specific chat ID
    chrome.runtime.sendMessage({ 
      action: 'open_chat_url', 
      chatId: item.chatId,
      chatUrl: item.chatUrl 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[History] Error opening chat:', chrome.runtime.lastError);
        alert('Không thể mở chat. Vui lòng thử lại.');
        return;
      }
      
      if (response && response.status === 'ok') {
        console.log('[History] Chat opened in tab:', response.tabId);
      } else {
        console.error('[History] Failed to open chat:', response);
        alert('Không thể mở chat.');
      }
    });
  }

  function loadHistory() {
    console.log('[History] Loading history...');
    chrome.runtime.sendMessage({ action: 'get_chat_history' }, (response) => {
      console.log('[History] get_chat_history response:', { count: response?.history?.length || 0 });
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
      
      console.log('[History] Rendered', history.length, 'history items');
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

  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử chat?')) return;
      
      console.log('[History] Clearing all history...');
      chrome.runtime.sendMessage({ action: 'clear_chat_history' }, (response) => {
        console.log('[History] Clear response:', response);
        if (chrome.runtime.lastError || !response || response.status !== 'ok') {
          alert('Lỗi khi xóa lịch sử!');
          return;
        }
        loadHistory();
      });
    });
  }

  // Load history immediately on startup
  loadHistory();

  return { loadHistory };
}
