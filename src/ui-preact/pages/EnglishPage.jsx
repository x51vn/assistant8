/**
 * EnglishPage.jsx - English learning page
 * Generate English learning exercises using ChatGPT and save to Supabase
 * 
 * Features:
 * - Manual or auto topic selection
 * - Generate English exercises via ChatGPT
 * - Save and manage learning records
 * - Open saved chats in ChatGPT
 * 
 * Documentation: docs/ENGLISH_MODULE_FEATURES.md
 */

import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import {
  fetchEnglishList,
  addEnglish,
  deleteEnglish,
  openEnglishChat,
  sendPromptToChatGPT,
  getChatGPTOutput,
  getEnglishPromptTemplate,
  autoSelectTopic
} from '../api/englishApi.js';
import { showConfirm } from '../state/settingsState.js';
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
    month: '2-digit'
  });
}

/**
 * EnglishItem component - Display a single English learning record
 */
function EnglishItem({ item, onDelete, onOpen }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setConfirmDelete(false);
    await onDelete(item.id);
  };

  const handleClick = (e) => {
    // Don't trigger if clicking delete button
    if (e.target.closest('.btn-delete')) return;
    onOpen(item.chat_id);
  };

  return (
    <div class="result-item english-item" onClick={handleClick}>
      <div class="english-content">
        <div class="english-topic"><i class="fas fa-book"></i> {item.topic}</div>
        <div class="english-meta">
          Chat: <strong>{item.chat_id.substring(0, 8)}</strong> • {formatDate(item.created_at)}
        </div>
      </div>
      <button
        class="btn-icon btn-delete"
        title="Xóa"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(true);
        }}
      >
        <i class="fas fa-times"></i>
      </button>

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div class="confirm-dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div class="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Xóa câu học?</h3>
            <p>Bạn có chắc chắn muốn xóa câu này?</p>
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
 * EnglishPage component
 */
export function EnglishPage() {
  const [topic, setTopic] = useState('');
  const [englishList, setEnglishList] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [toast, setToast] = useState(null);
  const pollIntervalRef = useRef(null);
  const currentPromptRef = useRef(null);
  const currentTopicRef = useRef(null);

  // Load English list on mount
  useEffect(() => {
    loadEnglishList();
    
    // Cleanup polling on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadEnglishList = async () => {
    setGlobalLoading(true, 'Loading saved exercises...');
    
    const result = await fetchEnglishList();
    
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    } else {
      // Sort by created_at descending (most recent first)
      const sorted = [...result.items].sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeB - timeA;
      });
      setEnglishList(sorted);
    }
    
    hideLoading();
  };

  const handleDelete = async (id) => {
    const result = await deleteEnglish(id);
    
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    } else {
      setEnglishList(prev => prev.filter(item => item.id !== id));
      showToast('Đã xóa câu học');
    }
  };

  const handleOpenChat = async (chatId) => {
    const result = await openEnglishChat(chatId);
    
    if (result.error) {
      showToast(`Lỗi: ${result.error.message}`, 'error');
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const pollForResponse = async () => {
    let pollCount = 0;
    const maxPolls = 60; // 3 minutes (60 * 3s)
    
    pollIntervalRef.current = setInterval(async () => {
      pollCount++;
      
      if (pollCount > maxPolls) {
        stopPolling();
        setResultMessage({
          type: 'error',
          text: '⏱️ Timeout - ChatGPT không phản hồi sau 3 phút'
        });
        setGenerating(false);
        return;
      }
      
      setResultMessage({
        type: 'loading',
        text: `Đang chờ response... (${pollCount * 3}s)`
      });
      
      const result = await getChatGPTOutput();
      
      if (result.output) {
        stopPolling();
        
        // Save to Supabase
        const saveResult = await addEnglish(
          result.chatId,
          currentTopicRef.current,
          currentPromptRef.current
        );
        
        if (saveResult.error) {
          setResultMessage({
            type: 'error',
            text: `Lỗi lưu: ${saveResult.error.message}`
          });
        } else {
          setResultMessage({
            type: 'success',
            text: `Đã lưu! (Chat: ${result.chatId.substring(0, 8)})\n\nNhấn vào item để mở ChatGPT`
          });
          
          // Refresh list
          await loadEnglishList();
        }
        
        setGenerating(false);
        currentPromptRef.current = null;
        currentTopicRef.current = null;
      }
    }, 3000);
  };

  const handleGenerate = async () => {
    let finalTopic = topic.trim();
    
    // Auto-select topic if empty
    if (!finalTopic) {
      setGenerating(true);
      setResultMessage({
        type: 'loading',
        text: 'Yêu cầu ChatGPT chọn topic phổ biến nhất trong tuần...'
      });
      
      const topicResult = await autoSelectTopic();
      
      if (topicResult.error) {
        setResultMessage({
          type: 'error',
          text: `Lỗi: ${topicResult.error.message}`
        });
        setGenerating(false);
        return;
      }
      
      finalTopic = topicResult.topic;
      setTopic(finalTopic);
      setResultMessage({
        type: 'info',
        text: `ChatGPT đã chọn topic: ${finalTopic}`
      });
      
      // Small delay to show selected topic
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Generate English exercise
    setGenerating(true);
    setResultMessage({
      type: 'loading',
      text: 'Đang gửi prompt...'
    });
    
    const prompt = getEnglishPromptTemplate(finalTopic);
    currentPromptRef.current = prompt;
    currentTopicRef.current = finalTopic;
    
    const sendResult = await sendPromptToChatGPT(prompt);
    
    if (sendResult.error) {
      setResultMessage({
        type: 'error',
        text: `Lỗi: ${sendResult.error.message}`
      });
      setGenerating(false);
      return;
    }
    
    // Start polling for response
    setResultMessage({
      type: 'loading',
      text: 'Đang chờ response...'
    });
    
    pollForResponse();
  };

  return (
    <div class="page-container english-page">
      {/* Header */}
      <div class="page-header">
        <h2>
          <i class="fas fa-book"></i> English Learning
        </h2>
      </div>

      {/* Generation Section */}
      <div class="english-generator">
        <div class="input-group">
          <label for="english-topic">Topic:</label>
          <input
            id="english-topic"
            type="text"
            class="input-field"
            placeholder="Enter a topic (e.g., 'business meeting', 'travel') or leave empty for auto-selection"
            value={topic}
            onInput={(e) => setTopic(e.target.value)}
            disabled={generating}
          />
        </div>

        <button
          class="primary-btn generate-btn"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <><i class="fas fa-spinner fa-spin"></i> Processing...</>
          ) : (
            <><i class="fas fa-rocket"></i> Generate & Learn</>
          )}
        </button>

        {/* Result Message */}
        {resultMessage && (
          <div class={`result-message ${resultMessage.type}`}>
            {resultMessage.text.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Sentences Section */}
      <div class="saved-section">
        <div class="section-header">
          <h3>
            Saved Sentences <span class="count">({englishList.length})</span>
          </h3>
          <button
            class="btn-icon btn-refresh"
            title="Làm mới"
            onClick={loadEnglishList}
          >
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>

        {englishList.length === 0 ? (
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>Chưa có câu nào</p>
            <small>Bắt đầu bằng cách tạo English exercise mới</small>
          </div>
        ) : (
          <div class="english-list">
            {englishList.map((item) => (
              <EnglishItem
                key={item.id}
                item={item}
                onDelete={handleDelete}
                onOpen={handleOpenChat}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div class={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
