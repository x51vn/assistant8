/**
 * English Learning Module
 * ✅ Supabase-backed: persists to `english` table
 * Displays like Results page - list of English learning records
 */

import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';import { showConfirm } from "./confirmDialog.js";
const MAX_SAVED_SENTENCES = 50;
let currentPollInterval = null;
let pollInFlight = false;
let currentEnglishList = [];

/**
 * Send runtime message to background handler
 */
function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Initialize English learning module
 */
export async function initEnglish({
  englishTopicInput,
  generateSentenceBtn,
  englishResultArea,
  savedSentencesList
}) {
  console.log('[English] Initializing with Supabase table');

  // Load initial list
  await loadSavedSentences(savedSentencesList);
  
  // X51LABS-80: Cleanup function to reset button state
  function resetButtonState() {
    if (generateSentenceBtn) {
      generateSentenceBtn.disabled = false;
      generateSentenceBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Generate & Learn';
    }
  }

  // When no topic provided, ask ChatGPT to choose the most popular trending topic this week
  async function requestTopicFromChatGPT() {
    if (englishResultArea) {
      englishResultArea.innerHTML = '<div class="loading">⏳ Yêu cầu ChatGPT chọn topic phổ biến nhất trong tuần...</div>';
    }

    const pickPrompt = `You are an assistant that picks the single most popular trending topic this week suitable for an English learning exercise. Reply with exactly one short topic phrase (max 6 words) and nothing else.`;

    try {
      const sendMsg = {
        v: 1,
        type: MESSAGE_TYPES.SEND_PROMPT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          prompt: pickPrompt,
          options: { createNewChat: true, focusTab: true }
        }
      };

      const initResp = await sendRuntimeMessage(sendMsg);
      if (!initResp || initResp.type === MESSAGE_TYPES.ERROR) {
        return null;
      }

      // Poll for chat output (shorter timeout)
      const maxPolls = 20;
      for (let i = 0; i < maxPolls; i++) {
        const outResp = await sendRuntimeMessage({
          v: 1,
          type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          payload: { wait: false }
        });

        const output = outResp?.output || outResp?.payload?.output;
        if (outResp && outResp.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY && output) {
          // Extract first non-empty line and clean it
          const firstLine = output.split('\n').map(s => s.trim()).find(Boolean) || output;
          const topic = firstLine.replace(/^['"-]+|['"-]+$/g, '').trim();
          return topic;
        }

        // small delay before next poll
        await new Promise(r => setTimeout(r, 1500));
      }

      return null;
    } catch (err) {
      console.error('[English] requestTopicFromChatGPT error:', err);
      return null;
    }
  }

  async function handleGenerateTopic(topic) {
    if (!topic) return;
    if (englishResultArea) {
      englishResultArea.innerHTML = '<div class="loading">⏳ Đang gửi...</div>';
    }
    generateSentenceBtn.disabled = true;
    generateSentenceBtn.innerHTML = '⏳ Processing...';

    try {
      const promptTemplate = getDefaultEnglishPrompt();
      const prompt = promptTemplate.replace(/{TOPIC}/g, topic);
      
      const message = {
        v: 1,
        type: MESSAGE_TYPES.SEND_PROMPT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: {
          prompt: prompt,
          options: {
            createNewChat: true,
            focusTab: true
          }
        }
      };
      
      const response = await sendRuntimeMessage(message);
      
      if (response && response.type !== MESSAGE_TYPES.ERROR) {
        if (englishResultArea) {
          englishResultArea.innerHTML = '<div class="loading">⏳ Đang chờ response...</div>';
        }
        await pollForEnglishResult(englishResultArea, savedSentencesList, topic, prompt, resetButtonState);
      } else {
        if (englishResultArea) {
          englishResultArea.innerHTML = `<div class="error">❌ Lỗi: ${response?.payload?.error || 'Unknown'}</div>`;
        }
      }
    } catch (err) {
      if (englishResultArea) {
        englishResultArea.innerHTML = `<div class="error">❌ ${err.message}</div>`;
      }
    } finally {
      resetButtonState();
    }
  }

  generateSentenceBtn?.addEventListener('click', async () => {
    let topic = (englishTopicInput?.value || '').trim();
    if (!topic) {
      // Ask ChatGPT to choose the most popular topic this week
      topic = await requestTopicFromChatGPT();
      if (!topic) {
        if (englishResultArea) {
          englishResultArea.innerHTML = '<div class="error">❌ Không thể lấy topic từ ChatGPT. Vui lòng thử lại hoặc nhập topic thủ công.</div>';
        }
        return;
      }
      // Show chosen topic to user
      if (englishResultArea) {
        englishResultArea.innerHTML = `<div class="info">📝 ChatGPT đã chọn topic: <strong>${escapeHtml(topic)}</strong></div>`;
      }
    }

    await handleGenerateTopic(topic);
  });
}

// X51LABS-80: Added resetButtonState parameter
async function pollForEnglishResult(resultArea, savedSentencesList, topic, originalPrompt, resetButtonState) {
  if (currentPollInterval) {
    clearInterval(currentPollInterval);
  }
  
  let pollCount = 0;
  const maxPolls = 60;
  
  currentPollInterval = setInterval(async () => {
    if (pollInFlight) return;
    pollInFlight = true;
    pollCount++;
    
    if (pollCount > maxPolls) {
      clearInterval(currentPollInterval);
      currentPollInterval = null;
      if (resultArea) {
        resultArea.innerHTML = '<div class="error">⏱️ Timeout</div>';
      }
      resetButtonState(); // X51LABS-80: Reset button on timeout
      pollInFlight = false;
      return;
    }
    
    if (resultArea) {
      resultArea.innerHTML = `<div class="loading">⏳ Đang chờ... (${pollCount * 3}s)</div>`;
    }
    
    try {
      const message = {
        v: 1,
        type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        payload: { wait: false }
      };
      
      const response = await sendRuntimeMessage(message);
      
      // ✅ Handle both response patterns: direct fields (correct) and payload nested (legacy)
      const output = response?.output || response?.payload?.output;
      const chatId = response?.chatId || response?.payload?.chatId;
      const chatUrl = response?.chatUrl || response?.payload?.chatUrl;
      
      if (response && response.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY && output) {
        clearInterval(currentPollInterval);
        currentPollInterval = null;
        
        // Save to Supabase `english` table
        await saveSentence(topic, chatId, chatUrl, originalPrompt);
        
        // Refresh list
        await loadSavedSentences(savedSentencesList);
        
        if (resultArea) {
          resultArea.innerHTML = `
            <div class="success">
              ✅ Đã lưu! (Chat: ${chatId ? chatId.substring(0, 8) : 'N/A'})<br>
              <div style="margin-top: 12px; color: #666;">
                Nhấn vào item để mở ChatGPT
              </div>
            </div>
          `;
        }
        
        resetButtonState(); // X51LABS-80: Reset button on success
      }
    } catch (err) {
      console.error('[English] Poll error:', err);
      // X51LABS-80: Reset button on error
      clearInterval(currentPollInterval);
      currentPollInterval = null;
      resetButtonState();
    } finally {
      pollInFlight = false;
    }
  }, 3000);
}

/**
 * Save English sentence to Supabase `english` table
 */
async function saveSentence(topic, chatId, chatUrl, prompt) {
  try {
    const response = await sendRuntimeMessage({
      v: 1,
      type: MESSAGE_TYPES.ENGLISH_ADD,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        chat_id: chatId,
        topic
      }
    });

    if (response?.errorCode) {
      console.error('[English] saveSentence error:', response.errorMessage);
      throw new Error(response.errorMessage);
    }

    console.log('[English] Saved to Supabase:', response);
  } catch (err) {
    console.error('[English] saveSentence failed:', err);
    throw err;
  }
}

