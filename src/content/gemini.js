/**
 * @fileoverview Gemini Content Script — DOM automation on gemini.google.com
 * Ticket: XST-813 — Gemini Web Provider (no API key)
 *
 * This module provides DOM interaction functions for gemini.google.com.
 * It is injected via chrome.scripting.executeScript from the background.
 *
 * Architecture:
 * - injectPrompt: Find input, insert text in chunks, click submit
 * - extractResponse: Poll last AI message until stable (no change in 2s)
 * - Multiple fallback selectors for resilience against DOM changes
 *
 * MV3-safe: Runs in page context, no imports, self-contained functions.
 */

// ===== SELECTOR CHAINS (multiple fallbacks) =====

const GEMINI_SELECTORS = {
  // Input area selectors
  input: [
    'div[contenteditable="true"].ql-editor',
    'div[contenteditable="true"][aria-label*="prompt"]',
    'div[contenteditable="true"][data-placeholder]',
    'rich-textarea div[contenteditable="true"]',
    'textarea[placeholder*="message"]',
    'textarea[placeholder*="Enter"]',
    'div[contenteditable="true"]',
  ],

  // Submit button selectors
  submit: [
    'button[aria-label*="Send"]',
    'button[aria-label*="Gửi"]',
    'button.send-button',
    'button[mat-icon-button] mat-icon[fonticon="send"]',
    'button[data-test-id="send-button"]',
    '.input-area button[aria-label*="send" i]',
    'button.mdc-icon-button[aria-label*="Send"]',
  ],

  // Response container selectors (last AI message)
  response: [
    'model-response .response-content',
    'model-response message-content',
    'model-response .markdown',
    '[data-test-id="response-content"]',
    '.response-container .markdown-main-panel',
    'message-content .markdown',
    '.model-response-text',
  ],

  // Loading/generating indicator
  loading: [
    '.loading-indicator',
    '[data-test-id="loading"]',
    '.response-loading',
    'model-response .loading',
    '.thinking-indicator',
  ],

  // New chat button
  newChat: [
    'button[aria-label*="New chat"]',
    'button[aria-label*="Cuộc trò chuyện mới"]',
    'a[href="/app"]',
    '.new-chat-button',
  ],
};

// ===== DOM HELPERS =====

/**
 * Find element using selector chain with fallbacks.
 * @param {string[]} selectors
 * @returns {Element|null}
 */
function findElement(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch { /* selector parse error — skip */ }
  }
  return null;
}

/**
 * Wait for an element to appear in DOM.
 * @param {string[]} selectors
 * @param {number} timeoutMs
 * @returns {Promise<Element>}
 */
function waitForElement(selectors, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const el = findElement(selectors);
    if (el) return resolve(el);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const found = findElement(selectors);
      if (found) {
        clearInterval(interval);
        resolve(found);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Element not found within timeout'));
      }
    }, 200);
  });
}

// ===== PUBLIC FUNCTIONS =====

/**
 * Inject prompt text into Gemini input and submit.
 * Inserts text in chunks of 200 chars to avoid performance issues.
 *
 * @param {string} promptText - The prompt to send
 * @returns {Promise<{success: boolean}>}
 */
