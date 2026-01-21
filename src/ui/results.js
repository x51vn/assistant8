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

  function normalizeChatMeta(chatId, chatUrl) {
    let id = typeof chatId === 'string' ? chatId.trim() : '';
    let url = typeof chatUrl === 'string' ? chatUrl.trim() : '';

    // If chatId looks like a URL, extract the ID from it
    if (id && (id.startsWith('http://') || id.startsWith('https://'))) {
      url = id;
      id = extractChatIdFromUrl(url);
    }

    // Remove conversation_ prefix if present (from old format)
    if (id.startsWith('conversation_')) {
      id = '';
    }

    // Extract ID from URL if we don't have an ID
    if (!id && url) {
      id = extractChatIdFromUrl(url);
    }

    // Build URL from ID if we don't have a URL
    if (!url && id) {
      url = `https://chatgpt.com/c/${id}`;
    }

    console.log('[Results] normalizeChatMeta:', { input: { chatId, chatUrl }, output: { id, url } });
    return { chatId: id, chatUrl: url };
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
    const result = await chrome.storage.local.get('prompt');
    const prompt = result.prompt || 'Xin chào!';
    const promptStr = typeof prompt === 'string' ? prompt : String(prompt);
    const promptTimestamp = Date.now(); // Use timestamp as unique tracking ID
    console.log('[Results] Prompt to send:', promptStr.substring(0, 100) + '...');
    
    // Save to history immediately with pending status
    const historyKey = `conversation_${promptTimestamp}`;
    await chrome.storage.local.set({
      [historyKey]: {
        prompt: promptStr,
        result: '[Đang chờ ChatGPT trả lời...]',
        timestamp: promptTimestamp,
        chatUrl: '',
        chatId: '',
        pending: true
      }
    });
    console.log('[Results] Saved pending conversation:', historyKey);
    
    // Show stop button, hide run button
    if (runBtn) runBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = '';

    const message = {
      v: 1,
      type: MESSAGE_TYPES.SEND_PROMPT,
      correlationId: generateCorrelationId(),
      timestamp: promptTimestamp,
      chatId: promptTimestamp, // Use timestamp as tracking ID
      payload: {
        prompt: prompt,
        options: {
          createNewChat: false,
          focusTab: true
        }
      }
    };
    
    // Store tracking ID outside callback scope so poll can access it
    const trackingId = promptTimestamp;
    let pollChatId = null;
    let pollChatUrl = null;
    
    chrome.runtime.sendMessage(message, (response) => {
      console.log('[Results] Send prompt response:', response);
      if (chrome.runtime.lastError) {
        stopPolling();
        console.error('[Results] Error:', chrome.runtime.lastError.message);
        return;
      }
      if (!response || response.type === MESSAGE_TYPES.ERROR) {
        stopPolling();
        console.error('[Results] Failed to send prompt');
        return;
      }

      // Update pending history entry with chatId/chatUrl if available
      const responseChatId = response.payload?.chatId || '';
      const responseChatUrl = response.payload?.chatUrl || '';
      const normalizedSendMeta = normalizeChatMeta(responseChatId, responseChatUrl);
      
      // Store for poll interval
      pollChatId = normalizedSendMeta.chatId;
      pollChatUrl = normalizedSendMeta.chatUrl;
      
      if (normalizedSendMeta.chatId || normalizedSendMeta.chatUrl) {
        (async () => {
          const allData = await chrome.storage.local.get(null);
          const pendingKey = Object.keys(allData).find(k =>
            k.startsWith('conversation_') &&
            allData[k].pending === true &&
            allData[k].prompt === promptStr
          );

          if (pendingKey) {
            const updated = {
              ...allData[pendingKey],
              chatId: normalizedSendMeta.chatId || allData[pendingKey].chatId || '',
              chatUrl: normalizedSendMeta.chatUrl || allData[pendingKey].chatUrl || ''
            };
            console.log('[Results] Updating pending conversation with chat meta:', {
              key: pendingKey,
              chatId: updated.chatId,
              chatUrl: updated.chatUrl
            });
            await chrome.storage.local.set({ [pendingKey]: updated });
            console.log('[Results] Pending conversation updated successfully');
          } else {
            console.warn('[Results] No pending conversation found to update');
          }
        })().catch(err => console.error('[Results] Failed to update pending chat:', err));
      }
      
      // If in review mode, don't poll for result
      if (response.reviewMode) {
        console.log('[Results] Review mode enabled, not polling');
        stopPolling();
        return;
      }
      
      // Start polling for ChatGPT result
      console.log('[Results] Starting result polling...');
      let pollCount = 0;
      let lastRetryAttempt = 0; // X51LABS-62: Track retry attempts for UI feedback
      const maxPolls = 120; // 10 minutes max (120 x 5s)
      
      currentPollInterval = setInterval(async () => {
        pollCount++;
        console.log('[Results] Poll attempt', pollCount);
        
        if (pollCount > maxPolls) {
          console.log('[Results] Max poll attempts reached, stopping');
          stopPolling();
          return;
        }
        
        // Poll for output using CHATGPT_GET_OUTPUT
        const pollMessage = {
          v: 1,
          type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
          correlationId: generateCorrelationId(),
          timestamp: Date.now(),
          chatId: trackingId, // Use timestamp tracking ID for consistent tracking
          payload: {
            wait: false // Don't wait, just check current state
          }
        };
        
        chrome.runtime.sendMessage(pollMessage, (pollResponse) => {
          if (chrome.runtime.lastError) {
            console.error('[Results] Poll error:', chrome.runtime.lastError);
            return;
          }
          
          console.log('[Results] Poll response received:', {
            type: pollResponse?.type,
            hasPayload: !!pollResponse?.payload,
            hasOutput: !!pollResponse?.payload?.output,
            outputLength: pollResponse?.payload?.output?.length,
            chatId: pollResponse?.payload?.chatId,
            chatUrl: pollResponse?.payload?.chatUrl,
            retryAttempt: pollResponse?.payload?.retryAttempt,
            pollCount
          });
          
          // X51LABS-62: Show retry indicator if getOutput is retrying
          if (pollResponse?.payload?.retryAttempt !== undefined && pollResponse?.payload?.retryAttempt > 0) {
            lastRetryAttempt = pollResponse.payload.retryAttempt;
            console.log('[Results] Backend retrying: attempt', lastRetryAttempt);
            
            // Update history to show retrying status
            (async () => {
              const allData = await chrome.storage.local.get(null);
              const pendingKey = Object.keys(allData).find(k =>
                k.startsWith('conversation_') &&
                allData[k].pending === true &&
                allData[k].prompt === promptStr
              );
              
              if (pendingKey && allData[pendingKey]) {
                const updated = {
                  ...allData[pendingKey],
                  result: `[⏳ Đang thử lại ${lastRetryAttempt}/3...]`
                };
                await chrome.storage.local.set({ [pendingKey]: updated });
              }
            })().catch(err => console.error('[Results] Failed to update retry status:', err));
          }
          
          // Check if we got the result
          if (pollResponse?.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY && pollResponse.payload) {
            const { output, chatUrl, chatId } = pollResponse.payload;
            console.log('[Results] Raw poll response data:', { chatId, chatUrl, outputLength: output?.length });
            
            const normalizedPollMeta = normalizeChatMeta(chatId, chatUrl);
            console.log('[Results] Normalized poll meta:', normalizedPollMeta);
            
            if (output) {
              console.log('[Results] Got result! Length:', output.length);
              
              // Update history with actual response (async operation wrapped in IIFE)
              (async () => {
                // Find the pending conversation and update it
                const allData = await chrome.storage.local.get(null);
                console.log('[Results] All storage keys:', Object.keys(allData).filter(k => k.startsWith('conversation_')));
                
                const pendingKey = Object.keys(allData).find(k => 
                  k.startsWith('conversation_') && 
                  allData[k].pending === true &&
                  allData[k].prompt === promptStr
                );
                
                console.log('[Results] Found pending key:', pendingKey);
                
                if (pendingKey) {
                  // Update existing pending conversation
                  const finalEntry = {
                    prompt: promptStr,
                    result: output,
                    timestamp: allData[pendingKey].timestamp,
                    chatUrl: normalizedPollMeta.chatUrl,
                    chatId: normalizedPollMeta.chatId || allData[pendingKey].chatId || '',
                    pending: false
                  };
                  console.log('[Results] Finalizing conversation:', {
                    key: pendingKey,
                    chatId: finalEntry.chatId,
                    chatUrl: finalEntry.chatUrl,
                    resultLength: finalEntry.result?.length
                  });
                  await chrome.storage.local.set({ [pendingKey]: finalEntry });
                  console.log('[Results] Conversation finalized successfully');
                } else {
                  // Fallback: create new entry if pending not found
                  const historyKey = `conversation_${Date.now()}`;
                  const newEntry = {
                    prompt: promptStr,
                    result: output,
                    timestamp: Date.now(),
                    chatUrl: normalizedPollMeta.chatUrl,
                    chatId: normalizedPollMeta.chatId
                  };
                  console.log('[Results] Creating new conversation (pending not found):', {
                    key: historyKey,
                    chatId: newEntry.chatId,
                    chatUrl: newEntry.chatUrl,
                    resultLength: newEntry.result?.length
                  });
                  await chrome.storage.local.set({ [historyKey]: newEntry });
                  console.log('[Results] New conversation saved successfully');
                }
              })().catch(err => console.error('[Results] Failed to save history:', err));
              
              // Display the result
              const resultDisplay = document.querySelector('#result-display');
              if (resultDisplay) {
                resultDisplay.textContent = output;
              }
              
              stopPolling();
            }
          } else if (pollResponse?.type === MESSAGE_TYPES.ERROR) {
            console.error('[Results] Error getting output:', pollResponse.error);
            stopPolling();
          }
        });
      }, 5000); // Poll every 5 seconds
    });
  });

  stopBtn?.addEventListener('click', () => {
    stopPolling();
  });

  refreshBtn?.addEventListener('click', async () => {
    console.log('[Results] Refresh button clicked');
    
    // Get latest output from ChatGPT
    const message = {
      v: 1,
      type: MESSAGE_TYPES.CHATGPT_GET_OUTPUT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      payload: {
        wait: false
      }
    };
    
    chrome.runtime.sendMessage(message, (response) => {
      console.log('[Results] Get output response:', response);
      
      if (chrome.runtime.lastError) {
        console.error('[Results] Get result error:', chrome.runtime.lastError);
        return;
      }
      
      if (response?.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY) {
        const { output } = response.payload;
        
        if (output) {
          console.log('[Results] Got refreshed result, length:', output.length);
          
          // Display the result
          const resultDisplay = document.querySelector('#result-display');
          if (resultDisplay) {
            resultDisplay.textContent = output;
          }
          
          console.log('[Results] Result refreshed successfully');
        } else {
          console.log('[Results] No output available yet');
        }
      } else if (response?.type === MESSAGE_TYPES.ERROR) {
        console.error('[Results] Error:', response.error);
      }
    });
  });

  return { };
}