/**
 * Load saved sentences from Supabase `english` table
 */
async function loadSavedSentences(list) {
  if (!list) return;

  try {
    const response = await sendRuntimeMessage({
      v: 1,
      type: MESSAGE_TYPES.ENGLISH_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response?.errorCode) {
      console.error('[English] loadSavedSentences error:', response.errorMessage);
      list.innerHTML = '<div class="empty-state">Lỗi tải dữ liệu</div>';
      return;
    }

    currentEnglishList = response?.items || [];
    const countSpan = document.getElementById('savedSentencesCount');
    if (countSpan) countSpan.textContent = currentEnglishList.length;
    
    if (currentEnglishList.length === 0) {
      list.innerHTML = '<div class="empty-state">Chưa có câu nào</div>';
      return;
    }
    
    // Render like Results page
    renderEnglishList(list, currentEnglishList);
  } catch (err) {
    console.error('[English] loadSavedSentences failed:', err);
    list.innerHTML = '<div class="empty-state">Lỗi khi tải dữ liệu</div>';
  }
}

/**
 * Render English list similar to Results page
 */
function renderEnglishList(container, items) {
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state">Chưa có câu nào</div>';
    return;
  }

  // Sort by created_at descending
  const sorted = [...items].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeB - timeA;
  });

  const html = sorted
    .map((item) => {
      const date = new Date(item.created_at);
      const dateStr = date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        month: '2-digit',
        day: '2-digit'
      });

      return `
        <div class="result-item english-item" style="padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box; overflow: hidden;">
          <div style="flex: 1; min-width: 0; overflow: hidden;">
            <div style="font-weight: 600; color: #667eea; font-size: 14px; margin-bottom: 3px; word-break: break-word;">📚 ${escapeHtml(item.topic)}</div>
            <div style="font-size: 11px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              Chat: <strong>${item.chat_id.substring(0, 8)}</strong> • ${dateStr}
            </div>
          </div>
          <button class="english-delete-btn" data-id="${item.id}" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 16px; padding: 4px 8px; display: flex; align-items: center; justify-content: center; margin-left: 12px; flex-shrink: 0; transition: all 0.2s;" title="Xóa">
            ✕
          </button>
        </div>
      `;
    })
    .join('');

  container.innerHTML = html;

  // Attach click handlers
  container.querySelectorAll('.english-item').forEach((elem, idx) => {
    elem.addEventListener('click', async (e) => {
      // Don't trigger if clicking delete button
      if (e.target.closest('.english-delete-btn')) return;
      
      // Use index directly from DOM order
      if (idx < sorted.length) {
        await openChat(sorted[idx]);
      }
    });
  });

  // Attach delete handlers
  container.querySelectorAll('.english-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      await deleteEnglishItem(id, container);
    });
  });
}

