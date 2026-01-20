import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

export function setupResults(dom) {
  const { runBtn, stopBtn, refreshBtn } = dom;
  let currentPollInterval = null;

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
    console.log('[Results] Prompt to send:', promptStr.substring(0, 100) + '...');
    
    // Save to history immediately with pending status
    const historyKey = `conversation_${Date.now()}`;
    await chrome.storage.local.set({
      [historyKey]: {
        prompt: promptStr,
        result: '[Đang chờ ChatGPT trả lời...]',
        timestamp: Date.now(),
        chatUrl: '',
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
      timestamp: Date.now(),
      payload: {
        prompt: prompt,
        options: {
          createNewChat: false,
          focusTab: true
        }
      }
    };
    
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
      
      // If in review mode, don't poll for result
      if (response.reviewMode) {
        console.log('[Results] Review mode enabled, not polling');
        stopPolling();
        return;
      }
      
      // Start polling for ChatGPT result
      console.log('[Results] Starting result polling...');
      let pollCount = 0;
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
          payload: {
            wait: false // Don't wait, just check current state
          }
        };
        
        chrome.runtime.sendMessage(pollMessage, (pollResponse) => {
          if (chrome.runtime.lastError) {
            console.error('[Results] Poll error:', chrome.runtime.lastError);
            return;
          }
          
          console.log('[Results] Poll response:', {
            type: pollResponse?.type,
            hasOutput: !!pollResponse?.payload?.output,
            pollCount
          });
          
          // Check if we got the result
          if (pollResponse?.type === MESSAGE_TYPES.CHATGPT_OUTPUT_READY) {
            const { output, chatUrl } = pollResponse.payload;
            
            if (output) {
              console.log('[Results] Got result! Length:', output.length);
              
              // Update history with actual response (async operation wrapped in IIFE)
              (async () => {
                // Find the pending conversation and update it
                const allData = await chrome.storage.local.get(null);
                const pendingKey = Object.keys(allData).find(k => 
                  k.startsWith('conversation_') && 
                  allData[k].pending === true &&
                  allData[k].prompt === promptStr
                );
                
                if (pendingKey) {
                  // Update existing pending conversation
                  await chrome.storage.local.set({
                    [pendingKey]: {
                      prompt: promptStr,
                      result: output,
                      timestamp: allData[pendingKey].timestamp,
                      chatUrl: chatUrl,
                      pending: false
                    }
                  });
                  console.log('[Results] Updated conversation in history:', pendingKey);
                } else {
                  // Fallback: create new entry if pending not found
                  const historyKey = `conversation_${Date.now()}`;
                  await chrome.storage.local.set({
                    [historyKey]: {
                      prompt: promptStr,
                      result: output,
                      timestamp: Date.now(),
                      chatUrl: chatUrl
                    }
                  });
                  console.log('[Results] Saved new conversation to history:', historyKey);
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
