// Content Script - chạy trên ChatGPT

console.log('[ChatGPT Assistant] content script loaded at', new Date().toISOString());
console.log('[ChatGPT Assistant] Location:', location.href);
console.log('[ChatGPT Assistant] Hostname:', location.hostname);

// X51LABS-83: Detect and handle chatbot-ui.com redirect
if (location.hostname.includes('chatbot-ui.com')) {
  console.warn('[Content] Detected chatbot-ui.com redirect - redirecting to chatgpt.com');
  try {
    location.replace('https://chatgpt.com/');
  } catch (error) {
    console.error('[Content] Redirect failed:', error);
  }
}

// X51LABS-156: CRITICAL: Content script initialization marker for ping detection
// This runs SYNCHRONOUSLY at module load, before any async operations
window.__ChatGPTAssistantReady = true;
window.__ChatGPTAssistantReadyTimestamp = Date.now();
console.log('[Content] ✅ Window marker set for ping detection at:', new Date(window.__ChatGPTAssistantReadyTimestamp).toISOString());


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChatMeta() {
  const chatUrl = location.href;
  const path = location.pathname || '';
  const match = path.match(/\/c\/([^/?#]+)/);
  const chatId = match ? match[1] : null;
  
  // 🔍 DEBUG: Log chat metadata extraction
  console.log('🔍 [Content] getChatMeta:', {
    chatUrl,
    pathname: path,
    chatId,
    hasMatch: !!match
  });
  
  return { chatUrl, chatId };
}

// X51LABS-61: Robust selector fallback chains
const SELECTOR_CHAINS = {
  editor: [
    // Priority 1: Test ID + attributes
    { selector: '#prompt-textarea.ProseMirror[contenteditable="true"]', name: 'testid-prosemirror' },
    { selector: '#prompt-textarea[contenteditable="true"]', name: 'testid-editable' },
    // Priority 2: Semantic selectors
    { selector: 'div[data-id="root"] textarea', name: 'semantic-textarea' },
    { selector: 'main textarea', name: 'main-textarea' },
    // Priority 3: General fallbacks
    { selector: 'textarea', name: 'generic-textarea' },
    { selector: '[contenteditable="true"]', name: 'generic-editable' }
  ],
  newChatButton: [
    // Priority 1: Test ID
    { selector: 'a[data-testid="create-new-chat-button"]', name: 'testid-create-new' },
    // Priority 2: Semantic attributes
    { selector: 'a[data-sidebar-item="true"][href="/"]', name: 'sidebar-home-link' },
    { selector: 'nav a[href="/"]', name: 'nav-home-link' },
    // Priority 3: Text-based fallback
    { selector: 'a[href*="chatgpt.com/"]', name: 'domain-link' }
  ]
};

// X51LABS-61: Selector success tracking
let selectorStats = {
  editor: { lastMatch: null, matchCount: {} },
  newChatButton: { lastMatch: null, matchCount: {} }
};

// X51LABS-61: Storage keys for selector cache
const SELECTOR_CACHE_KEY = 'x51labs_selector_cache_v1';

// X51LABS-61: Load cached selector preference from storage
async function loadSelectorCache() {
  try {
    const data = await chrome.storage.local.get([SELECTOR_CACHE_KEY]);
    const cached = data[SELECTOR_CACHE_KEY];
    
    if (cached && typeof cached === 'object') {
      console.log('[Content] Loaded selector cache:', cached);
      return cached;
    }
  } catch (err) {
    console.warn('[Content] Failed to load selector cache:', err);
  }
  return null;
}

// X51LABS-61: Save selector stats to storage for recovery after reload
async function saveSelectorStats() {
  try {
    const toCache = {
      editor: selectorStats.editor.lastMatch,
      newChatButton: selectorStats.newChatButton.lastMatch,
      timestamp: Date.now(),
      version: detectChatGPTVersion()
    };
    
    await chrome.storage.local.set({ [SELECTOR_CACHE_KEY]: toCache });
    console.log('[Content] Selector stats cached:', toCache);
  } catch (err) {
    console.warn('[Content] Failed to save selector cache:', err);
  }
}

// X51LABS-61: Detect ChatGPT version from page metadata
function detectChatGPTVersion() {
  try {
    // Try to detect version from various sources
    const metaGenerator = document.querySelector('meta[name="generator"]')?.content;
    const nextData = document.getElementById('__NEXT_DATA__')?.textContent;
    
    let detectedVersion = 'unknown';
    
    if (metaGenerator) {
      detectedVersion = `meta:${metaGenerator}`;
    } else if (nextData) {
      // Try to parse Next.js data for version info
      try {
        const data = JSON.parse(nextData);
        if (data.buildId) {
          detectedVersion = `nextjs:${data.buildId.substring(0, 8)}`;
        }
      } catch (e) {
        // Silent fail
      }
    }
    
    // Fallback: check for specific UI elements
    if (detectedVersion === 'unknown') {
      const hasProseMirror = !!document.querySelector('.ProseMirror');
      const hasTestIds = !!document.querySelector('[data-testid]');
      detectedVersion = `ui:prosemirror=${hasProseMirror},testids=${hasTestIds}`;
    }
    
    console.log(`[Content] ChatGPT version detected: ${detectedVersion}`);
    return detectedVersion;
  } catch (err) {
    console.warn('[Content] Version detection failed:', err);
    return 'detection-failed';
  }
}

function trySelectorsChain(chainName, cachedSelectors = null) {
  const chain = SELECTOR_CHAINS[chainName];
  if (!chain) {
    console.error(`[Content] Unknown selector chain: ${chainName}`);
    return null;
  }
  
  // X51LABS-61: Try cached selector first (fast recovery from prior UI state)
  if (cachedSelectors && cachedSelectors[chainName]) {
    const cachedName = cachedSelectors[chainName];
    const cachedDef = chain.find(c => c.name === cachedName);
    
    if (cachedDef) {
      try {
        const element = document.querySelector(cachedDef.selector);
        if (element) {
          selectorStats[chainName].matchCount[cachedName] = (selectorStats[chainName].matchCount[cachedName] || 0) + 1;
          selectorStats[chainName].lastMatch = cachedName;
          
          console.log(`[Content] ✅ ${chainName} found via cached: ${cachedName} (${cachedDef.selector})`);
          saveSelectorStats(); // Update cache on success
          return element;
        }
      } catch (err) {
        console.warn(`[Content] Cached selector failed: ${cachedDef.selector}`, err);
        // Fall through to full chain scan
      }
    }
  }
  
  // X51LABS-61: Full fallback chain scan
  for (const { selector, name } of chain) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        // Track successful match
        if (!selectorStats[chainName].matchCount[name]) {
          selectorStats[chainName].matchCount[name] = 0;
        }
        selectorStats[chainName].matchCount[name]++;
        selectorStats[chainName].lastMatch = name;
        
        console.log(`[Content] ✅ ${chainName} found via: ${name} (${selector})`);
        saveSelectorStats(); // Persist successful match
        return element;
      }
    } catch (err) {
      console.warn(`[Content] Selector failed: ${selector}`, err);
    }
  }
  
  console.warn(`[Content] ⚠️ No ${chainName} selector matched. Tried ${chain.length} selectors.`);
  return null;
}

