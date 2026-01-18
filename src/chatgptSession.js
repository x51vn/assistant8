// ChatGPT Session Management Module
// Provides specialized functions for managing ChatGPT interactions
// Pure business logic - no direct I/O except Chrome APIs

import { 
  ERROR_CODES, 
  createSuccessResponse, 
  createErrorResponse, 
  exceptionToErrorResponse 
} from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('ChatGPTSession');

/**
 * Create a new chat session
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<ApiResponse>}
 */
export async function createNewSession(tabId) {
  const correlationId = logger.startOperation('createNewSession', { tabId });
  
  try {
    if (!tabId || tabId < 0) {
      return createErrorResponse(
        ERROR_CODES.INVALID_TAB_ID,
        'Invalid tab ID provided',
        'createNewSession'
      );
    }

    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'create_new_session'
    });
    
    if (response && response.success) {
      const data = {
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null
      };
      logger.endOperation('createNewSession', correlationId, true);
      return createSuccessResponse(data);
    }
    
    logger.endOperation('createNewSession', correlationId, false, 'No success response');
    return createErrorResponse(
      ERROR_CODES.SESSION_CREATE_FAILED,
      'Failed to create new session',
      'createNewSession'
    );
  } catch (error) {
    logger.endOperation('createNewSession', correlationId, false, error);
    return exceptionToErrorResponse(error, 'createNewSession');
  }
}

/**
 * Send input to ChatGPT
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @param {string} prompt - The prompt to send
 * @param {SendInputOptions} [options={}] - Additional options
 * @returns {Promise<ApiResponse>}
 */
export async function sendInput(tabId, prompt, options = {}) {
  const correlationId = logger.startOperation('sendInput', { tabId, promptLength: prompt?.length, options });
  
  try {
    if (!tabId || tabId < 0) {
      return createErrorResponse(
        ERROR_CODES.INVALID_TAB_ID,
        'Invalid tab ID provided',
        'sendInput'
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return createErrorResponse(
        ERROR_CODES.EMPTY_PROMPT,
        'Prompt cannot be empty',
        'sendInput'
      );
    }

    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'send_input',
      prompt: prompt,
      createNewChat: options.createNewChat !== false,
      runId: options.runId || null,
      reviewOnly: options.reviewOnly || false
    });
    
    if (response && (response.status === 'sent' || response.status === 'accepted' || response.status === 'filled')) {
      const data = {
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null,
        status: response.status
      };
      logger.endOperation('sendInput', correlationId, true);
      return createSuccessResponse(data);
    }
    
    logger.endOperation('sendInput', correlationId, false, 'Invalid response status');
    return createErrorResponse(
      ERROR_CODES.INPUT_SEND_FAILED,
      'Failed to send input to ChatGPT',
      'sendInput',
      { responseStatus: response?.status }
    );
  } catch (error) {
    logger.endOperation('sendInput', correlationId, false, error);
    return exceptionToErrorResponse(error, 'sendInput');
  }
}

/**
 * Get the latest output/response from ChatGPT
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @param {GetOutputOptions} [options={}] - Options for getting output
 * @returns {Promise<ApiResponse>}
 */
