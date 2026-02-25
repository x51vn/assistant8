// ChatGPT Session Management Module
// Provides specialized functions for managing ChatGPT interactions
// Pure business logic - no direct I/O except Chrome APIs

import { 
  ERROR_CODES, 
  createDataResponse, 
  createApiErrorResponse, 
  exceptionToApiErrorResponse 
} from './types.js';
import { createLogger } from './logger.js';
import {
  getContentScriptStatus,
  isContentScriptReady
} from './background/handlers/contentScriptReady.js';

const logger = createLogger('ChatGPTSession');

/**
 * X51LABS-82: Wait for tab to be ready and content script loaded
 * X51LABS-157-003: REFACTORED with registry-based instant check (XST-685)
 * 
 * Architecture:
 * 1. Check registry first (instant O(1), <10ms if already registered)
 * 2. Wait for registry update (event-driven, 100-500ms if not yet registered)
 * 3. Fallback to ping (500ms delay, for content script crash scenarios)
 * 4. Race: whichever succeeds first wins
 * 
 * @param {number} tabId - Tab ID to wait for
 * @param {number} [timeoutMs=10000] - Timeout in milliseconds
 * @returns {Promise<{success: boolean, source?: 'registry'|'ping', details?: object, error?: string, elapsed?: number}>}
 */
