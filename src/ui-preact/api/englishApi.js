/**
 * English API - Background communication layer for English learning
 * Routes English operations to background handlers
 * 
 * Implements features documented in docs/ENGLISH_MODULE_FEATURES.md
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

/**
 * Map background response error to user-friendly message
 */
function extractError(response) {
  if (response.errorCode) {
    return {
      code: response.errorCode,
      message: response.errorMessage || 'Có lỗi xảy ra'
    };
  }
  
  if (response.error) {
    if (typeof response.error === 'string') {
      return { code: 'ERROR', message: response.error };
    }
    if (response.error.message) {
      return { code: response.error.code || 'ERROR', message: response.error.message };
    }
  }
  
  return null;
}

/**
 * Fetch all English learning records for current user
 * @returns {Promise<{items: Array, error?: {code, message}}>}
 */
export async function fetchEnglishList() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.ENGLISH_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    const error = extractError(response);
    if (error) {
      console.error('[EnglishAPI] Fetch failed:', error);
      return { items: [], error };
    }

    // Response format: { items: [...] } at top-level
    return {
      items: response.items || [],
      error: null
    };
  } catch (error) {
    console.error('[EnglishAPI] Failed to fetch English list:', error);
    return {
      items: [],
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể kết nối. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Add new English learning record
 * @param {string} chatId - ChatGPT conversation ID
 * @param {string} topic - Topic name
 * @param {string} prompt - Full prompt sent to ChatGPT
 * @returns {Promise<{success: boolean, data?: object, error?: {code, message}}>}
 */
export async function addEnglish(chatId, topic, prompt) {
  try {
    if (!chatId || !topic || !prompt) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Thiếu thông tin: chat_id, topic, hoặc prompt'
        }
      };
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.ENGLISH_ADD,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        chat_id: chatId,
        topic,
        prompt
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[EnglishAPI] Add failed:', error);
      return { success: false, error };
    }

    return {
      success: true,
      // ✅ CONSISTENCY FIX: Now handler returns { item: data }
      data: response.item || {
        id: response.id,
        chat_id: response.chat_id,
        topic: response.topic,
        prompt: response.prompt,
        created_at: response.created_at
      },
      error: null
    };
  } catch (error) {
    console.error('[EnglishAPI] Failed to add English record:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể lưu. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Delete English learning record by ID
 * @param {string} id - Record ID (UUID)
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function deleteEnglish(id) {
  try {
    if (!id) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ID là bắt buộc'
        }
      };
    }

    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.ENGLISH_DELETE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { id }
    });

    const error = extractError(response);
    if (error) {
      console.error('[EnglishAPI] Delete failed:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('[EnglishAPI] Failed to delete English record:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể xóa. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Send prompt to the active LLM provider (ChatGPT, Gemini, or Claude).
 * XST-818: Renamed from sendPromptToChatGPT to reflect multi-provider support.
 *
 * For non-ChatGPT providers (Gemini, Claude), the full response text is returned
 * immediately in `result.text` — no polling of CHATGPT_GET_OUTPUT needed.
 *
 * @param {string} prompt - Prompt text
 * @param {object} options - Provider options
 * @returns {Promise<{success: boolean, text?: string, error?: {code, message}}>}
 */
export async function sendPromptToLLM(prompt, options = {}) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt,
        options: {
          createNewChat: true,
          focusTab: true,
          ...options
        }
      }
    });

    const error = extractError(response);
    if (error) {
      console.error('[EnglishAPI] Send prompt failed:', error);
      return { success: false, error };
    }

    // For non-ChatGPT providers, full response text is in the response immediately.
    const text = response.text || response.payload?.text || null;
    return { success: true, text, error: null };
  } catch (error) {
    console.error('[EnglishAPI] Failed to send prompt:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể gửi prompt. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

// XST-825: Deprecated alias removed — use sendPromptToLLM directly.

/**
 * Get ChatGPT output (for polling)
 * @returns {Promise<{output?: string, chatId?: string, chatUrl?: string, error?: {code, message}}>}
 */
export async function getChatGPTOutput() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: { wait: false }
    });

    const error = extractError(response);
    if (error) {
      // Not necessarily an error - might just not be ready yet
      return { output: null, error: null };
    }

    // Handle both response patterns
    const output = response?.output || response?.payload?.output;
    const chatId = response?.chatId || response?.payload?.chatId;
    const chatUrl = response?.chatUrl || response?.payload?.chatUrl;

    if (response && response.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY && output) {
      return {
        output,
        chatId,
        chatUrl,
        error: null
      };
    }

    return { output: null, error: null };
  } catch (error) {
    console.error('[EnglishAPI] Failed to get ChatGPT output:', error);
    return {
      output: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể lấy output. Vui lòng kiểm tra mạng.'
      }
    };
  }
}

