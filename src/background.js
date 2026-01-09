// Background Service Worker (MV3)
// Mục tiêu: ổn định, ít race condition, lưu lastResult để popup hiển thị nhanh.

import { applyPromptTemplate } from './promptTemplate.js';

const DEFAULTS = {
  prompt: '',
  autoRun: false,
  interval: 5,
};

const ALARMS = {
  CHECK: 'checkChatGPT',
  AUTORUN: 'autoRunPrompt',
  POLL: 'pollResult',
};

const RUNS_KEY = 'runs';
const MAX_RUNS = 50;
const CHAT_HISTORY_KEY = 'chatHistory';
const MAX_CHAT_HISTORY = 100;
const ERROR_LIST_KEY = 'errorList';
const MAX_ERRORS = 50;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRunId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // ignore
  }
  return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function appendRun(run) {
  const stored = await chrome.storage.local.get([RUNS_KEY]);
  const runs = Array.isArray(stored[RUNS_KEY]) ? stored[RUNS_KEY] : [];
  runs.unshift(run);
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
  await chrome.storage.local.set({ [RUNS_KEY]: runs });
}

async function updateRun(runId, patch) {
  if (!runId) return;
  const stored = await chrome.storage.local.get([RUNS_KEY]);
  const runs = Array.isArray(stored[RUNS_KEY]) ? stored[RUNS_KEY] : [];
  const idx = runs.findIndex((r) => r && r.runId === runId);
  if (idx === -1) return;
  runs[idx] = { ...runs[idx], ...patch };
  await chrome.storage.local.set({ [RUNS_KEY]: runs });
}

async function saveChatHistory(entry) {
  const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
  const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
  history.unshift(entry);
  if (history.length > MAX_CHAT_HISTORY) history.length = MAX_CHAT_HISTORY;
  await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: history });
}

async function addError(error) {
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  const errorEntry = {
    id: makeRunId(),
    timestamp: Date.now(),
    ...error
  };
  errors.unshift(errorEntry);
  if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS;
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: errors });
  return errorEntry;
}

async function updateError(errorId, updates) {
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  const idx = errors.findIndex((e) => e && e.id === errorId);
  if (idx === -1) return null;
  errors[idx] = { ...errors[idx], ...updates, updatedAt: Date.now() };
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: errors });
  return errors[idx];
}

async function deleteError(errorId) {
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  const filtered = errors.filter((e) => e && e.id !== errorId);
  await chrome.storage.local.set({ [ERROR_LIST_KEY]: filtered });
  return true;
}

async function getErrors() {
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  return Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
}

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function getSettings() {
  const settings = await chrome.storage.local.get(['prompt', 'autoRun', 'interval']);
  return {
    prompt: typeof settings.prompt === 'string' ? settings.prompt : DEFAULTS.prompt,
    autoRun: !!settings.autoRun,
    interval: Number.isFinite(settings.interval) ? settings.interval : DEFAULTS.interval,
  };
}

async function ensureDefaults() {
  const existing = await chrome.storage.local.get(['prompt', 'autoRun', 'interval']);
  const toSet = {};
  if (typeof existing.prompt !== 'string') toSet.prompt = DEFAULTS.prompt;
  if (typeof existing.autoRun !== 'boolean') toSet.autoRun = DEFAULTS.autoRun;
  if (!Number.isFinite(existing.interval)) toSet.interval = DEFAULTS.interval;
  if (Object.keys(toSet).length) await chrome.storage.local.set(toSet);
}

async function queryChatGPTTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => {
    const url = t.url || '';
    return url.startsWith('https://chatgpt.com/');
  });
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.status === 'complete') return;
    await delay(250);
  }
  throw new Error(`Tab ${tabId} not ready`);
}

