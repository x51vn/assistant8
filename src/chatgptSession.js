// ChatGPT Session Management Module
// Provides specialized functions for managing ChatGPT interactions

/**
 * Create a new chat session
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<{success: boolean, chatId?: string, chatUrl?: string, error?: string}>}
 */
export async function createNewSession(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'create_new_session'
    });
    
    if (response && response.success) {
      return {
        success: true,
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null
      };
    }
    
    return { success: false, error: 'Failed to create new session' };
  } catch (error) {
    return { success: false, error: String(error?.message || error) };
  }
}

/**
 * Send input to ChatGPT
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Additional options
 * @param {boolean} options.reviewOnly - If true, only fill prompt without sending
 * @returns {Promise<{success: boolean, chatId?: string, chatUrl?: string, error?: string}>}
 */
export async function sendInput(tabId, prompt, options = {}) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'send_input',
      prompt: prompt,
      createNewChat: options.createNewChat !== false,
      runId: options.runId || null,
      reviewOnly: options.reviewOnly || false
    });
    
    if (response && (response.status === 'sent' || response.status === 'accepted' || response.status === 'filled')) {
      return {
        success: true,
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null
      };
    }
    
    return { success: false, error: 'Failed to send input' };
  } catch (error) {
    return { success: false, error: String(error?.message || error) };
  }
}

/**
 * Get the latest output/response from ChatGPT
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @param {Object} options - Options for getting output
 * @returns {Promise<{success: boolean, result?: string, chatId?: string, chatUrl?: string, status?: string, error?: string}>}
 */
export async function getOutput(tabId, options = {}) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'get_output',
      wait: options.wait !== false,
      timeoutMs: options.timeoutMs || 15 * 60 * 1000,
      stableMs: options.stableMs || 1500
    });
    
    if (response && response.result) {
      return {
        success: true,
        result: response.result,
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null,
        assistantMessageId: response.assistantMessageId || null,
        status: response.status || 'completed'
      };
    }
    
    return {
      success: false,
      status: response?.status || 'no_result',
      error: 'No result available'
    };
  } catch (error) {
    return { success: false, error: String(error?.message || error) };
  }
}

/**
 * Check if response is ready
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<{ready: boolean, generating: boolean, hasContent: boolean, error?: string}>}
 */
export async function isResponseReady(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'check_response_status'
    });
    
    if (response) {
      return {
        ready: response.ready || false,
        generating: response.generating || false,
        hasContent: response.hasContent || false,
        messageCount: response.messageCount || 0
      };
    }
    
    return { ready: false, generating: false, hasContent: false };
  } catch (error) {
    return { ready: false, generating: false, hasContent: false, error: String(error?.message || error) };
  }
}

/**
 * Get current chat metadata
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<{chatId?: string, chatUrl?: string, error?: string}>}
 */
export async function getChatMetadata(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'get_chat_metadata'
    });
    
    if (response) {
      return {
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null
      };
    }
    
    return { chatId: null, chatUrl: null };
  } catch (error) {
    return { chatId: null, chatUrl: null, error: String(error?.message || error) };
  }
}

/**
 * Wait for response to be ready with polling
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @param {Object} options - Polling options
 * @returns {Promise<{ready: boolean, timedOut: boolean}>}
 */
export async function waitForResponse(tabId, options = {}) {
  const timeoutMs = options.timeoutMs || 15 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs || 1000;
  const stableMs = options.stableMs || 1500;
  
  const startTime = Date.now();
  let lastChangeTime = Date.now();
  let lastContentLength = 0;
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await isResponseReady(tabId);
    
    if (status.error) {
      return { ready: false, timedOut: false, error: status.error };
    }
    
    // If still generating, keep waiting
    if (status.generating) {
      lastChangeTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      continue;
    }
    
    // If has content and not generating, check if stable
    if (status.hasContent && !status.generating) {
      const output = await getOutput(tabId, { wait: false });
      if (output.success && output.result) {
        const currentLength = output.result.length;
        
        if (currentLength !== lastContentLength) {
          lastContentLength = currentLength;
          lastChangeTime = Date.now();
        }
        
        // If content stable for stableMs, consider ready
        if (Date.now() - lastChangeTime >= stableMs) {
          return { ready: true, timedOut: false };
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  return { ready: false, timedOut: true };
}

/**
 * Get the count of messages in current conversation
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<number>}
 */
export async function getMessageCount(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'get_message_count'
    });
    
    return response?.count || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Clear current conversation (navigate to new chat)
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function clearConversation(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'clear_conversation'
    });
    
    return { success: response?.success || false };
  } catch (error) {
    return { success: false, error: String(error?.message || error) };
  }
}
