/**
 * @fileoverview Claude Content Script — DOM automation on claude.ai
 * Ticket: XST-814 — Claude Web Provider (no API key)
 *
 * This module provides DOM interaction functions for claude.ai.
 * It is loaded as a content_script matching https://claude.ai/*.
 *
 * Architecture (mirrors gemini.js pattern):
 * - injectPrompt: Find input, insert text in chunks, click submit
 * - extractResponse: Poll last AI message until stable (no change in 2s)
 * - Multiple fallback selectors for resilience against DOM changes
 *
 * MV3-safe: Runs in page context, self-contained functions.
 */

// ===== SELECTOR CHAINS (multiple fallbacks) =====

const CLAUDE_SELECTORS = {
  // Input area selectors
  input: [
    'div[contenteditable="true"].ProseMirror',
    'div[contenteditable="true"][data-placeholder]',
    'div.ProseMirror[contenteditable="true"]',
    'fieldset div[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="Reply" i]',
  ],

  // Submit button selectors
  submit: [
    'button[aria-label="Send Message"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Gửi" i]',
    'button[data-testid="send-button"]',
    'fieldset button[type="button"]:last-child',
    'button.bg-accent-main-100',
    'button svg[viewBox*="0 0"][data-icon="arrow-up"]',
  ],

  // Response container selectors (last AI message)
  response: [
    '[data-testid="chat-message-content"]',
    'div.font-claude-message .grid-cols-1 .break-words',
    'div[data-is-streaming] .break-words',
    '.prose',
    '.font-claude-message .markdown',
    '.message-content .markdown',
    '[class*="message"] .break-words',
  ],

  // Loading/generating indicator
  loading: [
    '[data-is-streaming="true"]',
    'button[aria-label="Stop Response"]',
    'button[aria-label*="Stop" i]',
    '.animate-pulse',
    '[data-testid="stop-button"]',
  ],

  // New chat button
  newChat: [
    'a[href="/new"]',
    'button[aria-label*="New chat" i]',
    'button[aria-label*="Cuộc trò chuyện" i]',
    'a[data-testid="new-chat"]',
    'nav a[href="/new"]',
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
 * Inject prompt text into Claude input and submit.
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
  const input = await waitForElement(CLAUDE_SELECTORS.input, 10000);
  if (!input) {
    throw new Error('Claude input area not found. Ensure you are on claude.ai and logged in.');
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
    // contenteditable (ProseMirror)
    // ProseMirror needs special handling — set innerHTML to paragraph
    input.innerHTML = '<p></p>';
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
  const submitBtn = findElement(CLAUDE_SELECTORS.submit);
  if (!submitBtn) {
    throw new Error('Claude submit button not found');
  }

  submitBtn.click();
  await sleep(300);

  return { success: true };
}

/**
 * Extract the latest AI response from Claude.
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
    const isLoading = findElement(CLAUDE_SELECTORS.loading);

    // Get all response elements — take the LAST one (most recent)
    let responseText = '';
    for (const sel of CLAUDE_SELECTORS.response) {
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

  throw new Error('Claude response timeout: no response received within ' + timeoutMs + 'ms');
}

/**
 * Check if user appears to be logged in to Claude.
 * @returns {boolean}
 */
function isLoggedIn() {
  // Check for login prompts or sign-in buttons
  const loginIndicators = [
    'button[data-testid="login-button"]',
    'a[href*="/login"]',
    'button:has-text("Log in")',
    '[data-testid="sign-in"]',
  ];

  const inputArea = findElement(CLAUDE_SELECTORS.input);
  if (inputArea) return true; // Input visible = logged in

  for (const sel of loginIndicators) {
    try {
      if (document.querySelector(sel)) return false;
    } catch { /* skip */ }
  }

  return true; // Assume logged in if no login indicators found
}

/**
 * Create a new chat session in Claude.
 * @returns {Promise<{success: boolean}>}
 */
async function createNewSession() {
  const newChatBtn = findElement(CLAUDE_SELECTORS.newChat);
  if (newChatBtn) {
    newChatBtn.click();
    await sleep(1000);
    return { success: true };
  }

  // Fallback: navigate to /new
  window.location.href = 'https://claude.ai/new';
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
      sendResponse({ pong: true, hostname: window.location.hostname, provider: 'claude' });
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
    provider: 'claude',
  }).catch(() => { /* No listeners — safe to ignore */ });
} catch { /* chrome.runtime not available */ }

// ===== HELPER =====

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    injectPrompt,
    extractResponse,
    isLoggedIn,
    createNewSession,
    handleMessage,
    CLAUDE_SELECTORS,
  };
}