export async function waitForTabReady(tabId, timeoutMs = 10000) {
  const correlationId = logger.startOperation('waitForTabReady');
  const startTime = Date.now();
  
  try {
    if (!tabId || tabId < 0) {
      throw new Error('Invalid tab ID');
    }
    
    // OPTIMIZATION 1: Check registry first (instant O(1), <10ms)
    // If content script has already signaled ready, return immediately
    const registryStatus = getContentScriptStatus(tabId);
    if (registryStatus?.ready) {
      const elapsed = Date.now() - startTime;
      logger.info('waitForTabReady: Registry hit (instant)', {
        tabId,
        elapsed,
        hostname: registryStatus.hostname,
        markerSet: registryStatus.markerSet
      });
      logger.endOperation(correlationId, 'success', { 
        method: 'registry_hit',
        elapsed,
        source: 'registry'
      });
      return { 
        success: true, 
        source: 'registry', 
        details: registryStatus,
        elapsed
      };
    }
    
    // OPTIMIZATION 2: Wait for registry update (event-driven, 100-500ms)
    // Helper: Poll registry until ready or timeout
    const checkRegistryUntilReady = async () => {
      const remainingMs = timeoutMs - (Date.now() - startTime);
      if (remainingMs <= 0) {
        throw new Error('Timeout waiting for registry');
      }
      
      const pollIntervalMs = 50; // Check every 50ms
      const maxPolls = Math.ceil(remainingMs / pollIntervalMs);
      
      for (let poll = 0; poll < maxPolls; poll++) {
        const status = getContentScriptStatus(tabId);
        if (status?.ready) {
          const elapsed = Date.now() - startTime;
          logger.info('waitForTabReady: Registry update received', {
            tabId,
            elapsed,
            pollAttempt: poll + 1,
            hostname: status.hostname
          });
          return { 
            success: true, 
            source: 'registry', 
            details: status,
            elapsed
          };
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
      
      // Registry never signaled ready
      throw new Error('Registry signal timeout');
    };
    
    // OPTIMIZATION 3: Fallback to ping (500ms delay, for edge cases)
    // Helper: Ping content script until ready or timeout
    const tryPingUntilReady = async () => {
      const remainingMs = timeoutMs - (Date.now() - startTime);
      if (remainingMs <= 0) {
        throw new Error('Timeout before ping fallback');
      }
      
      const pingIntervalMs = 300; // Ping every 300ms
      const maxPings = Math.ceil(remainingMs / pingIntervalMs);
      let pingAttempt = 0;
      
      for (let i = 0; i < maxPings; i++) {
        pingAttempt++;
        try {
          const tab = await chrome.tabs.get(tabId);
          if (!tab) {
            throw new Error('Tab not found');
          }
          
          if (tab.status !== 'complete') {
            logger.debug('waitForTabReady ping: Tab not complete yet', {
              tabId,
              status: tab.status,
              pingAttempt
            });
            await new Promise(resolve => setTimeout(resolve, pingIntervalMs));
            continue;
          }
          
          // Try to ping content script
          try {
            const pingResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            
            if (pingResponse && pingResponse.pong === true) {
              const elapsed = Date.now() - startTime;
              logger.info('waitForTabReady: Ping fallback succeeded', {
                tabId,
                elapsed,
                pingAttempt,
                hostname: pingResponse.hostname
              });
              return {
                success: true,
                source: 'ping',
                details: pingResponse,
                elapsed
              };
            } else {
              logger.warn('waitForTabReady ping: Invalid response', {
                tabId,
                pingAttempt,
                response: pingResponse
              });
              await new Promise(resolve => setTimeout(resolve, pingIntervalMs));
              continue;
            }
          } catch (pingError) {
            if (pingError.message?.includes('Receiving end does not exist')) {
              logger.debug('waitForTabReady ping: Content script not ready', {
                tabId,
                pingAttempt
              });
              await new Promise(resolve => setTimeout(resolve, pingIntervalMs));
              continue;
            }
            throw pingError;
          }
        } catch (error) {
          if (Date.now() - startTime >= timeoutMs) {
            throw new Error(`Ping timeout after ${pingAttempt} attempts: ${error.message}`);
          }
          
          logger.debug('waitForTabReady ping: Attempt failed', {
            tabId,
            pingAttempt,
            error: error.message
          });
          await new Promise(resolve => setTimeout(resolve, pingIntervalMs));
        }
      }
      
      throw new Error('Ping fallback exhausted all retries');
    };
    
    // OPTIMIZATION 4: Race strategy
    // - If registry is fast (100-500ms), use that
    // - If registry fails, fallback to ping (triggered after 500ms)
    // - Return whichever succeeds first
    
    // Start ping fallback after 500ms
    const pingFallback = (async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return await tryPingUntilReady();
    })();
    
    // Try registry first, race against ping fallback
    try {
      const result = await Promise.race([
        checkRegistryUntilReady(),
        pingFallback
      ]);
      
      logger.endOperation(correlationId, 'success', { 
        method: 'registry_or_ping',
        source: result.source,
        elapsed: result.elapsed
      });
      
      return result;
    } catch (error) {
      // Both registry and ping failed
      const elapsed = Date.now() - startTime;
      logger.warn('waitForTabReady: All strategies exhausted', {
        tabId,
        elapsed,
        error: error.message
      });
      
      throw new Error(
        `Timeout after ${Math.min(elapsed, timeoutMs)}ms: ${error.message}`
      );
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.endOperation(correlationId, 'error', {
      error: error.message,
      elapsed
    });
    return { 
      success: false, 
      error: error.message,
      elapsed
    };
  }
}


/**
 * Create a new chat session
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @returns {Promise<ApiResponse>}
 */
export async function createNewSession(tabId) {
  const correlationId = logger.startOperation('createNewSession');
  
  try {
    if (!tabId || tabId < 0) {
      return createApiErrorResponse(
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
      logger.endOperation(correlationId, 'success');
      return createDataResponse(data);
    }
    
    logger.endOperation(correlationId, 'error', 'No success response');
    return createApiErrorResponse(
      ERROR_CODES.SESSION_CREATE_FAILED,
      'Failed to create new session',
      'createNewSession'
    );
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToApiErrorResponse(error, 'createNewSession');
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
  const correlationId = logger.startOperation('sendInput');
  
  // X51LABS-75: Retry configuration (mirroring getOutput pattern)
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.retryDelayMs ?? 2000;
  
  try {
    if (!tabId || tabId < 0) {
      return createApiErrorResponse(
        ERROR_CODES.INVALID_TAB_ID,
        'Invalid tab ID provided',
        'sendInput'
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return createApiErrorResponse(
        ERROR_CODES.EMPTY_PROMPT,
        'Prompt cannot be empty',
        'sendInput'
      );
    }

    // X51LABS-75: Retry loop with exponential backoff
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          logger.info(`[sendInput] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms`, { correlationId });
          await new Promise(resolve => setTimeout(resolve, delayMs));
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
          logger.endOperation(correlationId, 'success');
          return createDataResponse(data);
        }
        
        // Invalid status - retry if attempts remain
        lastError = `Invalid status: ${response?.status}`;
        if (attempt < maxRetries) {
          logger.warn(`[sendInput] Invalid status, retrying`, { 
            attempt: attempt + 1,
            status: response?.status,
            correlationId 
          });
          continue;
        }
      } catch (error) {
        lastError = error;
        // Content script not ready - retry if attempts remain
        const isReceiverError = error.message?.includes('Receiving end does not exist') ||
                               error.message?.includes('Could not establish connection');
        
        if (isReceiverError && attempt < maxRetries) {
          logger.warn(`[sendInput] Content script not ready, retrying`, { 
            attempt: attempt + 1,
            error: error.message,
            correlationId 
          });
          continue;
        }
        
        throw error;
      }
    }
    
    // All retries exhausted
    logger.endOperation(correlationId, 'error', `Max retries exhausted: ${lastError}`);
    return createApiErrorResponse(
      ERROR_CODES.INPUT_SEND_FAILED,
      `Failed after ${maxRetries + 1} attempts`,
      'sendInput',
      { lastError: String(lastError) }
    );
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToApiErrorResponse(error, 'sendInput');
  }
}

/**
 * Get the latest output/response from ChatGPT
 * X51LABS-62: Added retry logic with exponential backoff
 * @param {number} tabId - The tab ID where ChatGPT is open
 * @param {GetOutputOptions} [options={}] - Options for getting output
 * @returns {Promise<ApiResponse>}
 */
export async function getOutput(tabId, options = {}) {
  const correlationId = logger.startOperation('getOutput');
  
  // X51LABS-62: Retry configuration
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.retryDelayMs ?? 2000;
  let lastPartialResult = null;
  
  try {
    if (!tabId || tabId < 0) {
      return createApiErrorResponse(
        ERROR_CODES.INVALID_TAB_ID,
        'Invalid tab ID provided',
        'getOutput'
      );
    }

    // X51LABS-62: Retry loop with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          logger.info(`[getOutput] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay`, { correlationId });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'get_output',
          wait: options.wait !== false,
          timeoutMs: options.timeoutMs || 15 * 60 * 1000,
          stableMs: options.stableMs || 1500,
          expectedChatId: options.expectedChatId || null  // Session guard
        });
        
        // Session mismatch: user navigated to a different chat while we were waiting
        if (response && response.status === 'session_mismatch') {
          logger.warn('[getOutput] Session mismatch — user navigated away', {
            expectedChatId: options.expectedChatId,
            currentChatId: response.currentChatId,
            correlationId
          });
          logger.endOperation(correlationId, 'error', 'session_mismatch');
          return createApiErrorResponse(
            ERROR_CODES.SESSION_MISMATCH,
            `Session changed: expected chatId=${options.expectedChatId}, actual chatId=${response.currentChatId}`,
            'getOutput',
            { expectedChatId: options.expectedChatId, currentChatId: response.currentChatId }
          );
        }
        
        if (response && response.result) {
          // X51LABS-62: Cache partial result
          lastPartialResult = response.result;
          
          const data = {
            result: response.result,
            chatId: response.chatId || null,
            chatUrl: response.chatUrl || null,
            assistantMessageId: response.assistantMessageId || null,
            status: response.status || 'completed',
            retryAttempt: attempt
          };
          
          // X51LABS-62: Save successful result to storage for fallback
          try {
            await chrome.storage.local.set({
              'lastResult': {
                result: response.result,
                chatId: response.chatId || null,
                chatUrl: response.chatUrl || null,
                timestamp: Date.now(),
                attempt: attempt
              }
            });
            logger.info(`[getOutput] Result cached to storage`, { correlationId, attempt });
          } catch (cacheErr) {
            logger.warn(`[getOutput] Failed to cache result`, { correlationId, error: cacheErr });
          }
          
          logger.endOperation(correlationId, 'success', { attempt });
          return createDataResponse(data);
        }
        
        // X51LABS-62: If no result but response exists, might be transient
        if (response && response.status === 'generating') {
          logger.info(`[getOutput] Still generating, will retry`, { correlationId, attempt });
          continue; // Retry
        }
        
        // No result but no explicit error - might succeed on retry
        logger.warn(`[getOutput] No result in response, attempt ${attempt}/${maxRetries}`, { correlationId });
        if (attempt === maxRetries) {
          // Last attempt failed, check for cached result fallback
          logger.info(`[getOutput] All retries exhausted, checking cache for fallback`, { correlationId });
          
          let cachedResult = null;
          try {
            const data = await chrome.storage.local.get(['lastResult']);
            cachedResult = data.lastResult;
            if (cachedResult && Date.now() - cachedResult.timestamp < 60 * 60 * 1000) { // 1 hour TTL
              logger.info(`[getOutput] Using cached result fallback (age: ${Math.round((Date.now() - cachedResult.timestamp) / 1000)}s)`, { correlationId });
              return createDataResponse({
                result: cachedResult.result,
                chatId: cachedResult.chatId,
                chatUrl: cachedResult.chatUrl,
                status: 'fallback-cached',
                retryAttempt: attempt,
                isCached: true
              });
            }
          } catch (cacheErr) {
            logger.warn(`[getOutput] Failed to load cache fallback`, { correlationId, error: cacheErr });
          }
          
          // Return error with partial if available
          logger.endOperation(correlationId, 'error', 'No result after retries');
          return createApiErrorResponse(
            ERROR_CODES.OUTPUT_FETCH_FAILED,
            lastPartialResult 
              ? `Timeout: partial result available (${lastPartialResult.length} chars)` 
              : 'No result available from ChatGPT after retries',
            'getOutput',
            { 
              responseStatus: response?.status,
              attempts: attempt + 1,
              partialResult: lastPartialResult?.substring(0, 200) // First 200 chars
            }
          );
        }
        
      } catch (attemptError) {
        logger.warn(`[getOutput] Attempt ${attempt} failed:`, { correlationId, error: attemptError });
        
        // Check if error is retryable
        const errorMsg = attemptError?.message || String(attemptError);
        const isRetryable = 
          errorMsg.includes('Could not establish connection') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('network');
        
        if (!isRetryable || attempt === maxRetries) {
          // Non-retryable error or final attempt
          throw attemptError;
        }
        
        // Retryable error, continue loop
        logger.info(`[getOutput] Retryable error detected, will retry`, { correlationId, attempt });
      }
    }
    
    // Should not reach here, but fallback
    logger.endOperation(correlationId, 'error', 'Retry loop exhausted');
    return createApiErrorResponse(
      ERROR_CODES.OUTPUT_FETCH_FAILED,
      'Failed to get output after all retries',
      'getOutput',
      { attempts: maxRetries + 1 }
    );
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', error);
    return exceptionToApiErrorResponse(error, 'getOutput');
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
  const correlationId = logger.startOperation('ensureChatGPTTab');
  const createIfNeeded = options.createIfNeeded !== false;
  const focusTab = options.focusTab !== false;
  
  try {
    // Try to find existing ChatGPT tab
    const tabs = await chrome.tabs.query({});
    let chatTab = tabs.find(t => t.url && t.url.includes('chatgpt.com'));
    
    if (chatTab) {
      logger.info('Found existing ChatGPT tab', { tabId: chatTab.id, discarded: chatTab.discarded });

      // Handle discarded tabs (Chrome Memory Saver killed the page process)
      // A discarded tab has no JS running — must reload before content script can respond
      if (chatTab.discarded) {
        logger.warn('ChatGPT tab was discarded by Chrome Memory Saver, reloading', { tabId: chatTab.id });
        await chrome.tabs.reload(chatTab.id);
        await new Promise((resolve) => {
          let timeoutId = null;
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            chrome.tabs.onUpdated.removeListener(listener);
          };
          const listener = (tabId, changeInfo) => {
            if (tabId === chatTab.id && changeInfo.status === 'complete') {
              cleanup();
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          timeoutId = setTimeout(() => { cleanup(); resolve(); }, 30000);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Prevent Chrome Memory Saver from discarding this tab while we use it
      try { await chrome.tabs.update(chatTab.id, { autoDiscardable: false }); } catch { /* not critical */ }

      // Focus existing tab if requested
      if (focusTab) {
        await chrome.tabs.update(chatTab.id, { active: true });
      }
      
      // Wait for content script to be ready (registry-based + ping fallback, 10s)
      const readyResult = await waitForTabReady(chatTab.id);
      if (readyResult.success) {
        logger.endOperation(correlationId, 'success');
        return { tabId: chatTab.id, isNew: false };
      } else {
        // Content script not ready on existing tab
        // If createIfNeeded is true, reload the tab and try again
        if (createIfNeeded) {
          logger.warn('Content script not ready on existing tab, reloading', { tabId: chatTab.id });
          await chrome.tabs.reload(chatTab.id);
          
          // Wait for reload to complete
          await new Promise((resolve) => {
            let timeoutId = null;
            const cleanup = () => {
              if (timeoutId) clearTimeout(timeoutId);
              chrome.tabs.onUpdated.removeListener(listener);
            };
            const listener = (tabId, changeInfo) => {
              if (tabId === chatTab.id && changeInfo.status === 'complete') {
                cleanup();
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            timeoutId = setTimeout(() => {
              cleanup();
              resolve();
            }, 30000); // Timeout after 30s
          });
          
          // Additional wait for React to load
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Try again after reload (registry-based + ping fallback, 10s)
          const readyAfterReload = await waitForTabReady(chatTab.id);
          if (readyAfterReload.success) {
            logger.endOperation(correlationId, 'success');
            return { tabId: chatTab.id, isNew: false };
          }
          
          // Still not ready after reload - create new tab as fallback
          logger.warn('Content script still not ready after reload, creating new tab');
          chatTab = null; // Force creation of new tab below
        } else {
          const errorMsg = 'Content script not ready and createIfNeeded=false';
          logger.endOperation(correlationId, 'error', errorMsg);
          return { 
            tabId: chatTab.id, 
            isNew: false, 
            error: errorMsg
          };
        }
      }
    }
    
    // Create new tab if needed
    if (!chatTab && createIfNeeded) {
      logger.info('Creating new ChatGPT tab');
      chatTab = await chrome.tabs.create({ 
        url: 'https://chatgpt.com/', 
        active: focusTab 
      });

      // Prevent Memory Saver from discarding this tab during job processing
      try { await chrome.tabs.update(chatTab.id, { autoDiscardable: false }); } catch { /* not critical */ }

      // Wait for page to load
      await new Promise((resolve) => {
        let timeoutId = null;
        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
        };
        const listener = (tabId, changeInfo) => {
          if (tabId === chatTab.id && changeInfo.status === 'complete') {
            cleanup();
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 30 seconds
        timeoutId = setTimeout(() => {
          cleanup();
          resolve();
        }, 30000);
      });
      
      // Additional wait for React to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for content script to be ready (registry-based + ping fallback, 10s)
      const readyResult2 = await waitForTabReady(chatTab.id);
      if (readyResult2.success) {
        logger.endOperation(correlationId, 'success');
        return { tabId: chatTab.id, isNew: true };
      } else {
        const errorMsg = `Content script not ready after waiting: ${readyResult2.error || 'timeout'}`;
        logger.endOperation(correlationId, 'error', errorMsg);
        return { 
          tabId: chatTab.id, 
          isNew: true, 
          error: errorMsg
        };
      }
    }
    
    const errorMsg = 'No ChatGPT tab found';
    logger.endOperation(correlationId, 'error', errorMsg);
    return { 
      tabId: -1, 
      isNew: false, 
      error: errorMsg
    };
  } catch (error) {
    const errorMsg = error?.message || String(error);
    logger.endOperation(correlationId, 'error', errorMsg);
    return {
      tabId: -1,
      isNew: false,
      error: errorMsg
    };
  }
}

// waitForContentScript removed — replaced by waitForTabReady (registry + ping, 10s timeout)

/**
 * Release a tab back to Chrome's normal memory management (allow auto-discard).
 * Call this after enrichment / job completes so the tab can be managed normally.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function releaseTab(tabId) {
  if (!tabId || tabId < 0) return;
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: true });
  } catch {
    // Tab might already be closed — not critical
  }
}
