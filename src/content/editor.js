/**
 * @fileoverview Content Script — Editor Interaction
 *
 * DOM manipulation helpers for the ChatGPT prompt editor:
 * - Ensure a fresh chat session (navigate + wait)
 * - Wait for the editor to appear
 * - Insert text (ProseMirror / textarea)
 * - Find & click the send button
 *
 * Exports:
 *   ensureNewChatSession(timeoutMs) → boolean
 *   waitForEditor(timeoutMs)       → HTMLElement | null
 *   inputAndSendPrompt(prompt, options) → boolean
 *   triggerNewChatNavigation()      → void
 *   setNativeValue(el, value)       → void
 */

import { sleep } from '../shared/utils.js';
import { findEditor, findNewChatButton, getConversationMessageCount, findSendButton } from './selectors.js';

/**
 * Navigate to a new chat via button click or URL fallback.
 */
export function triggerNewChatNavigation() {
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

/**
 * Wait until a blank new-chat page is ready.
 * @param {{ startUrl?: string, timeoutMs?: number }} options
 * @returns {Promise<boolean>}
 */
export async function waitForEmptyNewChat({ startUrl, timeoutMs = 20000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const editor = findEditor();
    const msgCount = getConversationMessageCount();
    const urlChanged = typeof startUrl === 'string' ? location.href !== startUrl : true;

    if (editor && msgCount === 0 && (urlChanged || !location.pathname.startsWith('/c/'))) {
      return true;
    }

    await sleep(200);
  }
  return false;
}

/**
 * X51LABS-65 / X51LABS-76: Create a new chat session and wait
 * until the editor is visible with zero messages.
 * @param {number} [timeoutMs=20000]
 * @returns {Promise<boolean>}
 */
export async function ensureNewChatSession(timeoutMs = 20000) {
  const startUrl = location.href;
  const btn = findNewChatButton();

  if (btn instanceof HTMLElement) {
    console.log('[Content] Clicking new chat button');
    btn.click();
  } else {
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
  const effectiveTimeout = 30000;

  while (Date.now() - start < effectiveTimeout) {
    attempts++;
    const editor = findEditor();
    const currentMsgCount = getConversationMessageCount();
    const urlChanged = location.href !== startUrl;

    // Allow success when:
    // 1. Editor visible + URL changed + no messages (navigated to new chat)
    // 2. Editor visible + already on home (/) + no messages (was already on empty chat page)
    const isOnHomePage = location.pathname === '/' || location.pathname === '';
    if (editor && currentMsgCount === 0 && (urlChanged || isOnHomePage)) {
      console.log(`[Content] ✅ New chat session ready after ${attempts} attempts (${Date.now() - start}ms)`);
      return true;
    }

    if (attempts % 5 === 0) {
      console.log(`[Content] ⏳ Waiting for new chat... attempt ${attempts}, msgCount=${currentMsgCount}, urlChanged=${urlChanged}`);
    }

    if (attempts >= maxAttempts) {
      const backoffDelay = Math.min(300 * Math.pow(2, attempts - maxAttempts), 2000);
      await sleep(backoffDelay);
    } else {
      await sleep(300);
    }
  }

  console.error('[Content] ❌ Timeout after 30s: urlChanged or msgCount != 0');
  return false;
}

/**
 * Poll until the editor element appears.
 * @param {number} [timeoutMs=20000]
 * @returns {Promise<HTMLElement|null>}
 */
export async function waitForEditor(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = findEditor();
    if (el) return el;
    await sleep(200);
  }
  return null;
}

/**
 * Set element value natively (textarea) or via innerHTML (contenteditable).
 * @param {HTMLElement} el
 * @param {string} value
 */
function setNativeValue(el, value) {
  if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    return;
  }

  // contenteditable / ProseMirror
  el.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = value;
  el.appendChild(p);
}

/**
 * Insert a prompt into the editor and click send (or stop at "review" mode).
 *
 * @param {string} prompt
 * @param {{ createNewChat?: boolean, reviewOnly?: boolean, editorTimeoutMs?: number }} options
 * @returns {Promise<boolean>}
 */
export async function inputAndSendPrompt(prompt, options = {}) {
  const createNewChat = options.createNewChat !== false;
  const reviewOnly = options.reviewOnly === true;
  const editorTimeoutMs = Number.isFinite(options.editorTimeoutMs) ? options.editorTimeoutMs : 25000;

  if (createNewChat) {
    await ensureNewChatSession();
    await sleep(500);
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
    const chunkSize = 200;
    const chunks = [];
    for (let i = 0; i < prompt.length; i += chunkSize) {
      chunks.push(prompt.substring(i, i + chunkSize));
    }

    console.log(`[Content] Inserting prompt in ${chunks.length} chunks of ~${chunkSize} chars`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        document.execCommand('insertText', false, chunks[i]);
      } catch {
        const currentText = editor.textContent || '';
        setNativeValue(editor, currentText + chunks[i]);
      }

      if (i < chunks.length - 1 && chunks.length > 5) {
        await sleep(50);
      }
    }

    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    setNativeValue(editor, prompt);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await sleep(500);

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
