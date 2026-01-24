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

  // ✅ NEW: Poll for chat_id from URL until we get it or timeout
  // This waits for the content script to extract the chat ID from the browser
  async function pollForChatId(chatUrl, timeoutMs = 30000) {
    console.log('⏳ [Results] Starting polling for chat_id from URL:', chatUrl);
    
    // If chatUrl is null/empty, cannot extract anything
    if (!chatUrl) {
      console.warn('❌ [Results] Cannot poll - chatUrl is null/empty');
      return null;
    }
    
    const start = Date.now();
    const pollInterval = 500;  // Check every 500ms
    let lastExtracted = null;
    
    while (Date.now() - start < timeoutMs) {
      const extractedId = extractChatIdFromUrl(chatUrl);
      if (extractedId && extractedId.trim()) {
        const elapsed = Date.now() - start;
        console.log(`✅ [Results] Got chat_id after ${elapsed}ms:`, extractedId);
        return extractedId;
      }
      
      // Show progress every 2 seconds
      if (Date.now() - start > 0 && (Date.now() - start) % 2000 < 500) {
        if (extractedId !== lastExtracted) {
          console.log(`⏳ [Results] Still polling... elapsed: ${Date.now() - start}ms, URL: ${chatUrl}`);
          lastExtracted = extractedId;
        }
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.warn(`⏱️ [Results] Timeout polling for chat_id after ${timeoutMs}ms`);
    console.warn(`🔍 [Results] Final URL was:`, chatUrl);
    return null;
  }

  function stopPolling() {
    if (currentPollInterval) {
      clearInterval(currentPollInterval);
      currentPollInterval = null;
    }
    if (runBtn) runBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
  }

  // ✅ NEW: Render history list
  function renderHistoryList(historyItems) {
    const historyList = document.getElementById('historyList');
    if (!historyList) {
      console.warn('[Results] #historyList element not found');
      return;
    }

    if (!historyItems || historyItems.length === 0) {
      historyList.innerHTML = '<p class="empty-state">Chưa có lịch sử. Chạy prompt để bắt đầu.</p>';
      return;
    }

    // Sort by timestamp descending (most recent first)
    const sorted = [...historyItems].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const html = sorted.map(item => {
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      const promptPreview = (item.prompt || '').substring(0, 50) + (item.prompt?.length > 50 ? '...' : '');
      const responsePreview = (item.response || '').substring(0, 100) + (item.response?.length > 100 ? '...' : '');

      return `
        <div class="history-item" style="border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-bottom: 12px; background: #f9f9f9;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px;">${dateStr}</div>
          <div style="font-weight: 500; margin-bottom: 8px; color: #333;">
            <strong>Prompt:</strong> ${promptPreview}
          </div>
          <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
            <strong>Response:</strong> ${responsePreview}
          </div>
          ${item.chat_url ? `<div style="font-size: 11px;"><a href="${item.chat_url}" target="_blank" style="color: #0066cc; text-decoration: none;">🔗 Xem ChatGPT</a></div>` : ''}
        </div>
      `;
    }).join('');

    historyList.innerHTML = html;
    console.log(`[Results] ✅ Rendered ${sorted.length} history items`);
  }

  // ✅ NEW: Load and display history
  async function loadAndDisplayHistory(limit = 50) {
    try {
      console.log('[Results] Loading history from Supabase...');
      const response = await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.HISTORY_GET_ALL,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: { limit }
      });

      console.log('[Results] History response:', response);

      if (response.errorCode) {
        console.error('[Results] Error loading history:', response.errorMessage);
        const historyList = document.getElementById('historyList');
        if (historyList) {
          historyList.innerHTML = `<p class="empty-state" style="color: #d32f2f;">Lỗi: ${response.errorMessage}</p>`;
        }
        return;
      }

      // ✅ CRITICAL: createResponse spreads payload directly, NOT nested
      // Handler returns: createResponse(msg, HISTORY_LIST, { history: data })
      // Result: { type, v, history: [...] }  NOT { type, data: { history: [...] } }
      const history = response.history || [];
      console.log(`[Results] Got ${history.length} history items`);
      renderHistoryList(history);
    } catch (error) {
      console.error('[Results] Failed to load history:', error);
      const historyList = document.getElementById('historyList');
      if (historyList) {
        historyList.innerHTML = '<p class="empty-state" style="color: #d32f2f;">Lỗi tải lịch sử</p>';
      }
    }
  }

  // ✅ NEW: Auto-load history on init
  loadAndDisplayHistory();

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
          createNewChat: true,
          focusTab: true
        }
      }
    };
    
    try {
      const response = await chrome.runtime.sendMessage(message);
      console.log('[Results] SEND_PROMPT response:', response);
      
      // 🔍 DEBUG: Log full response structure
      console.log('🔍 [Results] Response structure:', {
        type: response?.type,
        chatId: response?.chatId,
        chatUrl: response?.chatUrl,
        success: response?.success,
        status: response?.status,
        allKeys: Object.keys(response || {})
      });
      
      if (response && response.type !== MESSAGE_TYPES.ERROR) {
        console.log('[Results] Prompt sent successfully');
        
        // ✅ GPT-FIX: Save to Supabase chat_history instead of local storage
        // Note: Properties are spread directly in response, not nested in response.data
        // ✅ NEW: Wait for chat_id before saving (polling strategy)
        // Instead of saving with null chat_id, poll until we get it or timeout
        
        // Extract chatId with fallback
        const extractedChatId = response.chatId || extractChatIdFromUrl(response.chatUrl);
        let chatIdToSave = extractedChatId && extractedChatId.trim() ? extractedChatId : null;
        
        console.log('🔍 [Results] After immediate extraction:', {
          receivedChatId: response.chatId,
          receivedChatUrl: response.chatUrl,
          extractedChatId,
          willPoll: !chatIdToSave && !!response.chatUrl
        });
        
        // ✅ NEW: If chatId is null, wait for it via polling
        if (!chatIdToSave && response.chatUrl) {
          console.log('⏳ [Results] Chat ID not available initially, polling for it...');
          chatIdToSave = await pollForChatId(response.chatUrl, 30000);  // Poll for 30 seconds max
          console.log('✅ [Results] After polling, chat ID is:', chatIdToSave);
        }
        
        // Now save only if we have a valid chatId
        if (response.chatUrl && chatIdToSave) {
          const historyData = {
            chat_id: chatIdToSave,  // ✅ Now guaranteed to be non-null from polling
            chat_url: response.chatUrl || null,
            prompt: promptStr,
            response: '[Đang chờ ChatGPT trả lời...]',
            timestamp: Date.now()
          };
          
          // 🔍 DEBUG: Log what we're saving
          console.log('🔍 [Results] Saving to history:', historyData);
          
          const historyResponse = await chrome.runtime.sendMessage({
            v: 1,
            type: MESSAGE_TYPES.HISTORY_ADD,
            correlationId: generateCorrelationId(),
            timestamp: Date.now(),
            data: historyData
          });
          
          console.log('🔍 [Results] History save response:', historyResponse);
          
          if (historyResponse?.errorCode) {
            console.error('❌ [Results] Failed to save history:', historyResponse.errorMessage);
          }
          
          // ✅ Extract historyId from response for later updates
          const historyId = historyResponse?.history?.id || null;
          console.log('✅ [Results] History saved with ID:', historyId, 'and chat_id:', chatIdToSave);
          
          // Start polling for response now that we have valid chat_id
          startPollingForResponse(chatIdToSave, historyId);
        } else {
          console.warn('❌ [Results] Could not get chat_id even after polling. Cannot save history.');
          console.warn('[Results] Response object:', response);
          console.warn('[Results] User can still manually refresh after ChatGPT responds');
        }
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
    await loadAndDisplayHistory();
  });

  function startPollingForResponse(chatId, historyId = null) {
    if (!chatId) {
      console.warn('❌ [Results] No chatId provided, cannot poll for response');
      console.warn('[Results] This usually means content script was not ready when prompt was sent');
      return;
    }

    console.log('✅ [Results] Starting polling for response', { chatId, historyId });
    let pollCount = 0;
    const maxPolls = 60; // 60 * 2s = 2 minutes max

    currentPollInterval = setInterval(async () => {
      pollCount++;
      console.log(`[Results] 🔄 Poll ${pollCount}/${maxPolls} for chatId: ${chatId}`);

      if (pollCount >= maxPolls) {
        console.warn('[Results] ⏱️ Max polls reached (2 minutes), stopping');
        stopPolling();
        return;
      }

      try {
        // ✅ Get output from ChatGPT via background handler
        const outputMessage = {
          v: 1,
          type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          payload: {
            chatId,
            options: {
              wait: true,
              timeoutMs: 5000,
              stableMs: 2000
            }
          }
        };

        const outputResponse = await chrome.runtime.sendMessage(outputMessage);
        
        console.log(`🔍 [Results] Poll ${pollCount} response:`, {
          type: outputResponse?.type,
          hasData: !!outputResponse?.data,
          hasResponse: !!outputResponse?.response,
          errorCode: outputResponse?.errorCode
        });

        // ✅ Check for successful response
        if (outputResponse && outputResponse.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY) {
          // Handler returns data.response (via createResponse spreading)
          const responseText = outputResponse.response || outputResponse.output || '';
          
          console.log('✅ [Results] Got response from ChatGPT:', {
            length: responseText?.length || 0,
            preview: responseText?.substring(0, 100) + '...',
            chatId: outputResponse.chatId
          });

          // ✅ Check if response is valid (not placeholder)
          if (responseText && 
              responseText.length > 10 && 
              responseText !== '[Đang chờ ChatGPT trả lời...]') {
            
            console.log('💾 [Results] Saving response to Supabase...');
            
            // ✅ UPDATE (not ADD) in Supabase to prevent duplicate records
            const updateData = {
              response: responseText,
              chat_url: outputResponse.chatUrl || `https://chatgpt.com/c/${chatId}`
            };
            
            // Use historyId if available (more reliable), otherwise fallback to chat_id
            if (historyId) {
              updateData.id = historyId;
              console.log('[Results] Updating by historyId:', historyId);
            } else {
              updateData.chat_id = chatId;
              console.log('[Results] Updating by chat_id:', chatId);
            }
            
            const updateResponse = await chrome.runtime.sendMessage({
              v: 1,
              type: MESSAGE_TYPES.HISTORY_UPDATE,
              correlationId: generateCorrelationId(),
              timestamp: Date.now(),
              data: updateData
            });

            if (updateResponse.errorCode) {
              console.error('❌ [Results] Failed to save response:', updateResponse.errorMessage);
            } else {
              console.log('✅ [Results] Response saved to Supabase successfully');
              
              // ✅ Auto-reload history to show updated response
              await loadAndDisplayHistory();
            }
            
            stopPolling();
          } else {
            console.log(`⏳ [Results] Response not ready yet (length: ${responseText?.length || 0})`);
          }
        } else if (outputResponse?.errorCode) {
          console.error('[Results] ❌ Error getting output:', outputResponse.errorMessage);
          // Don't stop polling on transient errors
        }
      } catch (error) {
        console.error('[Results] ❌ Polling error:', error);
        // Don't stop polling on errors, might be transient
      }
    }, 2000); // Poll every 2 seconds
  }
}
