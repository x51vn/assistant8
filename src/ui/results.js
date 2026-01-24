/**
 * Results UI Module
 * ✅ GPT-FIX: Migrated to Supabase chat_history (no local storage)
 */

import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export function setupResults(dom) {
  const { runBtn, stopBtn, refreshBtn } = dom;
  let currentPollInterval = null;

  function extractChatIdFromUrl(url) {
    if (!url) return '';
    const match = url.match(/\/(?:c|g)\/([^/?#]+)/);
    return match ? match[1] : '';
  }

  function stopPolling() {
    if (currentPollInterval) {
      clearInterval(currentPollInterval);
      currentPollInterval = null;
    }
    if (runBtn) runBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
  }

  runBtn?.addEventListener('click', async () => {
    console.log('[Results] Run button clicked');
    
    // ✅ GPT-FIX: Get prompt from Supabase settings
    const settingsResponse = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SETTINGS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    
    const prompt = settingsResponse.data?.config?.prompt || 'Xin chào!';
    const promptStr = typeof prompt === 'string' ? prompt : String(prompt);
    console.log('[Results] Prompt to send:', promptStr.substring(0, 100) + '...');
    
    // Show stop button, hide run button
    if (runBtn) runBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = '';

    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        prompt: promptStr,
        options: {
          createNewChat: false,
          focusTab: true
        }
      }
    };
    
    try {
      const response = await chrome.runtime.sendMessage(message);
      console.log('[Results] SEND_PROMPT response:', response);
      
      if (response && response.type !== MESSAGE_TYPES.ERROR) {
        console.log('[Results] Prompt sent successfully');
        
        // ✅ GPT-FIX: Save to Supabase chat_history instead of local storage
        // Note: Properties are spread directly in response, not nested in response.data
        if (response.chatId || response.chatUrl) {
          await chrome.runtime.sendMessage({
            v: 1,
            type: MESSAGE_TYPES.HISTORY_ADD,
            correlationId: generateCorrelationId(),
            timestamp: Date.now(),
            data: {
              chat_id: response.chatId || extractChatIdFromUrl(response.chatUrl),
              chat_url: response.chatUrl || '',
              prompt: promptStr,
              response: '[Đang chờ ChatGPT trả lời...]',
              timestamp: Date.now()
            }
          });
        }
        
        // Start polling for response (optional - can be removed if not needed)
        startPollingForResponse(response.chatId);
      } else {
        console.error('[Results] Failed to send prompt:', response);
        stopPolling();
      }
    } catch (error) {
      console.error('[Results] Error sending prompt:', error);
      stopPolling();
    }
  });

  stopBtn?.addEventListener('click', () => {
    console.log('[Results] Stop button clicked');
    stopPolling();
  });

  refreshBtn?.addEventListener('click', async () => {
    console.log('[Results] Refresh button clicked');
    // ✅ GPT-FIX: Fetch latest from Supabase instead of local storage
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.HISTORY_GET_ALL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { limit: 1 } // Get latest only
    });
    
    // Note: HISTORY_GET_ALL returns { history: [...] }
    if (response.history && response.history.length > 0) {
      const latest = response.history[0];
      console.log('[Results] Latest chat:', latest);
      // Display in UI (implement as needed)
    }
  });

  function startPollingForResponse(chatId) {
    if (!chatId) {
      console.warn('[Results] No chatId, skipping polling');
      return;
    }

    let pollCount = 0;
    const maxPolls = 60; // 60 * 2s = 2 minutes max

    currentPollInterval = setInterval(async () => {
      pollCount++;
      console.log(`[Results] Polling for response (${pollCount}/${maxPolls})...`);

      if (pollCount >= maxPolls) {
        console.log('[Results] Max polls reached, stopping');
        stopPolling();
        return;
      }

      try {
        // ✅ GPT-FIX: Get output from ChatGPT
        const outputMessage = {
          v: 1,
          type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          payload: {
            chatId,
            timeout: 5000,
            stableMs: 2000
          }
        };

        const outputResponse = await chrome.runtime.sendMessage(outputMessage);

        if (outputResponse && outputResponse.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY) {
          const responseText = outputResponse.data?.response || '';
          console.log('[Results] Got response:', responseText.substring(0, 100) + '...');

          if (responseText && responseText !== '[Đang chờ ChatGPT trả lời...]') {
            // ✅ GPT-FIX: Update in Supabase
            await chrome.runtime.sendMessage({
              v: 1,
              type: MESSAGE_TYPES.HISTORY_ADD,
              correlationId: generateCorrelationId(),
              timestamp: Date.now(),
              data: {
                chat_id: chatId,
                chat_url: outputResponse.data?.chatUrl || '',
                prompt: '[Updated]', // Prompt already saved
                response: responseText,
                timestamp: Date.now()
              }
            });

            console.log('[Results] Response saved to Supabase');
            stopPolling();
          }
        }
      } catch (error) {
        console.error('[Results] Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  }
}