async function ensureChatGPTTab() {
  const targetUrl = 'https://chatgpt.com/';
  const tabs = await queryChatGPTTabs();
  if (tabs.length > 0) {
    const tab = tabs[0];
    if (tab.id != null) {
      try {
        await withTimeout(waitForTabComplete(tab.id), 20000, 'waitForTabComplete');
      } catch {
        // ignore; we'll still try sending message
      }
    }
    return tab;
  }

  const created = await chrome.tabs.create({ url: targetUrl, active: false });
  if (created.id != null) {
    try {
      await withTimeout(waitForTabComplete(created.id), 20000, 'waitForTabComplete');
    } catch {
      // ignore
    }
  }
  return created;
}

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function ensureContentScriptInjected(tabId) {
  try {
    // If it's already injected, this will just execute again (safe).
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch {
    // ignore; injection can fail on non-http(s) pages
  }
}

function isNoReceiverError(error) {
  const msg = String(error && error.message ? error.message : error);
  return msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist');
}

async function sendToTabRobust(tabId, message) {
  try {
    return await sendToTab(tabId, message);
  } catch (error) {
    if (!isNoReceiverError(error)) throw error;
    // Content script not ready/injected yet → inject and retry once.
    console.log(`[sendToTabRobust] No receiver on tab ${tabId}, injecting content script...`);
    await ensureContentScriptInjected(tabId);
    await delay(350);
    console.log(`[sendToTabRobust] Retrying message to tab ${tabId}`);
    return await sendToTab(tabId, message);
  }
}

async function inputPrompt(prompt) {
  const runId = makeRunId();
  const sentAt = Date.now();

  const tab = await ensureChatGPTTab();
  if (tab.id == null) throw new Error('No tab id');

  await chrome.storage.local.set({ lastRunId: runId, lastRunAt: sentAt, lastPrompt: prompt, lastTabId: tab.id });
  await appendRun({
    runId,
    prompt,
    sentAt,
    status: 'sending',
    tabId: tab.id,
    chatUrl: null,
    chatId: null,
    assistantMessageId: null,
    result: null,
    resultAt: null,
  });

  try {
    const enhancedPrompt = await applyPromptTemplate(prompt);
    const response = await sendToTabRobust(tab.id, { action: 'input_prompt', prompt: enhancedPrompt, runId });

    // content.js trả về meta (chatUrl/chatId)
    if (response && typeof response === 'object') {
      const ok = response.status === 'sent' || response.status === 'accepted';
      await updateRun(runId, {
        status: ok ? 'sent' : 'failed',
        chatUrl: response.chatUrl || null,
        chatId: response.chatId || null,
      });
      if (response.chatUrl || response.chatId) {
        await chrome.storage.local.set({ lastChatUrl: response.chatUrl || null, lastChatId: response.chatId || null });
      }
    } else {
      await updateRun(runId, { status: 'sent' });
    }

    // Schedule a poll to capture result even when popup is closed.
    await chrome.alarms.clear(ALARMS.POLL);
    chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 12000 });
    return { status: 'ok', runId };
  } catch (error) {
    // content script might not be ready yet; retry once after short delay.
    await delay(1500);
    try {
      const enhancedPrompt = await applyPromptTemplate(prompt);
      const response = await sendToTabRobust(tab.id, { action: 'input_prompt', prompt: enhancedPrompt, runId });

      if (response && typeof response === 'object') {
        const ok = response.status === 'sent' || response.status === 'accepted';
        await updateRun(runId, {
          status: ok ? 'sent' : 'failed',
          chatUrl: response.chatUrl || null,
          chatId: response.chatId || null,
        });
        if (response.chatUrl || response.chatId) {
          await chrome.storage.local.set({ lastChatUrl: response.chatUrl || null, lastChatId: response.chatId || null });
        }
      } else {
        await updateRun(runId, { status: 'sent' });
      }

      await chrome.alarms.clear(ALARMS.POLL);
      chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 12000 });
      return { status: 'ok', runId };
    } catch (finalError) {
      // Keep the worker stable; let caller decide how to surface this.
      await updateRun(runId, { status: 'failed', error: String(finalError?.message || finalError) });
      throw finalError;
    }
  }
}