// X51LABS-61: Cache loaded at module init
let cachedSelectors = null;

function findEditor() {
  return trySelectorsChain('editor', cachedSelectors);
}

function findNewChatButton() {
  return trySelectorsChain('newChatButton', cachedSelectors);
}

// X51LABS-61: Initialize selector cache on content script load
(async () => {
  try {
    cachedSelectors = await loadSelectorCache();
    console.log('[Content] Selector cache initialized:', cachedSelectors);
  } catch (err) {
    console.warn('[Content] Cache init failed (non-blocking):', err);
  }
})();

// X51LABS-94: Expose selector stats and send telemetry to background
function getSelectorStats() {
  const stats = {
    ...JSON.parse(JSON.stringify(selectorStats)),
    version: detectChatGPTVersion(),
    timestamp: Date.now()
  };
  
  // X51LABS-94: Send telemetry to background (fire-and-forget)
  chrome.runtime.sendMessage({
    v: 1,
    type: 'TELEMETRY_REPORT',
    correlationId: `telemetry-${Date.now()}`,
    timestamp: Date.now(),
    data: {
      stats: selectorStats,
      version: stats.version
    }
  }).catch(err => {
    console.warn('[Content] Telemetry send failed:', err);
  });
  
  return stats;
}

const PENDING_PROMPT_KEY = '__chatgpt_assistant_pending_prompt_v1';