export async function getOutput(tabId, options = {}) {
  const correlationId = logger.startOperation('getOutput', { tabId, options });
  
  try {
    if (!tabId || tabId < 0) {
      return createErrorResponse(
        ERROR_CODES.INVALID_TAB_ID,
        'Invalid tab ID provided',
        'getOutput'
      );
    }

    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'get_output',
      wait: options.wait !== false,
      timeoutMs: options.timeoutMs || 15 * 60 * 1000,
      stableMs: options.stableMs || 1500
    });
    
    if (response && response.result) {
      const data = {
        result: response.result,
        chatId: response.chatId || null,
        chatUrl: response.chatUrl || null,
        assistantMessageId: response.assistantMessageId || null,
        status: response.status || 'completed'
      };
      logger.endOperation('getOutput', correlationId, true);
      return createSuccessResponse(data);
    }
    
    logger.endOperation('getOutput', correlationId, false, 'No result in response');
    return createErrorResponse(
      ERROR_CODES.OUTPUT_FETCH_FAILED,
      'No result available from ChatGPT',
      'getOutput',
      { responseStatus: response?.status }
    );
  } catch (error) {
    logger.endOperation('getOutput', correlationId, false, error);
    return exceptionToErrorResponse(error, 'getOutput');
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

/**
 * Find or create ChatGPT tab and ensure it's ready
 * @param {Object} [options={}] - Options for tab management
 * @param {boolean} [options.createIfNeeded=true] - Create new tab if not found
 * @param {boolean} [options.focusTab=true] - Focus the tab
 * @returns {Promise<TabResult>}
 */
export async function ensureChatGPTTab(options = {}) {
  const correlationId = logger.startOperation('ensureChatGPTTab', options);
  const createIfNeeded = options.createIfNeeded !== false;
  const focusTab = options.focusTab !== false;
  
  try {
    // Try to find existing ChatGPT tab
    const tabs = await chrome.tabs.query({});
    let chatTab = tabs.find(t => t.url && t.url.includes('chatgpt.com'));
    
    if (chatTab) {
      logger.info('Found existing ChatGPT tab', { tabId: chatTab.id });
      
      // Focus existing tab if requested
      if (focusTab) {
        await chrome.tabs.update(chatTab.id, { active: true });
      }
      
      // Wait for content script to be ready
      const ready = await waitForContentScript(chatTab.id);
      if (ready) {
        logger.endOperation('ensureChatGPTTab', correlationId, true);
        return { tabId: chatTab.id, isNew: false };
      }
    }
    
    // Create new tab if needed
    if (!chatTab && createIfNeeded) {
      logger.info('Creating new ChatGPT tab');
      chatTab = await chrome.tabs.create({ 
        url: 'https://chatgpt.com/', 
        active: focusTab 
      });
      
      // Wait for page to load
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === chatTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 30 seconds
        setTimeout(resolve, 30000);
      });
      
      // Additional wait for React to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for content script to be ready
      const ready = await waitForContentScript(chatTab.id);
      if (ready) {
        logger.endOperation('ensureChatGPTTab', correlationId, true);
        return { tabId: chatTab.id, isNew: true };
      } else {
        logger.endOperation('ensureChatGPTTab', correlationId, false, 'Content script not ready');
        return { 
          tabId: chatTab.id, 
          isNew: true, 
          error: createErrorResponse(
            ERROR_CODES.CONTENT_SCRIPT_NOT_READY,
            'Content script not ready after waiting',
            'ensureChatGPTTab'
          ).error
        };
      }
    }
    
    logger.endOperation('ensureChatGPTTab', correlationId, false, 'No tab and createIfNeeded=false');
    return { 
      tabId: -1, 
      isNew: false, 
      error: createErrorResponse(
        ERROR_CODES.TAB_NOT_FOUND,
        'No ChatGPT tab found',
        'ensureChatGPTTab'
      ).error
    };
  } catch (error) {
    logger.endOperation('ensureChatGPTTab', correlationId, false, error);
    return {
      tabId: -1,
      isNew: false,
      error: exceptionToErrorResponse(error, 'ensureChatGPTTab').error
    };
  }
}

/**
 * Wait for content script to be ready with retry logic
 * @param {number} tabId - The tab ID to check
 * @param {WaitForContentScriptOptions} [options={}] - Options
 * @returns {Promise<boolean>}
 */
export async function waitForContentScript(tabId, options = {}) {
  const maxRetries = options.maxRetries || 10;
  const retryDelay = options.retryDelay || 500;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Ping content script to check if it's ready
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      logger.debug('Content script ready', { tabId, attempt: i + 1 });
      return true;
    } catch (error) {
      logger.debug('Content script not ready, retrying', { 
        tabId, 
        attempt: i + 1, 
        maxRetries 
      });
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  logger.error('Content script not ready after max retries', { tabId, maxRetries });
  return false;
}