async function fetchLatestResult(runId) {
  const tabs = await queryChatGPTTabs();
  if (tabs.length === 0 || tabs[0].id == null) return null;

  try {
    const response = await sendToTabRobust(tabs[0].id, {
      action: 'get_result',
      wait: true,
      timeoutMs: 15 * 60 * 1000,
      stableMs: 1500,
    });
    const resultText = response && typeof response.result === 'string' ? response.result : null;
    if (resultText) {
      await chrome.storage.local.set({ lastResult: resultText, lastResultAt: Date.now() });

      if (response && typeof response === 'object') {
        const chatId = response.chatId || null;
        const patch = {
          result: resultText,
          resultAt: Date.now(),
          chatUrl: response.chatUrl || null,
          chatId: chatId,
          assistantMessageId: response.assistantMessageId || null,
          status: 'completed',
        };
        const effectiveRunId = runId || (await chrome.storage.local.get(['lastRunId'])).lastRunId;
        await updateRun(effectiveRunId, patch);
        await chrome.storage.local.set({
          lastChatUrl: response.chatUrl || null,
          lastChatId: chatId,
          lastAssistantMessageId: response.assistantMessageId || null,
        });

        // Save to chat history for future reference
        if (chatId) {
          const runData = await chrome.storage.local.get(['lastPrompt']);
          await saveChatHistory({
            chatId: chatId,
            chatUrl: response.chatUrl || null,
            prompt: runData.lastPrompt || '',
            response: resultText,
            timestamp: Date.now(),
            runId: effectiveRunId
          });
        }
      }
    } else {
      // Nếu chưa có kết quả ổn định (hoặc timeout), poll lại sau một chút.
      if (response && typeof response === 'object' && (response.status === 'timeout' || response.status === 'generating')) {
        await chrome.alarms.clear(ALARMS.POLL);
        chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 8000 });
      }
    }
    return resultText;
  } catch {
    return null;
  }
}

async function setupCheckAlarm() {
  await chrome.alarms.clear(ALARMS.CHECK);
  chrome.alarms.create(ALARMS.CHECK, { periodInMinutes: 5 });
}

async function setupAutoRunAlarm() {
  const { autoRun, interval, prompt } = await getSettings();
  await chrome.alarms.clear(ALARMS.AUTORUN);

  if (autoRun && Number.isFinite(interval) && interval > 0 && prompt && prompt.trim()) {
    chrome.alarms.create(ALARMS.AUTORUN, { periodInMinutes: interval });
  }
}

async function onBoot() {
  await ensureDefaults();
  await setupCheckAlarm();
  await setupAutoRunAlarm();
  await ensureChatGPTTab();

  // Side Panel behavior (Chrome 114+)
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch {
    // ignore
  }
}

chrome.runtime.onInstalled.addListener(() => {
  onBoot().catch((e) => console.error('onInstalled boot error:', e));
});

chrome.runtime.onStartup.addListener(() => {
  onBoot().catch((e) => console.error('onStartup boot error:', e));
});

