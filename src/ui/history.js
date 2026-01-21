import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

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
    const displayChat = item.chatUrl || (item.chatId ? `https://chatgpt.com/c/${item.chatId}` : '—');
    const div = document.createElement('div');
    div.className = 'history-item';
    div.dataset.chatId = item.chatId;
    
    div.innerHTML = `
      <div class="history-item-header">
        <span class="history-timestamp">${formatDate(item.timestamp)}</span>
        <span class="history-chat-id">${displayChat}</span>
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
    
    const hasChat = !!(item.chatUrl || item.chatId);
    if (!hasChat) {
      alert('Không có chatId/chatUrl hợp lệ để mở.');
      return;
    }

    console.log('[History] Opening chat:', item.chatId);
    
    // Open ChatGPT tab with the specific chat ID using v1 schema
    const message = {
      v: 1,
      type: MESSAGE_TYPES.CHAT_OPEN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        chatId: item.chatId,
        chatUrl: item.chatUrl
      }
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[History] Error opening chat:', chrome.runtime.lastError);
        alert('Không thể mở chat. Vui lòng thử lại.');
        return;
      }
      
      if (response && response.type === MESSAGE_TYPES.CHAT_OPENED) {
        console.log('[History] Chat opened in tab:', response.payload?.tabId);
      } else if (response && response.type === MESSAGE_TYPES.ERROR) {
        const errorMsg = response.error?.message || response.error || response.payload?.error || 'unknown_error';
        console.error('[History] Failed to open chat:', errorMsg);
        alert('Không thể mở chat.');
      }
    });
  }

  async function loadHistory() {
    console.log('[History] Loading history...');
    
    if (!historyList) {
      console.warn('[History] historyList element not found');
      return;
    }
    
    try {
      // Get all storage keys and also chatHistory array
      const allData = await chrome.storage.local.get(null);
      const conversations = [];

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('conversation_')) {
          const normalized = normalizeChatMeta(value.chatId, value.chatUrl);
          conversations.push({
            key,
            timestamp: value.timestamp || parseInt(key.split('_')[1]) || 0,
            prompt: value.prompt || '',
            response: value.result || value.response || '',
            chatUrl: normalized.chatUrl,
            chatId: normalized.chatId,
            source: 'results'
          });
        }
      }

      const chatHistory = Array.isArray(allData.chatHistory) ? allData.chatHistory : [];
      chatHistory.forEach((item, index) => {
        const normalized = normalizeChatMeta(item.chatId, item.chatUrl);
        conversations.push({
          key: item.timestamp ? `chatHistory_${item.timestamp}` : `chatHistory_${index}`,
          timestamp: item.timestamp || 0,
          prompt: item.prompt || '',
          response: item.response || '',
          chatUrl: normalized.chatUrl,
          chatId: normalized.chatId,
          source: item.source || 'portfolio'
        });
      });

      // De-duplicate by chatId + timestamp when possible
      const seen = new Set();
      const deduped = [];
      for (const item of conversations) {
        const key = `${item.chatId || 'nochat'}_${item.timestamp || 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      
      // Sort by timestamp descending (newest first)
      deduped.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('[History] Found', deduped.length, 'conversations');
      
      if (deduped.length === 0) {
        historyList.innerHTML = '<p class="empty-state">Chưa có lịch sử. Chạy prompt để bắt đầu.</p>';
        return;
      }
      
      // Render history items
      historyList.innerHTML = '';
      deduped.slice(0, 100).forEach(item => { // Limit to 100 most recent
        const itemEl = renderHistoryItem({
          chatId: item.chatId,
          chatUrl: item.chatUrl,
          timestamp: item.timestamp,
          prompt: item.prompt,
          response: item.response
        });
        historyList.appendChild(itemEl);
      });
      
      console.log('[History] Rendered', Math.min(deduped.length, 100), 'history items');
      
    } catch (error) {
      console.error('[History] Error loading history:', error);
      historyList.innerHTML = '<p class="empty-state">Lỗi tải lịch sử.</p>';
    }
  }
  
  function extractChatId(chatUrl) {
    if (!chatUrl) return null;
    const match = chatUrl.match(/\/(?:c|g)\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function normalizeChatMeta(chatId, chatUrl) {
    let id = typeof chatId === 'string' ? chatId.trim() : '';
    let url = typeof chatUrl === 'string' ? chatUrl.trim() : '';

    if (id && (id.startsWith('http://') || id.startsWith('https://'))) {
      url = id;
      id = extractChatId(url) || '';
    }

    if (id.startsWith('conversation_')) {
      id = '';
    }

    if (!id && url) {
      id = extractChatId(url) || '';
    }

    if (!url && id) {
      url = `https://chatgpt.com/c/${id}`;
    }

    return { chatId: id, chatUrl: url };
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
    clearHistoryBtn.addEventListener('click', async () => {
      if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử chat?')) return;
      
      console.log('[History] Clearing all history...');
      
      try {
        // Get all conversation keys
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allData).filter(key => key.startsWith('conversation_'));
        
        console.log('[History] Removing', keysToRemove.length, 'conversations');
        
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          console.log('[History] All history cleared');
          loadHistory(); // Reload to show empty state
        } else {
          console.log('[History] No history to clear');
        }
      } catch (error) {
        console.error('[History] Error clearing history:', error);
        alert('Lỗi khi xóa lịch sử!');
      }
    });
  }

  // Load history immediately on startup
  loadHistory();

  return { loadHistory };
}