/**
 * Open ChatGPT chat by chat_id
 * @param {string} chatId - ChatGPT conversation ID
 * @returns {Promise<{success: boolean, error?: {code, message}}>}
 */
export async function openEnglishChat(chatId) {
  try {
    if (!chatId) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Chat ID là bắt buộc'
        }
      };
    }

    // First ensure ChatGPT is open
    await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.ENSURE_CHATGPT_OPEN,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    // Then navigate to the specific chat
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    
    if (tabs.length > 0) {
      const chatUrl = `https://chatgpt.com/c/${chatId}`;
      await chrome.tabs.update(tabs[0].id, { url: chatUrl });
      return { success: true, error: null };
    } else {
      return {
        success: false,
        error: {
          code: 'NO_TAB',
          message: 'Không tìm thấy tab ChatGPT'
        }
      };
    }
  } catch (error) {
    console.error('[EnglishAPI] Failed to open chat:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể mở chat. Vui lòng thử lại.'
      }
    };
  }
}

/**
 * Get English prompt template from unified prompts system
 * Uses system prompt 'prompt.english' if available, falls back to default
 * @param {string} topic - Topic to replace in template
 * @returns {string} - Formatted prompt
 */
export function getEnglishPromptTemplate(topic) {
  try {
    // Try to get from allPrompts signal (settingsState)
    // This allows users to customize the English prompt in Settings
    const { allPrompts } = require('../state/settingsState.js');
    if (allPrompts && allPrompts.value && allPrompts.value['prompt.english']) {
      const baseTemplate = allPrompts.value['prompt.english'].content;
      if (baseTemplate && baseTemplate.trim()) {
        return baseTemplate.replace('{TOPIC}', topic);
      }
    }
  } catch (err) {
    // Fall back to default if import fails or prompt not loaded
    console.warn('[EnglishAPI] Could not load custom English prompt, using default:', err.message);
  }

  // Fallback to default hardcoded template
  return `Create a meaningful English learning exercise about "${topic}". Format your response as follows:
1. A sentence or phrase in English with some vocabulary to learn
2. Vietnamese translation
3. 2-3 example uses or variations
4. A brief explanation of why this is useful to learn

Make it engaging and practical for English learners.`;
}

/**
 * Auto-select topic using the active LLM provider (ChatGPT, Gemini, or Claude).
 * XST-819: Handles both fire-and-forget (ChatGPT) and immediate response (Gemini/Claude).
 * @returns {Promise<{topic?: string, error?: {code, message}}>}
 */
export async function autoSelectTopic() {
  try {
    const pickPrompt = `You are an assistant that picks the single most popular trending topic this week suitable for an English learning exercise. Reply with exactly one short topic phrase (max 6 words) and nothing else.`;

    // Send prompt — XST-821: all providers now return text immediately
    const sendResult = await sendPromptToLLM(pickPrompt, { focusTab: false });
    if (!sendResult.success) {
      return { topic: null, error: sendResult.error };
    }

    // XST-821: Use response text directly if available (all providers return text now)
    if (sendResult.text) {
      const firstLine = sendResult.text
        .split('\n')
        .map(s => s.trim())
        .find(Boolean) || sendResult.text;
      const topic = firstLine.replace(/^['"-]+|['"-]+$/g, '').trim();
      return { topic, error: null };
    }

    // Fallback: Poll for response (legacy compatibility — should not trigger)
    const maxPolls = 20;
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 1500));
      
      const outputResult = await getChatGPTOutput();
      
      if (outputResult.output) {
        const firstLine = outputResult.output
          .split('\n')
          .map(s => s.trim())
          .find(Boolean) || outputResult.output;
        
        const topic = firstLine.replace(/^['"-]+|['"-]+$/g, '').trim();
        return { topic, error: null };
      }
    }

    // Timeout
    return {
      topic: null,
      error: {
        code: 'TIMEOUT',
        message: 'Không thể lấy topic từ ChatGPT. Vui lòng thử lại.'
      }
    };
  } catch (error) {
    console.error('[EnglishAPI] Failed to auto-select topic:', error);
    return {
      topic: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Không thể lấy topic. Vui lòng kiểm tra mạng.'
      }
    };
  }
}
