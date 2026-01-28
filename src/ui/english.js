import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';
const MAX_SAVED_SENTENCES = 50;
let currentPollInterval = null;
let pollInFlight = false;

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

export async function initEnglish({
  englishTopicInput,
  generateSentenceBtn,
  englishResultArea,
  savedSentencesList
}) {
  console.log('[English] Initializing');

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
      const config = await getSettingsConfig();
      const promptTemplate = config?.prompts?.english || getDefaultEnglishPrompt();
      
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
        
        await saveSentence(topic, output, chatId, chatUrl, originalPrompt);
        await loadSavedSentences(savedSentencesList);
        
        if (resultArea) {
          resultArea.innerHTML = `
            <div class="success">
              ✅ Đã lưu! (Chat: ${chatId ? chatId.substring(0, 8) : 'N/A'})<br>
              <div style="margin-top: 12px; background: white; padding: 12px; border-radius: 6px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">
                ${escapeHtml(output.substring(0, 500))}${output.length > 500 ? '...' : ''}
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

async function saveSentence(topic, response, chatId, chatUrl, originalPrompt) {
  const config = await getSettingsConfig();
  const englishConfig = config.english || {};
  const sentences = Array.isArray(englishConfig.sentences)
    ? englishConfig.sentences
    : [];

  sentences.unshift({
    id: `english_${Date.now()}`,
    topic,
    response,
    chatId,
    chatUrl,
    prompt: originalPrompt,
    timestamp: Date.now()
  });

  if (sentences.length > MAX_SAVED_SENTENCES) {
    sentences.splice(MAX_SAVED_SENTENCES);
  }

  await updateSettingsConfig({
    ...config,
    english: {
      ...englishConfig,
      sentences
    }
  });
}

async function loadSavedSentences(list) {
  if (!list) return;

  const config = await getSettingsConfig();
  const englishConfig = config.english || {};
  const sentences = Array.isArray(englishConfig.sentences)
    ? englishConfig.sentences
    : [];
  
  const countSpan = document.getElementById('savedSentencesCount');
  if (countSpan) countSpan.textContent = sentences.length;
  
  if (sentences.length === 0) {
    list.innerHTML = '<div class="empty-state">Chưa có câu nào</div>';
    return;
  }
  
  list.innerHTML = '';
  
  sentences.forEach(s => {
    const div = document.createElement('div');
    div.className = 'saved-sentence-item';
    div.style.cssText = 'padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 8px; cursor: pointer;';
    
    div.innerHTML = `
      <div style="display: flex; justify-content: space-between;">
        <strong style="color: #667eea;">${escapeHtml(s.topic)}</strong>
        <span style="font-size: 11px; color: #999;">${formatTimeAgo(s.timestamp)}</span>
      </div>
      <div style="font-size: 12px; color: #666;">${escapeHtml(s.response.substring(0, 100))}...</div>
      <div style="font-size: 10px; color: #aaa;">Chat: ${s.chatId ? s.chatId.substring(0, 8) : 'N/A'}</div>
    `;
    
    div.addEventListener('click', () => showDetail(s));
    list.appendChild(div);
  });
}

function showDetail(s) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';
  
  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 24px; border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto;';
  
  content.innerHTML = `
    <h3 style="margin: 0 0 16px;">📚 ${escapeHtml(s.topic)}</h3>
    <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
      🕐 ${new Date(s.timestamp).toLocaleString('vi-VN')}<br>
      🔗 Chat: ${s.chatId || 'N/A'}
    </div>
    <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; white-space: pre-wrap; margin-bottom: 16px;">
      ${escapeHtml(s.response)}
    </div>
    <button id="closeModal" class="primary-btn">Đóng</button>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  document.getElementById('closeModal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
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

function getDefaultEnglishPrompt() {
  return `Teach me English about: {TOPIC}

Provide:
1. An English sentence/phrase
2. Vietnamese translation
3. Usage example
4. Common situations to use it`;
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
