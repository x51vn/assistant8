/**
 * GPT-043: Results + History Preact component
 * Displays chat results and history list with actions
 */
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export default function Results() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentResult, setCurrentResult] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.HISTORY_GET_ALL,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });

      if (!response.errorCode) {
        // Handler returns `history` (new) but legacy code/tests may expect `items`.
        const items = response.history || response.items || [];
        setHistory(items);
        if (items.length > 0 && !currentResult) {
          setCurrentResult(items[0]); // Show latest as default
        }
      } else {
        // Fallback for unauthenticated / Supabase error: load legacy local storage history
        try {
          const stored = await chrome.storage.local.get(['chatHistory']);
          const local = Array.isArray(stored.chatHistory) ? stored.chatHistory : [];
          setHistory(local);
          if (local.length > 0 && !currentResult) setCurrentResult(local[0]);
        } catch (e) {
          console.warn('Failed to load local history fallback:', e);
        }
      }
    } catch (error) {
      console.error('Load history error:', error);
      // On unexpected error, also try local fallback
      try {
        const stored = await chrome.storage.local.get(['chatHistory']);
        const local = Array.isArray(stored.chatHistory) ? stored.chatHistory : [];
        setHistory(local);
        if (local.length > 0 && !currentResult) setCurrentResult(local[0]);
      } catch (e) {
        console.warn('Failed to load local history fallback:', e);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshHistory() {
    loadHistory();
  }

  async function handleClearHistory() {
    if (!confirm('Xóa tất cả lịch sử? Không thể khôi phục.')) return;

    try {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.HISTORY_CLEAR,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
      });
      // Clear both Supabase and local fallback
      try { await chrome.storage.local.remove(['chatHistory']); } catch {}
      setHistory([]);
      setCurrentResult(null);
    } catch (error) {
      console.error('Clear history error:', error);
    }
  }

  return (
    <div id="results" className="page active">
      <div className="content">
        <div className="page-header">
          <h3 style={{ margin: 0 }}>Kết quả & Lịch sử</h3>
          <div>
            <button className="icon-btn" onClick={handleRefreshHistory} title="Làm mới lịch sử">
              <i className="fas fa-rotate-right"></i>
            </button>
            <button className="icon-btn" onClick={handleClearHistory} title="Xóa tất cả lịch sử">
              <i className="fas fa-trash"></i>
            </button>
          </div>
        </div>

        {/* Result Display Area */}
        {currentResult && (
          <div style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9', borderRadius: '4px' }}>
            <h4 style={{ marginTop: 0 }}>Kết quả gần nhất</h4>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
              <strong>Chat:</strong>{' '}
              <a href={currentResult.chat_url} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
                Mở chat
              </a>
            </div>
            <div className="result-box" style={{ maxHeight: '200px' }}>
              <div className="result-text">{currentResult.response || currentResult.prompt}</div>
            </div>
          </div>
        )}

        {/* History List */}
        <div className="history-section">
          <h3 style={{ marginTop: '16px' }}>Lịch sử Chat</h3>
          <div className="history-list">
            {loading ? (
              <p className="empty-state">
                <i className="fas fa-spinner fa-spin"></i> Loading...
              </p>
            ) : history.length === 0 ? (
              <p className="empty-state">Chưa có lịch sử. Chạy prompt để bắt đầu.</p>
            ) : (
              history.map(item => (
                <div
                  key={item.id}
                  className="history-item"
                  onClick={() => setCurrentResult(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="history-item-header">
                    <span className="history-chat-id">{item.chat_id?.substring(0, 8)}</span>
                    <span className="history-timestamp">
                      {new Date(item.timestamp).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  <div className="history-prompt">{item.prompt}</div>
                  {item.response && (
                    <div className="history-response">{item.response.substring(0, 150)}...</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