async function injectPrompt(promptText) {
  if (!promptText || typeof promptText !== 'string') {
    throw new Error('Invalid prompt text');
  }

  // 1. Find input area
  const input = await waitForElement(GEMINI_SELECTORS.input, 10000);
  if (!input) {
    throw new Error('Gemini input area not found. Ensure you are on gemini.google.com and logged in.');
  }

  // 2. Focus input
  input.focus();
  input.click();
  await sleep(100);

  // 3. Clear existing content
  if (input.tagName === 'TEXTAREA') {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // contenteditable
    input.innerHTML = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await sleep(100);

  // 4. Insert text in chunks (200 chars) to avoid performance issues
  const CHUNK_SIZE = 200;
  for (let i = 0; i < promptText.length; i += CHUNK_SIZE) {
    const chunk = promptText.slice(i, i + CHUNK_SIZE);

    if (input.tagName === 'TEXTAREA') {
      input.value += chunk;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable — use execCommand for compatibility
      document.execCommand('insertText', false, chunk);
    }

    // Brief pause between chunks
    if (i + CHUNK_SIZE < promptText.length) {
      await sleep(50);
    }
  }

  await sleep(200);

  // 5. Find and click submit button
  const submitBtn = findElement(GEMINI_SELECTORS.submit);
  if (!submitBtn) {
    throw new Error('Gemini submit button not found');
  }

  submitBtn.click();
  await sleep(300);

  return { success: true };
}

/**
 * Extract the latest AI response from Gemini.
 * Polls until response is stable (no change for 2 seconds) or timeout.
 *
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=120000] - Max wait time
 * @param {number} [options.stableMs=2000] - Time without changes to consider stable
 * @param {number} [options.pollIntervalMs=500] - Poll interval
 * @returns {Promise<string>} Response text
 */
async function extractResponse(options = {}) {
  const timeoutMs = options.timeoutMs || 120000;
  const stableMs = options.stableMs || 2000;
  const pollIntervalMs = options.pollIntervalMs || 500;

  const startTime = Date.now();
  let lastText = '';
  let lastChangeTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Check for loading indicator
    const isLoading = findElement(GEMINI_SELECTORS.loading);

    // Get all response elements — take the LAST one (most recent)
    let responseText = '';
    for (const sel of GEMINI_SELECTORS.response) {
      try {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          const lastEl = elements[elements.length - 1];
          responseText = lastEl.textContent?.trim() || '';
          if (responseText) break;
        }
      } catch { /* skip */ }
    }

    if (responseText && responseText !== lastText) {
      lastText = responseText;
      lastChangeTime = Date.now();
    }

    // Check if response is stable (no loading + no changes for stableMs)
    if (responseText && !isLoading && (Date.now() - lastChangeTime >= stableMs)) {
      return responseText;
    }

    await sleep(pollIntervalMs);
  }

  // Timeout — return whatever we have
  if (lastText) {
    return lastText;
  }

  throw new Error('Gemini response timeout: no response received within ' + timeoutMs + 'ms');
}

/**
 * Check if user appears to be logged in to Gemini.
 * @returns {boolean}
 */
function isLoggedIn() {
  // Check for login prompts or sign-in buttons
  const loginIndicators = [
    'a[href*="accounts.google.com"]',
    'button[aria-label*="Sign in"]',
    '[data-test-id="sign-in"]',
  ];

  const inputArea = findElement(GEMINI_SELECTORS.input);
  if (inputArea) return true; // Input visible = logged in

  for (const sel of loginIndicators) {
    try {
      if (document.querySelector(sel)) return false;
    } catch { /* skip */ }
  }

  return true; // Assume logged in if no login indicators found
}

/**
 * Create a new chat session in Gemini.
 * @returns {Promise<{success: boolean}>}
 */
async function createNewSession() {
  const newChatBtn = findElement(GEMINI_SELECTORS.newChat);
  if (newChatBtn) {
    newChatBtn.click();
    await sleep(1000);
    return { success: true };
  }

  // Fallback: navigate to /app
  window.location.href = 'https://gemini.google.com/app';
  await sleep(2000);
  return { success: true };
}

// ===== MESSAGE HANDLER =====

/**
 * Handle messages from background service worker.
 * @param {Object} message
 * @param {Object} sender
 * @param {Function} sendResponse
 */
function handleMessage(message, sender, sendResponse) {
  const { action } = message;

  switch (action) {
    case 'ping':
      sendResponse({ pong: true, hostname: window.location.hostname, provider: 'gemini' });
      return false; // Sync response

    case 'inject_prompt':
      injectPrompt(message.prompt)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Async response

    case 'extract_response':
      extractResponse(message.options || {})
        .then(text => sendResponse({ success: true, text }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Async response

    case 'check_login':
      sendResponse({ loggedIn: isLoggedIn() });
      return false;

    case 'create_new_session':
      createNewSession()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      sendResponse({ error: `Unknown action: ${action}` });
      return false;
  }
}

// ===== INITIALIZATION =====

// Register message listener
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Signal ready to background
try {
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    hostname: window.location.hostname,
    provider: 'gemini',
  }).catch(() => { /* No listeners — safe to ignore */ });
} catch { /* chrome.runtime not available */ }

// ===== HELPER =====

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ESM exports for testing (stripped from build by contentScriptClassicPlugin)
export { injectPrompt, extractResponse, isLoggedIn, createNewSession, handleMessage, GEMINI_SELECTORS };