function readPendingPrompt() {
  try {
    const raw = sessionStorage.getItem(PENDING_PROMPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.prompt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePendingPrompt(pending) {
  try {
    sessionStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

function clearPendingPrompt() {
  try {
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
  } catch {
    // ignore
  }
}

function triggerNewChatNavigation() {
  const btn = findNewChatButton();
  if (btn instanceof HTMLElement) {
    btn.click();
    return;
  }
  // Fallback: navigate to home which typically starts a new chat.
  try {
    location.assign('https://chatgpt.com/');
  } catch {
    // ignore
  }
}

// X51LABS-81: Added try-catch to prevent crashes on DOM errors
function getConversationMessageCount() {
  try {
    // In an empty/new chat, there should be no user/assistant messages.
    return document.querySelectorAll('div[data-message-author-role="user"], div[data-message-author-role="assistant"]').length;
  } catch (error) {
    console.warn('[Content] getConversationMessageCount failed:', error);
    return 0;
  }
}

async function waitForEmptyNewChat({ startUrl, timeoutMs = 20000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const editor = findEditor();
    const msgCount = getConversationMessageCount();
    const urlChanged = typeof startUrl === 'string' ? location.href !== startUrl : true;

    // Conditions for "safe to send": editor exists AND conversation is empty AND we are not still stuck on the old chat URL.
    if (editor && msgCount === 0 && (urlChanged || !location.pathname.startsWith('/c/'))) {
      return true;
    }

    await sleep(200);
  }
  return false;
}

async function ensureNewChatSession(timeoutMs = 20000) {
  // X51LABS-65: Enhanced race condition protection
  const startUrl = location.href;
  const startMsgCount = getConversationMessageCount();
  const btn = findNewChatButton();

  if (btn instanceof HTMLElement) {
    console.log('[Content] Clicking new chat button');
    btn.click();
  } else {
    // Fallback: navigate to home which typically starts a new chat.
    try {
      console.log('[Content] Navigating to chatgpt.com home');
      location.assign('https://chatgpt.com/');
    } catch {
      // ignore
    }
  }

  // X51LABS-65: Increased wait time from 800ms to 2000ms
  await sleep(2000);
  
  // X51LABS-76: Polling with increased timeout (30s) and strict condition check
  const start = Date.now();
  let attempts = 0;
  const maxAttempts = 3;
  
  // X51LABS-76: Increased timeout from 10s to 30s
  const effectiveTimeout = 30000;
  
  while (Date.now() - start < effectiveTimeout) {
    attempts++;
    const editor = findEditor();
    const currentMsgCount = getConversationMessageCount();
    const urlChanged = location.href !== startUrl;
    
    // X51LABS-76: Wait for BOTH urlChanged AND currentMsgCount === 0 (strict check)
    if (editor && urlChanged && currentMsgCount === 0) {
      console.log(`[Content] ✅ New chat session ready after ${attempts} attempts (${Date.now() - start}ms)`);
      return true;
    }
    
    // X51LABS-76: Log progress for debugging
    if (attempts % 5 === 0) {
      console.log(`[Content] ⏳ Waiting for new chat... attempt ${attempts}, msgCount=${currentMsgCount}, urlChanged=${urlChanged}`);
    }
    
    // Exponential backoff for retries
    if (attempts >= maxAttempts) {
      const backoffDelay = Math.min(300 * Math.pow(2, attempts - maxAttempts), 2000);
      await sleep(backoffDelay);
    } else {
      await sleep(300);
    }
  }

  // X51LABS-76: Removed fallback, strict enforcement
  console.error('[Content] ❌ Timeout after 30s: urlChanged or msgCount != 0');
  return false;
}

async function waitForEditor(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = findEditor();
    if (el) return el;
    await sleep(200);
  }
  return null;
}

function findSendButton() {
  // Selector đặc thù của chatgpt.com
  const byId = document.querySelector('#composer-submit-button');
  if (byId) return byId;

  const byTestId = document.querySelector('button[data-testid="send-button"]');
  if (byTestId) return byTestId;

  // Fallback: aria-label
  const buttons = document.querySelectorAll('button');
  const normalized = (s) => (s || '').toLowerCase();
  for (const btn of buttons) {
    const label = normalized(btn.getAttribute('aria-label'));
    const title = normalized(btn.getAttribute('title'));
    if (label.includes('send prompt') || label === 'send' || label.includes('gửi') || title.includes('send')) {
      return btn;
    }
  }
  return null;
}

function setNativeValue(el, value) {
  if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    return;
  }

  // contenteditable
  // ProseMirror thường chứa <p>...</p>
  el.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = value;
  el.appendChild(p);
}

async function inputAndSendPrompt(prompt, options = {}) {
  const createNewChat = options.createNewChat !== false;
  const reviewOnly = options.reviewOnly === true;
  const editorTimeoutMs = Number.isFinite(options.editorTimeoutMs) ? options.editorTimeoutMs : 25000;
  if (createNewChat) {
    await ensureNewChatSession();
    await sleep(500); // More time for DOM to fully settle
  }

  const editor = await waitForEditor(editorTimeoutMs);
  if (!editor) {
    console.error('[ChatGPT Assistant] editor not found after', editorTimeoutMs, 'ms');
    return false;
  }
  console.log('[Content] Editor found and ready');

  editor.focus();
  const isContentEditable = !(editor instanceof HTMLTextAreaElement);

  if (isContentEditable) {
    // ProseMirror: Clear existing content first
    try {
      editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', ctrlKey: true }));
      editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a', ctrlKey: true }));
      document.execCommand('selectAll');
      document.execCommand('delete');
    } catch {
      setNativeValue(editor, '');
    }

    // Insert text in chunks to avoid paste issues with long prompts
    const chunkSize = 200; // Characters per chunk
    const chunks = [];
    for (let i = 0; i < prompt.length; i += chunkSize) {
      chunks.push(prompt.substring(i, i + chunkSize));
    }

    console.log(`[Content] Inserting prompt in ${chunks.length} chunks of ~${chunkSize} chars`);
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        document.execCommand('insertText', false, chunks[i]);
      } catch {
        // Fallback: append to existing content
        const currentText = editor.textContent || '';
        setNativeValue(editor, currentText + chunks[i]);
      }
      
      // Small delay between chunks for very long prompts
      if (i < chunks.length - 1 && chunks.length > 5) {
        await sleep(50);
      }
    }

    // Trigger events to enable send button
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    setNativeValue(editor, prompt);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await sleep(500); // Wait longer for send button to become enabled

  // If reviewOnly, stop here without sending
  if (reviewOnly) {
    console.log('[Content] Review mode - returning without sending');
    return true;
  }

  // Wait for send button to appear and be enabled (max 5s)
  let sendBtn = null;
  const btnStartTime = Date.now();
  while (Date.now() - btnStartTime < 5000) {
    sendBtn = findSendButton();
    if (sendBtn && !sendBtn.disabled) {
      console.log('[Content] Send button found and enabled');
      break;
    }
    await sleep(200);
  }

  if (sendBtn && !sendBtn.disabled) {
    console.log('[Content] Clicking send button');
    sendBtn.click();
    return true;
  }

  // Fallback: Enter
  editor.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' })
  );
  editor.dispatchEvent(
    new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' })
  );
  return true;
}

async function trySendPendingPromptOnce() {
  const pending = readPendingPrompt();
  if (!pending) return false;

  if (pending.createNewChat) {
    const ready = await waitForEmptyNewChat({ startUrl: pending.startUrl, timeoutMs: 20000 });
    if (!ready) return false;
  }

  const ok = await inputAndSendPrompt(pending.prompt, { createNewChat: false, editorTimeoutMs: 4000 });
  if (!ok) return false;

  clearPendingPrompt();

  try {
    const meta = getChatMeta();
    chrome.runtime.sendMessage({
      v: 1,
      type: 'CONTENT_PROMPT_SENT',
      correlationId: `prompt-sent-${Date.now()}`,
      timestamp: Date.now(),
      data: { runId: pending.runId || null, ...meta }
    });
  } catch {
    // ignore
  }

  return true;
}

let drainPendingPromptInFlight = false;

async function drainPendingPrompt({ timeoutMs = 30000 } = {}) {
  if (drainPendingPromptInFlight) return;
  drainPendingPromptInFlight = true;
  const start = Date.now();
  try {
    while (Date.now() - start < timeoutMs) {
      const pending = readPendingPrompt();
      if (!pending) return;

      try {
        const ok = await trySendPendingPromptOnce();
        if (ok) return;
      } catch {
        // ignore and retry
      }

      await sleep(500);
    }

    // Timeout: notify background that prompt couldn't be sent
    const pending = readPendingPrompt();
    if (pending && pending.runId) {
      try {
        chrome.runtime.sendMessage({
          v: 1,
          type: 'CONTENT_PROMPT_FAILED',
          correlationId: `prompt-failed-${Date.now()}`,
          timestamp: Date.now(),
          data: {
            runId: pending.runId,
            error: 'timeout_sending_prompt'
          }
        });
      } catch {
        // ignore
      }
      clearPendingPrompt();
    }
  } finally {
    drainPendingPromptInFlight = false;
  }
}

function getLatestAssistantMessage() {
  const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (!nodes || nodes.length === 0) return null;
  const last = nodes[nodes.length - 1];
  const text = (last.innerText || last.textContent || '').trim();
  return text || null;
}

/**
 * Remove ChatGPT web-search noise elements from a cloned DOM node.
 * These include: source cards (favicon rows, "+N" badges), citation
 * superscripts, images, and action buttons that pollute innerText.
 */
function removeSearchNoise(container) {
  // 1. Citation superscripts (e.g., [1], [2])
  container.querySelectorAll('sup').forEach(el => el.remove());

  // 2. Images — favicons, avatars, thumbnails shown in source cards
  container.querySelectorAll('img').forEach(el => el.remove());

  // 3. Buttons — copy, like/dislike, "show more" etc.
  container.querySelectorAll('button').forEach(el => el.remove());

  // 4. Known noise class fragments
  container.querySelectorAll(
    '[class*="citation"], [class*="source"], [class*="metadata"], ' +
    '[class*="favicon"], [class*="footnote"], [data-testid*="citation"]'
  ).forEach(el => el.remove());

  // 5. Source-card rows: containers of multiple external links
  //    ChatGPT renders "Sources" as a flex row of <a target="_blank"> cards.
  //    Detect parent containers where most children are outbound links.
  container.querySelectorAll('a[target="_blank"]').forEach(link => {
    const parent = link.parentElement;
    if (!parent || parent === container) return;
    const childCount = parent.children.length;
    if (childCount < 2) return;
    const linkCount = parent.querySelectorAll('a[target="_blank"]').length;
    // If ≥50 % of children are outbound links → source card row → remove parent
    if (linkCount / childCount >= 0.5) {
      parent.remove();
    }
  });

  // 6. Standalone "+N" badges (e.g., "+2", "+5")
  container.querySelectorAll('span, div').forEach(el => {
    const t = (el.textContent || '').trim();
    if (/^\+\d{1,2}$/.test(t) && el.children.length === 0) {
      el.remove();
    }
  });
}

function getLatestAssistantMessageMeta() {
  const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (!nodes || nodes.length === 0) return { text: null, messageId: null };
  const last = nodes[nodes.length - 1];

  // Try to get clean content without web-search source cards & citations
  let text = null;

  // Strategy 1: Look for markdown/prose content wrapper → clone & strip noise
  const markdownContent = last.querySelector('.markdown, .prose, [class*="markdown"], [class*="prose"]');
  if (markdownContent) {
    const clone = markdownContent.cloneNode(true);
    removeSearchNoise(clone);
    text = (clone.innerText || clone.textContent || '').trim();
  }

  // Strategy 2: If no markdown wrapper, clone entire message & strip noise
  if (!text) {
    const clone = last.cloneNode(true);
    removeSearchNoise(clone);
    text = (clone.innerText || clone.textContent || '').trim();
  }

  // Strategy 3: Fallback to raw innerText
  if (!text) {
    text = (last.innerText || last.textContent || '').trim();
  }

  const messageId = last.getAttribute('data-message-id') || null;
  return { text: text || null, messageId };
}

function isGenerating() {
  // ChatGPT thường hiện nút "Stop generating" hoặc nút stop khi đang tạo.
  const stopByTestId = document.querySelector('button[data-testid="stop-button"]');
  if (stopByTestId) return true;

  const stopByAria = document.querySelector('button[aria-label*="Stop"], button[aria-label*="Dừng"], button[title*="Stop"], button[title*="Dừng"]');
  if (stopByAria) return true;

  return false;
}

async function waitForStableAssistantResponse({ timeoutMs = 15 * 60 * 1000, stableMs = 1500 } = {}) {
  const start = Date.now();

  let lastText = null;
  let lastChangedAt = Date.now();

  const snapshot = () => {
    const { text } = getLatestAssistantMessageMeta();
    if (text && text !== lastText) {
      lastText = text;
      lastChangedAt = Date.now();
    }
  };

  snapshot();

  // Watch conversation mutations to detect streaming updates.
  const root = document.querySelector('main') || document.body;
  let observer = null;
  
  try {
    observer = new MutationObserver(() => snapshot());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  } catch (error) {
    console.warn('[Content] MutationObserver setup failed:', error);
  }

  try {
    while (Date.now() - start < timeoutMs) {
      snapshot();
      const stableFor = Date.now() - lastChangedAt;

      // Chỉ kết thúc khi: có text + ổn định đủ lâu + không còn generating.
      if (lastText && stableFor >= stableMs && !isGenerating()) {
        return { status: 'ok', text: lastText };
      }

      await sleep(250);
    }

    return { status: 'timeout', text: lastText };
  } finally {
    if (observer) {
      try {
        observer.disconnect();
      } catch (error) {
        console.warn('[Content] Observer disconnect failed:', error);
      }
    }
  }
}

// =============================================================================
// Option A: Auto-capture assistant response and notify background for persistence
// =============================================================================

const MAX_CAPTURE_PROMPT_CHARS = 50_000;
const MAX_CAPTURE_RESPONSE_CHARS = 100_000;

function truncateText(text, maxChars) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
}

