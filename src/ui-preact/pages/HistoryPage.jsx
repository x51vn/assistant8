/**
 * HistoryPage.jsx - Chat history page
 * Displays ChatGPT conversation history from Supabase
 * 
 * X51LABS-154: History Page Implementation
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { fetchHistory, deleteHistory, clearAllHistory, openChat } from '../api/historyApi.js';
import { setGlobalLoading, hideLoading } from '../state/appState.js';

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Truncate text with ellipsis
 */
function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * HistoryItem component
 */
function HistoryItem({ item, onDelete, onOpenChat }) {
  const [isExpanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setConfirmDelete(false);
    await onDelete(item.id);
  };

  const hasLongContent = item.prompt?.length > 100 || item.response?.length > 150;

  return (
    <div class="history-item">
      <div class="history-item-header">
        <span class="history-date">{formatDate(item.timestamp)}</span>
      </div>
      
      <div class="history-content" onClick={() => setExpanded(!isExpanded)}>
        <div class="history-prompt">
          <strong>Prompt:</strong> {isExpanded ? item.prompt : truncate(item.prompt, 100)}
        </div>
        {item.response && (
          <div class="history-response">
            <strong>Response:</strong> {isExpanded ? item.response : truncate(item.response, 150)}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div class="history-item-footer">
        {hasLongContent && (
          <button class="btn-expand" onClick={() => setExpanded(!isExpanded)}>
            {isExpanded ? 'Thu gọn ↑' : 'Xem thêm ↓'}
          </button>
        )}
        {item.chat_url && (
          <button
            class="btn-expand"
            title="Mở ChatGPT"
            onClick={() => onOpenChat(item.chat_url)}
          >
            <i class="fas fa-external-link-alt"></i> Mở
          </button>
        )}
        <button
          class="btn-expand btn-delete-subtle"
          title="Xóa"
          onClick={() => setConfirmDelete(true)}
        >
          <i class="fas fa-trash"></i> Xóa
        </button>
      </div>

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc chắn muốn xóa mục lịch sử này?</p>
            <div class="confirm-buttons">
              <button class="btn-cancel" onClick={() => setConfirmDelete(false)}>
                Hủy
              </button>
              <button class="btn-confirm-delete" onClick={handleDelete}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * HistoryPage component
 */
export function HistoryPage() {
  const [historyItems, setHistoryItems] = useState([]);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadHistory = async () => {
    setGlobalLoading(true, 'Đang tải lịch sử...');
    setError(null);
    
    const result = await fetchHistory(50);
    
    if (result.error) {
      setError(result.error.message);
    } else {
      // Sort by timestamp descending (most recent first)
      const sorted = [...result.items].sort((a, b) => 
        (b.timestamp || 0) - (a.timestamp || 0)
      );
      setHistoryItems(sorted);

      // Auto-trim: if more than 30 items, delete the oldest ones
      if (sorted.length > 30) {
        const itemsToDelete = sorted.slice(30);
        for (const old of itemsToDelete) {
          await deleteHistory(old.id);
        }
        setHistoryItems(sorted.slice(0, 30));
      }
    }
    
    hideLoading();
  };

  const handleDelete = async (id) => {
    const result = await deleteHistory(id);
    
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    } else {
      setHistoryItems(prev => prev.filter(item => item.id !== id));
      showToast('Đã xóa mục lịch sử');
    }
  };

  const handleClearAll = async () => {
    
    const result = await clearAllHistory();
    
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    } else {
      setHistoryItems([]);
      showToast('Đã xóa toàn bộ lịch sử');
    }
  };

  const handleOpenChat = async (chatUrl) => {
    const result = await openChat(chatUrl);
    
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    }
  };

  return (
    <div class="page-container history-page">
      {/* Header */}
      <div class="page-header">
        <h2>
          <i class="fas fa-history"></i> Chat History
        </h2>
        <div class="header-actions">
          <button
            class="btn-icon btn-refresh"
            title="Làm mới"
            onClick={loadHistory}
          >
            <i class="fas fa-sync-alt"></i>
          </button>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div class={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div class="error-banner">
          <span class="error-icon"><i class="fas fa-exclamation-triangle"></i></span>
          <span class="error-message">{error}</span>
          <button class="btn-retry" onClick={loadHistory}>Thử lại</button>
        </div>
      )}

      {/* Empty State */}
      {!error && historyItems.length === 0 && (
        <div class="empty-state">
          <i class="fas fa-scroll empty-icon"></i>
          <h3>Chưa có lịch sử</h3>
          <p>Các cuộc hội thoại với ChatGPT sẽ được hiển thị ở đây</p>
        </div>
      )}

      {/* History List */}
      {!error && historyItems.length > 0 && (
        <div class="history-list">
          {historyItems.map(item => (
            <HistoryItem
              key={item.id}
              item={item}
              onDelete={handleDelete}
              onOpenChat={handleOpenChat}
            />
          ))}
        </div>
      )}


    </div>
  );
}