// Fallback: if openPanelOnActionClick is not supported, try to open explicitly.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || tab.id == null) return;
    if (!chrome.sidePanel) return;

    if (chrome.sidePanel.setOptions) {
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
    }
    if (chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch {
    // ignore
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.autoRun || changes.interval || changes.prompt) {
    setupAutoRunAlarm().catch((e) => console.error('setupAutoRunAlarm error:', e));
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARMS.CHECK) {
    ensureChatGPTTab().catch(() => {});
    return;
  }

  if (alarm.name === ALARMS.AUTORUN) {
    getSettings()
      .then(({ prompt }) => {
        if (prompt && prompt.trim()) return inputPrompt(prompt.trim());
      })
      .catch((e) => console.error('autorun error:', e));
    return;
  }

  if (alarm.name === ALARMS.POLL) {
    chrome.storage.local.get(['lastRunId']).then((s) => fetchLatestResult(s.lastRunId).catch(() => {}));
  }
});

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

  (async () => {
    if (!request || typeof request.action !== 'string') {
      safeSendResponse({ status: 'error', error: 'invalid_request' });
      return;
    }

    if (request.action === 'ensure_chatgpt_open') {
      await ensureChatGPTTab();
      safeSendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'send_prompt') {
      const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
      if (!prompt) {
        safeSendResponse({ status: 'error', error: 'missing_prompt' });
        return;
      }
      const r = await inputPrompt(prompt);
      safeSendResponse({ status: 'ok', runId: r.runId });
      return;
    }

    if (request.action === 'prompt_sent') {
      const runId = typeof request.runId === 'string' ? request.runId : null;
      const chatUrl = typeof request.chatUrl === 'string' ? request.chatUrl : null;
      const chatId = typeof request.chatId === 'string' ? request.chatId : null;

      if (runId) {
        await updateRun(runId, { status: 'sent', chatUrl, chatId });
      }

      if (chatUrl || chatId) {
        await chrome.storage.local.set({ lastChatUrl: chatUrl || null, lastChatId: chatId || null });
      }

      safeSendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'get_result') {
      const storedRun = await chrome.storage.local.get(['lastRunId']);
      const latest = await fetchLatestResult(storedRun.lastRunId);
      if (latest) {
        safeSendResponse({ result: latest, source: 'live', runId: storedRun.lastRunId || null });
        return;
      }

      const stored = await chrome.storage.local.get(['lastResult', 'lastResultAt']);
      safeSendResponse({ result: stored.lastResult || null, lastResultAt: stored.lastResultAt || null, source: 'cache' });
      return;
    }

    if (request.action === 'get_runs') {
      const stored = await chrome.storage.local.get([RUNS_KEY]);
      const runs = Array.isArray(stored[RUNS_KEY]) ? stored[RUNS_KEY] : [];
      safeSendResponse({ status: 'ok', runs });
      return;
    }

    if (request.action === 'get_status') {
      const status = await chrome.storage.local.get(['lastRunAt', 'lastResultAt']);
      safeSendResponse({ status: 'ok', ...status });
      return;
    }

    if (request.action === 'get_chat_history') {
      const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
      const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
      safeSendResponse({ status: 'ok', history });
      return;
    }

    if (request.action === 'get_chat_by_id') {
      const chatId = typeof request.chatId === 'string' ? request.chatId : null;
      if (!chatId) {
        safeSendResponse({ status: 'error', error: 'missing_chat_id' });
        return;
      }
      const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
      const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
      const chat = history.find(c => c.chatId === chatId);
      safeSendResponse({ status: 'ok', chat: chat || null });
      return;
    }

    if (request.action === 'add_error') {
      const errorData = {
        title: typeof request.title === 'string' ? request.title : 'Lỗi không xác định',
        description: typeof request.description === 'string' ? request.description : '',
        type: typeof request.type === 'string' ? request.type : 'general',
        severity: typeof request.severity === 'string' ? request.severity : 'medium'
      };
      const error = await addError(errorData);
      safeSendResponse({ status: 'ok', error });
      return;
    }

    if (request.action === 'update_error') {
      const errorId = typeof request.errorId === 'string' ? request.errorId : null;
      if (!errorId) {
        safeSendResponse({ status: 'error', error: 'missing_error_id' });
        return;
      }
      const updates = {
        title: request.title,
        description: request.description,
        type: request.type,
        severity: request.severity
      };
      const updated = await updateError(errorId, updates);
      safeSendResponse({ status: 'ok', error: updated });
      return;
    }

    if (request.action === 'delete_error') {
      const errorId = typeof request.errorId === 'string' ? request.errorId : null;
      if (!errorId) {
        safeSendResponse({ status: 'error', error: 'missing_error_id' });
        return;
      }
      await deleteError(errorId);
      safeSendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'get_errors') {
      const errors = await getErrors();
      safeSendResponse({ status: 'ok', errors });
      return;
    }

    if (request.action === 'prompt_failed') {
      const runId = typeof request.runId === 'string' ? request.runId : null;
      const error = typeof request.error === 'string' ? request.error : 'unknown_error';
      if (runId) {
        await updateRun(runId, { status: 'failed', error });
      }
      safeSendResponse({ status: 'ok' });
      return;
    }

    safeSendResponse({ status: 'error', error: 'unknown_action', action: request.action });
  })().catch((e) => {
    console.error('onMessage handler error:', e);
    safeSendResponse({ status: 'error', error: String(e && e.message ? e.message : e) });
  });

  return true;
});