/**
 * Delete English item from Supabase
 */
async function deleteEnglishItem(id, container) {
  const confirmed = await showConfirm({
    title: 'Xóa câu học?',
    message: 'Bạn có chắc chắn muốn xóa câu này?',
    confirmText: 'Xóa',
    cancelText: 'Hủy'
  });

  if (!confirmed) return;

  try {
    const response = await sendRuntimeMessage({
      v: 1,
      type: MESSAGE_TYPES.ENGLISH_DELETE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { id }
    });

    if (response?.errorCode) {
      alert('Lỗi: ' + response.errorMessage);
      return;
    }

    // Refresh list
    await loadSavedSentences(container);
  } catch (err) {
    console.error('[English] deleteEnglishItem error:', err);
    alert('Lỗi khi xóa: ' + err.message);
  }
}

/**
 * Open ChatGPT with the saved chat_id
 */
async function openChat(item) {
  try {
    // First ensure ChatGPT is open
    await sendRuntimeMessage({
      v: 1,
      type: MESSAGE_TYPES.ENSURE_CHATGPT_OPEN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    
    // Then navigate to the specific chat
    chrome.tabs.query({ url: 'https://chatgpt.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        const chatUrl = `https://chatgpt.com/c/${item.chat_id}`;
        chrome.tabs.update(tabs[0].id, { url: chatUrl });
      }
    });
  } catch (err) {
    console.error('[English] openChat error:', err);
  }
}

/**
 * Default English prompt template
 */
function getDefaultEnglishPrompt() {
  return `Create a meaningful English learning exercise about "{TOPIC}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.`;
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} ngày`;
  if (hours > 0) return `${hours} giờ`;
  if (minutes > 0) return `${minutes} phút`;
  return 'Vừa xong';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function getSettingsConfig() {
  try {
    const response = await sendRuntimeMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response?.errorCode) {
      console.warn('[English] SETTINGS_GET failed:', response.errorMessage);
      return {};
    }

    return response?.config || {};
  } catch (error) {
    console.error('[English] SETTINGS_GET error:', error);
    return {};
  }
}

async function updateSettingsConfig(config) {
  try {
    const response = await sendRuntimeMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_UPDATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { config }
    });

    if (response?.errorCode) {
      console.warn('[English] SETTINGS_UPDATE failed:', response.errorMessage);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[English] SETTINGS_UPDATE error:', error);
    return false;
  }
}
