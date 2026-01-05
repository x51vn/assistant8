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

async function inputAndSendPrompt(prompt) {
  const editor = await waitForEditor();
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
  if (!request || typeof request.action !== 'string') return;

  if (request.action === 'input_prompt') {
    const prompt = typeof request.prompt === 'string' ? request.prompt : '';
    const runId = typeof request.runId === 'string' ? request.runId : null;
    inputAndSendPrompt(prompt).then((ok) => {
      // URL/chatId có thể đổi sau khi gửi; chờ nhẹ rồi đọc.
      setTimeout(() => {
        const meta = getChatMeta();
        sendResponse({ status: ok ? 'sent' : 'failed', runId, ...meta });
      }, 150);
    });
    return true;
  }

  if (request.action === 'get_result') {
    (async () => {
      const meta = getChatMeta();
      const wait = !!request.wait;
      const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 15 * 60 * 1000;
      const stableMs = Number.isFinite(request.stableMs) ? request.stableMs : 1500;

      if (!wait) {
        const latest = getLatestAssistantMessageMeta();
        sendResponse({ status: 'ok', result: latest.text, assistantMessageId: latest.messageId, ...meta });
        return;
      }

      const waited = await waitForStableAssistantResponse({ timeoutMs, stableMs });
      const latest = getLatestAssistantMessageMeta();
      sendResponse({
        status: waited.status,
        result: waited.text,
        assistantMessageId: latest.messageId,
        ...meta,
      });
    })();
    return true;
  }
});

console.log('[ChatGPT Assistant] content script ready');