async function waitForConversationToChange(beforeMsgCount, timeoutMs = 15000) {
  if (!Number.isFinite(beforeMsgCount)) return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = getConversationMessageCount();
    if (count > beforeMsgCount) return true;
    await sleep(200);
  }
  return false;
}

async function waitForNewAssistantMessage({ beforeMessageId, beforeText, timeoutMs = 30000 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const latest = getLatestAssistantMessageMeta();

    // If we can observe any change, we can proceed to stable capture.
    if (latest.messageId && beforeMessageId && latest.messageId !== beforeMessageId) {
      return latest;
    }
    if (latest.text && beforeText && latest.text !== beforeText) {
      return latest;
    }

    // If generating is detected, an assistant response is in progress.
    if (isGenerating()) {
      return latest;
    }

    await sleep(250);
  }

  return getLatestAssistantMessageMeta();
}

async function captureAndReportAssistantResponse(params) {
  const {
    runId,
    prompt,
    beforeAssistantMessageId = null,
    beforeAssistantText = null,
    beforeMsgCount = null,
    timeoutMs = 15 * 60 * 1000
  } = params || {};

  if (!runId || typeof runId !== 'string') return;

  const startedAt = Date.now();

  try {
    // Avoid capturing the "last message in the previous chat" immediately.
    await waitForConversationToChange(beforeMsgCount, 15000);

    // Ensure an assistant message has changed/started before we wait for stability.
    await waitForNewAssistantMessage({
      beforeMessageId: beforeAssistantMessageId,
      beforeText: beforeAssistantText,
      timeoutMs: 30000
    });

    const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs: 1500 });
    const latest = getLatestAssistantMessageMeta();
    const meta = getChatMeta();

    const responseText = truncateText(waited.text || latest.text || '', MAX_CAPTURE_RESPONSE_CHARS);
    const promptText = truncateText(prompt || '', MAX_CAPTURE_PROMPT_CHARS);

    // Always report capture status (even if response is null) so background can update metadata.
    const message = {
      v: 1,
      type: 'CONTENT_RESPONSE_CAPTURED',
      correlationId: `content-response-${runId}-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        runId,
        prompt: promptText,
        response: responseText,
        status: waited.status,
        assistantMessageId: latest.messageId || null,
        chatId: meta.chatId,
        chatUrl: meta.chatUrl,
        waitedMs: Date.now() - startedAt,
        capturedAt: Date.now()
      }
    };

    chrome.runtime.sendMessage(message).catch((err) => {
      console.warn('[Content] Failed to send CONTENT_RESPONSE_CAPTURED:', err?.message || err);
    });
  } catch (e) {
    console.warn('[Content] Auto-capture failed:', e?.message || e);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let responded = false;
  const safeSendResponse = (payload) => {
    if (responded) return;
    responded = true;
    try {
      sendResponse(payload);
    } catch {
      // ignore
    }
  };

  if (!request || typeof request.action !== 'string') {
    safeSendResponse({ status: 'error', error: 'invalid_request' });
    return true;
  }

  // X51LABS-156: IMPROVED PING HANDLER - Critical for content script detection
  // Must respond IMMEDIATELY with detailed status for background to detect if content script is loaded
  if (request.action === 'ping') {
    const response = {
      pong: true,
      status: 'ok',
      ready: true,
      // X51LABS-156: Additional diagnostics for troubleshooting
      contentScriptVersion: 1,
      markerSet: window.__ChatGPTAssistantReady === true,
      markerTimestamp: window.__ChatGPTAssistantReadyTimestamp || null,
      url: location.href,
      hostname: location.hostname,
      messageListenerReady: true
    };
    
    console.log('[Content] 📡 Ping received and responding:', response);
    safeSendResponse(response);
    return true; // Must return true to indicate async response
  }

  if (request.action === 'input_prompt') {
    const prompt = typeof request.prompt === 'string' ? request.prompt : '';
    const runId = typeof request.runId === 'string' ? request.runId : null;
    const createNewChat = request.newChat !== false;

    writePendingPrompt({ prompt, runId, queuedAt: Date.now(), createNewChat, startUrl: location.href });
    if (createNewChat) triggerNewChatNavigation();
    drainPendingPrompt({ timeoutMs: 30000 }).catch(() => {});

    let meta = {};
    try {
      meta = getChatMeta();
    } catch {
      // ignore
    }
    safeSendResponse({ status: 'accepted', runId, ...meta });
    return;
  }

  // New modular actions
  if (request.action === 'create_new_session') {
    console.log('[Content] Received create_new_session action');
    (async () => {
      try {
        const success = await ensureNewChatSession();
        const meta = getChatMeta();
        console.log('[Content] New session created, success:', success, 'meta:', meta);
        safeSendResponse({ success, ...meta });
      } catch (e) {
        console.error('[Content] create_new_session error:', e);
        safeSendResponse({ success: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (request.action === 'send_input') {
    console.log('[Content] Received send_input action, prompt length:', request.prompt?.length, 'reviewOnly:', request.reviewOnly);
    (async () => {
      try {
        const prompt = typeof request.prompt === 'string' ? request.prompt : '';
        const createNewChat = request.createNewChat !== false;
        const reviewOnly = request.reviewOnly === true;
        const runId = typeof request.runId === 'string' ? request.runId : null;

        // Baseline snapshot to prevent capturing the previous assistant message.
        const beforeAssistant = getLatestAssistantMessageMeta();
        const beforeMsgCount = getConversationMessageCount();

        // 🔍 DEBUG: Log before sending
        console.log('🔍 [Content] Before inputAndSendPrompt, URL:', location.href);
        
        const success = await inputAndSendPrompt(prompt, { createNewChat, reviewOnly });
        
        // 🔍 DEBUG: Log after sending
        console.log('🔍 [Content] After inputAndSendPrompt, success:', success, 'URL:', location.href);
        
        // ⏳ NEW: Wait for ChatGPT to update URL with new chat_id
        // ChatGPT updates the URL asynchronously after sending prompt
        // Give it up to 3 seconds to update
        let meta = getChatMeta();
        let retries = 0;
        const maxRetries = 6; // 6 * 500ms = 3 seconds
        
        while (!meta.chatId && retries < maxRetries) {
          console.log(`⏳ [Content] Waiting for chat_id (attempt ${retries + 1}/${maxRetries}), URL:`, location.href);
          await sleep(500);
          meta = getChatMeta();
          retries++;
        }
        
        if (meta.chatId) {
          console.log(`✅ [Content] Got chat_id after ${retries * 500}ms:`, meta.chatId);
        } else {
          console.warn(`⚠️ [Content] No chat_id after waiting, URL might not have updated:`, location.href);
        }
        
        const status = reviewOnly ? 'filled' : (success ? 'sent' : 'failed');
        
        // 🔍 DEBUG: Log final response
        console.log('🔍 [Content] send_input complete:', {
          status,
          chatId: meta.chatId,
          chatUrl: meta.chatUrl,
          success,
          waitedMs: retries * 500
        });
        
        safeSendResponse({ status, runId, ...meta });

        // Fire-and-forget: capture assistant response and notify background for persistence.
        // Only for real sends (not reviewOnly) and when we have a runId for correlation.
        if (!reviewOnly && success && runId) {
          captureAndReportAssistantResponse({
            runId,
            prompt,
            beforeAssistantMessageId: beforeAssistant.messageId,
            beforeAssistantText: beforeAssistant.text,
            beforeMsgCount,
            timeoutMs: 15 * 60 * 1000
          }).catch(() => {});
        }
      } catch (e) {
        console.error('[Content] send_input error:', e);
        safeSendResponse({ status: 'error', error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (request.action === 'get_output') {
    console.log('[Content] Received get_output action, wait:', request.wait);
    (async () => {
      try {
        const wait = request.wait !== false;
        const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 15 * 60 * 1000;
        const stableMs = Number.isFinite(request.stableMs) ? request.stableMs : 1500;

        const meta = getChatMeta();
        
        // 🔍 DEBUG: Log current state
        console.log('🔍 [Content] get_output state:', {
          wait,
          generating: isGenerating(),
          messageCount: getConversationMessageCount(),
          chatId: meta.chatId,
          chatUrl: meta.chatUrl
        });

        if (!wait) {
          const latest = getLatestAssistantMessageMeta();
          console.log('🔍 [Content] get_output (no wait), result length:', latest.text?.length || 0);
          safeSendResponse({ result: latest.text, assistantMessageId: latest.messageId, status: 'ok', ...meta });
          return;
        }

        console.log('🔍 [Content] Waiting for stable response...');
        const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
        const latest = getLatestAssistantMessageMeta();
        
        // 🔍 DEBUG: Log captured response
        console.log('🔍 [Content] Response captured:', {
          status: waited.status,
          resultLength: (waited.text || latest.text)?.length || 0,
          messageId: latest.messageId,
          preview: (waited.text || latest.text)?.substring(0, 100)
        });
        
        safeSendResponse({
          result: waited.text || latest.text,
          assistantMessageId: latest.messageId,
          status: waited.status,
          ...meta
        });
      } catch (e) {
        console.error('[Content] get_output error:', e);
        safeSendResponse({ status: 'error', error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (request.action === 'check_response_status') {
    try {
      const generating = isGenerating();
      const latest = getLatestAssistantMessageMeta();
      const hasContent = !!latest.text;
      const messageCount = getConversationMessageCount();

      safeSendResponse({
        ready: !generating && hasContent,
        generating,
        hasContent,
        messageCount
      });
    } catch (e) {
      safeSendResponse({ ready: false, generating: false, hasContent: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (request.action === 'get_chat_metadata') {
    try {
      const meta = getChatMeta();
      safeSendResponse(meta);
    } catch (e) {
      safeSendResponse({ chatId: null, chatUrl: null, error: String(e?.message || e) });
    }
    return true;
  }

  if (request.action === 'get_message_count') {
    try {
      const count = getConversationMessageCount();
      safeSendResponse({ count });
    } catch (e) {
      safeSendResponse({ count: 0, error: String(e?.message || e) });
    }
    return true;
  }

  // X51LABS-61: Get selector statistics for debugging
  if (request.action === 'get_selector_stats') {
    try {
      safeSendResponse({ success: true, stats: getSelectorStats() });
    } catch (e) {
      safeSendResponse({ success: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (request.action === 'clear_conversation') {
    try {
      triggerNewChatNavigation();
      safeSendResponse({ success: true });
    } catch (e) {
      safeSendResponse({ success: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (request.action === 'get_result') {
    (async () => {
      let meta = {};
      try {
        meta = getChatMeta();
      } catch {
        // ignore
      }

      const wait = !!request.wait;
      const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 15 * 60 * 1000;
      const stableMs = Number.isFinite(request.stableMs) ? request.stableMs : 1500;

      if (!wait) {
        const latest = getLatestAssistantMessageMeta();
        safeSendResponse({ status: 'ok', result: latest.text, assistantMessageId: latest.messageId, ...meta });
        return;
      }

      const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
      const latest = getLatestAssistantMessageMeta();
      safeSendResponse({
        status: waited.status,
        result: waited.text,
        assistantMessageId: latest.messageId,
        ...meta,
      });
    })().catch((e) => {
      console.error('content get_result error:', e);
      let meta = {};
      try {
        meta = getChatMeta();
      } catch {
        // ignore
      }
      safeSendResponse({ status: 'error', error: String(e && e.message ? e.message : e), ...meta });
    });
    return true;
  }

  // Unknown action
  safeSendResponse({ status: 'error', error: 'unknown_action', action: request.action });
  return true;
});
drainPendingPrompt({ timeoutMs: 30000 }).catch(() => {});

console.log('[ChatGPT Assistant] content script ready');
// ========== X51LABS-157: PROACTIVE READINESS SIGNALING ==========
// Send ready signal to background after message listener is registered
// This eliminates race condition by proactively notifying background
(async () => {
  try {
    // Wait 100ms for message listener to be fully registered
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Signal background that content script is ready for communication
    // ✅ FIXED: Add v (version) and correlationId to pass message validation
    chrome.runtime.sendMessage(
      {
        v: 1,  // ✅ Message version required by schema
        type: 'CONTENT_SCRIPT_READY',
        correlationId: `content-ready-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,  // ✅ Required by schema
        url: location.href,
        hostname: location.hostname,
        timestamp: Date.now(),
        markerSet: window.__ChatGPTAssistantReady
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Content] Ready signal failed:', chrome.runtime.lastError.message);
          return;
        }
        
        // Log successful acknowledgment with details
        console.log('[Content] ✅ Ready signal acknowledged by background', {
          success: response?.success,
          tabId: response?.tabId,
          registrySize: response?.registrySize
        });
      }
    );
  } catch (error) {
    // Graceful error handling - content script continues normally
    console.error('[Content] Ready signal error:', error.message);
  }
})();
