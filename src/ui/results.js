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
      
      // TODO: Implement proper result polling using CHATGPT_GET_OUTPUT
      // For now, just stop polling after prompt is sent
      console.log('[Results] Prompt sent, result polling not yet implemented');
      stopPolling();
      
      /* OLD POLLING CODE - NEEDS MIGRATION
      const runId = response.runId;
      console.log('[Results] Starting poll for runId:', runId);
      let pollCount = 0;
      
      currentPollInterval = setInterval(() => {
        pollCount++;
        console.log('[Results] Poll attempt', pollCount);
        
        // Need to implement proper message format
        chrome.runtime.sendMessage({ action: 'get_result' }, (pollResponse) => {
          console.log('[Results] Poll response:', { hasResult: !!pollResponse?.result, source: pollResponse?.source, pollCount });
          if (chrome.runtime.lastError) {
            console.error('[Results] Poll error:', chrome.runtime.lastError);
            stopPolling();
            return;
          }
          
          // Check if we have a fresh result for this runId
          if (pollResponse && pollResponse.result && pollResponse.source === 'live') {
            console.log('[Results] Got live result, stopping poll');
            stopPolling();
          } else {
            console.log('[Results] Still waiting for result...');
          }
        });
      }, 3000);
      */
    });
  });

  stopBtn?.addEventListener('click', () => {
    stopPolling();
  });

  refreshBtn?.addEventListener('click', () => {
    console.log('[Results] Refresh button clicked');
    // TODO: Implement using CHATGPT_GET_OUTPUT or storage
    console.log('[Results] Refresh not yet implemented with new message schema');
    /*
    chrome.runtime.sendMessage({ action: 'get_result' }, (response) => {
      console.log('[Results] Get result response:', response);
      if (chrome.runtime.lastError) {
        console.error('[Results] Get result error:', chrome.runtime.lastError);
        return;
      }
      console.log('[Results] Result available');
    });
    */
  });

  return { };
}
