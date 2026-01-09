// Content Script - chạy trên ChatGPT

console.log('[ChatGPT Assistant] content script loaded');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChatMeta() {
  const chatUrl = location.href;
  const path = location.pathname || '';
  const match = path.match(/\/c\/([^/?#]+)/);
  const chatId = match ? match[1] : null;
  return { chatUrl, chatId };
}

function findEditor() {
  // ChatGPT hiện tại dùng ProseMirror
  return (
    document.querySelector('#prompt-textarea.ProseMirror[contenteditable="true"]') ||
    document.querySelector('#prompt-textarea[contenteditable="true"]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]')
  );
}

function findNewChatButton() {
  return (
    document.querySelector('a[data-testid="create-new-chat-button"]') ||
    document.querySelector('a[data-sidebar-item="true"][href="/"]')
  );
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

function getConversationMessageCount() {
  // In an empty/new chat, there should be no user/assistant messages.
  return document.querySelectorAll('div[data-message-author-role="user"], div[data-message-author-role="assistant"]').length;
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

async function ensureNewChatSession(timeoutMs = 15000) {
  // Always try to start a fresh chat; if already on new-chat screen, this is a no-op.
  const startUrl = location.href;
  const btn = findNewChatButton();

  if (btn instanceof HTMLElement) {
    btn.click();
  } else {
    // Fallback: navigate to home which typically starts a new chat.
    try {
      location.assign('https://chatgpt.com/');
    } catch {
      // ignore
    }
  }

  // Wait for navigation (if any) and editor to re-appear.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const editor = findEditor();
    if (editor) {
      // Ensure we are not still on the old chat URL.
      if (location.href !== startUrl || !location.pathname.startsWith('/c/')) {
        return true;
      }
    }
    await sleep(200);
  }

  // Even if URL didn't change (UI variations), proceed if editor exists.
  return !!findEditor();
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
  const editorTimeoutMs = Number.isFinite(options.editorTimeoutMs) ? options.editorTimeoutMs : 20000;
  if (createNewChat) {
    await ensureNewChatSession();
    await sleep(300);
  }

  const editor = await waitForEditor(editorTimeoutMs);
  if (!editor) {
    console.warn('[ChatGPT Assistant] editor not found');
    return false;
  }

  editor.focus();
  const isContentEditable = !(editor instanceof HTMLTextAreaElement);

  if (isContentEditable) {
    // ProseMirror: execCommand thường khiến app nhận text tốt hơn DOM set thuần.
    try {
      // Clear existing content
      editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', ctrlKey: true }));
      editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a', ctrlKey: true }));
      document.execCommand('selectAll');
      document.execCommand('delete');
      document.execCommand('insertText', false, prompt);
    } catch {
      setNativeValue(editor, prompt);
    }

    // Trigger events để UI enable nút gửi.
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    setNativeValue(editor, prompt);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await sleep(300);

  const sendBtn = findSendButton();
  if (sendBtn) {
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
    chrome.runtime.sendMessage({ action: 'prompt_sent', runId: pending.runId || null, ...meta });
  } catch {
    // ignore
  }

  return true;
}

async function drainPendingPrompt({ timeoutMs = 30000 } = {}) {
  const start = Date.now();
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
        action: 'prompt_failed',
        runId: pending.runId,
        error: 'timeout_sending_prompt',
      });
    } catch {
      // ignore
    }
    clearPendingPrompt();
  }
}

function getLatestAssistantMessage() {
  const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (!nodes || nodes.length === 0) return null;
  const last = nodes[nodes.length - 1];
  const text = (last.innerText || last.textContent || '').trim();
  return text || null;
}

function getLatestAssistantMessageMeta() {
  const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (!nodes || nodes.length === 0) return { text: null, messageId: null };
  const last = nodes[nodes.length - 1];
  const text = (last.innerText || last.textContent || '').trim() || null;
  const messageId = last.getAttribute('data-message-id') || null;
  return { text, messageId };
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
  let observer;
  try {
    observer = new MutationObserver(() => snapshot());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  } catch {
    // ignore
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
    try {
      observer?.disconnect();
    } catch {
      // ignore
    }
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
    (async () => {
      try {
        const success = await ensureNewChatSession();
        const meta = getChatMeta();
        safeSendResponse({ success, ...meta });
      } catch (e) {
        safeSendResponse({ success: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (request.action === 'send_input') {
    (async () => {
      try {
        const prompt = typeof request.prompt === 'string' ? request.prompt : '';
        const createNewChat = request.createNewChat !== false;
        const runId = typeof request.runId === 'string' ? request.runId : null;

        const success = await inputAndSendPrompt(prompt, { createNewChat });
        const meta = getChatMeta();
        safeSendResponse({ status: success ? 'sent' : 'failed', runId, ...meta });
      } catch (e) {
        safeSendResponse({ status: 'error', error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (request.action === 'get_output') {
    (async () => {
      try {
        const wait = request.wait !== false;
        const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 15 * 60 * 1000;
        const stableMs = Number.isFinite(request.stableMs) ? request.stableMs : 1500;

        const meta = getChatMeta();

        if (!wait) {
          const latest = getLatestAssistantMessageMeta();
          safeSendResponse({ result: latest.text, assistantMessageId: latest.messageId, status: 'ok', ...meta });
          return;
        }

        const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
        const latest = getLatestAssistantMessageMeta();
        safeSendResponse({
          result: waited.text || latest.text,
          assistantMessageId: latest.messageId,
          status: waited.status,
          ...meta
        });
      } catch (e) {
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
