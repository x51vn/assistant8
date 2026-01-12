// Background Service Worker (MV3)
// Mục tiêu: ổn định, ít race condition, lưu lastResult để popup hiển thị nhanh.

import { applyPromptTemplate } from './promptTemplate.js';
import * as ChatGPTSession from './chatgptSession.js';
import { loadAndRender } from './promptLoader.js';

const DEFAULTS = {
  prompt: '',
  autoRun: false,
  interval: 5,
  evaluatePrevious: false,
  reviewPrompt: false,
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
  console.log('[Background] saveChatHistory called, entry:', {
    chatId: entry.chatId,
    promptLength: entry.prompt?.length,
    responseLength: entry.response?.length,
    timestamp: entry.timestamp
  });
  const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
  const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
  history.unshift(entry);
  if (history.length > MAX_CHAT_HISTORY) history.length = MAX_CHAT_HISTORY;
  await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: history });
  console.log('[Background] Chat history saved, total items:', history.length);
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
  const settings = await chrome.storage.local.get(['prompt', 'autoRun', 'interval', 'evaluatePrevious', 'reviewPrompt']);
  return {
    prompt: typeof settings.prompt === 'string' ? settings.prompt : DEFAULTS.prompt,
    autoRun: !!settings.autoRun,
    interval: Number.isFinite(settings.interval) ? settings.interval : DEFAULTS.interval,
    evaluatePrevious: !!settings.evaluatePrevious,
    reviewPrompt: !!settings.reviewPrompt,
  };
}

async function ensureDefaults() {
  const existing = await chrome.storage.local.get(['prompt', 'autoRun', 'interval', 'evaluatePrevious', 'reviewPrompt']);
  const toSet = {};
  if (typeof existing.prompt !== 'string') toSet.prompt = DEFAULTS.prompt;
  if (typeof existing.autoRun !== 'boolean') toSet.autoRun = DEFAULTS.autoRun;
  if (!Number.isFinite(existing.interval)) toSet.interval = DEFAULTS.interval;
  if (typeof existing.evaluatePrevious !== 'boolean') toSet.evaluatePrevious = DEFAULTS.evaluatePrevious;
  if (typeof existing.reviewPrompt !== 'boolean') toSet.reviewPrompt = DEFAULTS.reviewPrompt;
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

async function buildEvaluationPrompt(currentPrompt, previousPrompt, previousResult) {
  // Fetch retrospective items to include in evaluation
  const stored = await chrome.storage.local.get([ERROR_LIST_KEY]);
  const retroItems = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
  
  // Build retrospective insights section
  let retrospectiveInsights = '';
  if (retroItems.length > 0) {
    // Get recent items (last 10)
    const recentItems = retroItems.slice(-10);
    
    retrospectiveInsights = '### Các điểm cần lưu ý từ Retrospective:\n\n';
    recentItems.forEach(item => {
      const typeLabels = { general: 'Chung', prompt: 'Prompt', response: 'Response', connection: 'Kết nối', timeout: 'Timeout' };
      const typeLabel = typeLabels[item.type] || 'Chung';
      const severityIcon = item.severity === 'high' || item.severity === 'critical' ? '❌ [QUAN TRỌNG]' : '⚠️';
      retrospectiveInsights += `${severityIcon} **${item.title}** (${typeLabel}): ${item.description}\n\n`;
    });
  } else {
    retrospectiveInsights = '(Chưa có retrospective insights. Hãy chạy phân tích retrospective để có thêm kinh nghiệm.)\n';
  }
  
  return await loadAndRender('evaluation', {
    currentPrompt,
    previousPrompt,
    previousResult,
    retrospectiveInsights
  });
}

async function buildRetrospectivePrompt(chatHistory, errors) {
  const recentHistory = chatHistory.slice(-5); // Last 5 runs
  const criticalErrors = errors.filter(e => e.severity === 'high' || e.severity === 'critical');
  const recentErrors = errors.slice(-10); // Last 10 errors
  
  // Build history items section
  let historyItems = '';
  recentHistory.forEach((item, idx) => {
    const promptStr = typeof item.prompt === 'string' ? item.prompt : String(item.prompt);
    const responseStr = typeof item.response === 'string' ? item.response : String(item.response);
    historyItems += `### Run ${idx + 1} (${new Date(item.timestamp).toLocaleString('vi-VN')})
**Prompt:** ${promptStr.substring(0, 200)}${promptStr.length > 200 ? '...' : ''}

**Response:** ${responseStr.substring(0, 300)}${responseStr.length > 300 ? '...' : ''}

`;
  });

  // Build critical errors section
  let criticalErrorsText = '';
  if (criticalErrors.length > 0) {
    criticalErrors.forEach(err => {
      criticalErrorsText += `- **${err.title}** (${err.severity}): ${err.description}\n`;
    });
  } else {
    criticalErrorsText = '(Không có lỗi nghiêm trọng)\n';
  }

  // Build recent errors section
  let recentErrorsText = '';
  recentErrors.forEach(err => {
    const descStr = typeof err.description === 'string' ? err.description : String(err.description);
    recentErrorsText += `- **${err.title}** (${err.severity}, ${err.type}): ${descStr.substring(0, 100)}${descStr.length > 100 ? '...' : ''}\n`;
  });

  return await loadAndRender('retrospective', {
    historyCount: recentHistory.length,
    historyItems,
    criticalErrorCount: criticalErrors.length,
    criticalErrors: criticalErrorsText,
    recentErrorCount: recentErrors.length,
    recentErrors: recentErrorsText
  });
}

async function inputPrompt(prompt, options = {}) {
  console.log('[Background] inputPrompt called with prompt length:', prompt.length);
  const skipHistory = options.skipHistory === true;
  const runId = makeRunId();
  const sentAt = Date.now();
  console.log('[Background] Created runId:', runId, 'skipHistory:', skipHistory);

  const tab = await ensureChatGPTTab();
  console.log('[Background] ChatGPT tab:', tab.id);
  if (tab.id == null) throw new Error('No tab id');

  // Check if we should append previous result
  const settings = await getSettings();
  console.log('[Background] Settings:', { evaluatePrevious: settings.evaluatePrevious, reviewPrompt: settings.reviewPrompt });
  let finalPrompt = prompt;
  
  if (settings.evaluatePrevious) {
    const stored = await chrome.storage.local.get(['lastResult', 'lastPrompt']);
    if (stored.lastResult && stored.lastResult.trim()) {
      // Build evaluation prompt with previous result
      finalPrompt = buildEvaluationPrompt(prompt, stored.lastPrompt || '', stored.lastResult);
    }
  }

  await chrome.storage.local.set({ lastRunId: runId, lastRunAt: sentAt, lastPrompt: finalPrompt, lastTabId: tab.id, skipHistory });
  await appendRun({
    runId,
    prompt: finalPrompt,
    sentAt,
    status: 'sending',
    tabId: tab.id,
    chatUrl: null,
    chatId: null,
    assistantMessageId: null,
    result: null,
    resultAt: null,
    skipHistory
  });

  try {
    const enhancedPrompt = await applyPromptTemplate(finalPrompt);
    
    // Use modular session management
    const sendResult = await ChatGPTSession.sendInput(tab.id, enhancedPrompt, { 
      createNewChat: true,
      runId: runId,
      reviewOnly: settings.reviewPrompt
    });

    if (sendResult.success) {
      const status = settings.reviewPrompt ? 'filled' : 'sent';
      await updateRun(runId, {
        status: status,
        chatUrl: sendResult.chatUrl || null,
        chatId: sendResult.chatId || null,
      });
      if (sendResult.chatUrl || sendResult.chatId) {
        await chrome.storage.local.set({ 
          lastChatUrl: sendResult.chatUrl || null, 
          lastChatId: sendResult.chatId || null 
        });
      }
    } else {
      await updateRun(runId, { status: 'failed', error: sendResult.error || 'unknown_error' });
    }

    // Only schedule poll if not review mode
    if (!settings.reviewPrompt) {
      await chrome.alarms.clear(ALARMS.POLL);
      chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 12000 });
    }
    return { status: 'ok', runId, reviewMode: settings.reviewPrompt, skipHistory };
  } catch (error) {
    console.error('[Background] First attempt failed:', error?.message);
    // Retry once after longer delay to allow page to fully load
    console.log('[Background] Retrying after 2s...');
    await delay(2000);
    try {
      const enhancedPrompt = await applyPromptTemplate(finalPrompt);
      console.log('[Background] Retry attempt - sending to tab', tab.id);
      const sendResult = await ChatGPTSession.sendInput(tab.id, enhancedPrompt, { 
        createNewChat: true,
        runId: runId,
        reviewOnly: settings.reviewPrompt
      });

      if (sendResult.success) {
        const status = settings.reviewPrompt ? 'filled' : 'sent';
        console.log('[Background] Retry successful, status:', status);
        await updateRun(runId, {
          status: status,
          chatUrl: sendResult.chatUrl || null,
          chatId: sendResult.chatId || null,
        });
        if (sendResult.chatUrl || sendResult.chatId) {
          await chrome.storage.local.set({ 
            lastChatUrl: sendResult.chatUrl || null, 
            lastChatId: sendResult.chatId || null 
          });
        }
      }

      if (!settings.reviewPrompt) {
        await chrome.alarms.clear(ALARMS.POLL);
        chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 12000 });
      }
      return { status: 'ok', runId, reviewMode: settings.reviewPrompt };
    } catch (finalError) {
      console.error('[Background] Retry failed:', finalError?.message);
      await updateRun(runId, { status: 'failed', error: String(finalError?.message || finalError) });
      throw finalError;
    }
  }
}

async function fetchLatestResult(runId) {
  const tabs = await queryChatGPTTabs();
  if (tabs.length === 0 || tabs[0].id == null) return null;

  try {
    // Use modular session management
    const outputResult = await ChatGPTSession.getOutput(tabs[0].id, {
      wait: true,
      timeoutMs: 15 * 60 * 1000,
      stableMs: 1500
    });
    
    const resultText = outputResult.success && outputResult.result ? outputResult.result : null;
    if (resultText) {
      await chrome.storage.local.set({ lastResult: resultText, lastResultAt: Date.now() });

      const chatId = outputResult.chatId || null;
      const patch = {
        result: resultText,
        resultAt: Date.now(),
        chatUrl: outputResult.chatUrl || null,
        chatId: chatId,
        assistantMessageId: outputResult.assistantMessageId || null,
        status: 'completed',
      };
      const effectiveRunId = runId || (await chrome.storage.local.get(['lastRunId'])).lastRunId;
      await updateRun(effectiveRunId, patch);
      await chrome.storage.local.set({
        lastChatUrl: outputResult.chatUrl || null,
        lastChatId: chatId,
        lastAssistantMessageId: outputResult.assistantMessageId || null,
      });

      // Save to chat history for future reference (skip if retrospective)
      if (chatId) {
        const runData = await chrome.storage.local.get(['lastPrompt', 'skipHistory']);
        const skipHistory = runData.skipHistory === true;
        
        if (!skipHistory) {
          await saveChatHistory({
            chatId: chatId,
            chatUrl: outputResult.chatUrl || null,
            prompt: runData.lastPrompt || '',
            response: resultText,
            timestamp: Date.now(),
            runId: effectiveRunId
          });
        } else {
          console.log('[Background] Skipping chat history save for retrospective/special query');
        }
      }
    } else {
      // Nếu chưa có kết quả ổn định (hoặc timeout), poll lại sau một chút.
      if (outputResult.status === 'timeout' || outputResult.status === 'generating' || outputResult.status === 'no_result') {
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
      try {
        await ensureChatGPTTab();
        safeSendResponse({ status: 'ok' });
      } catch (err) {
        console.error('ensure_chatgpt_open error:', err);
        safeSendResponse({ status: 'error', error: String(err?.message || err) });
      }
      return;
    }

    if (request.action === 'send_prompt') {
      const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
      console.log('[Background] Received send_prompt action, prompt length:', prompt.length);
      if (!prompt) {
        console.error('[Background] Missing prompt');
        safeSendResponse({ status: 'error', error: 'missing_prompt' });
        return;
      }
      try {
        console.log('[Background] Calling inputPrompt...');
        const r = await inputPrompt(prompt);
        console.log('[Background] inputPrompt result:', r);
        safeSendResponse({ status: 'ok', runId: r.runId, reviewMode: r.reviewMode });
      } catch (err) {
        console.error('[Background] send_prompt error:', err);
        safeSendResponse({ status: 'error', error: String(err?.message || err) });
      }
      return;
    }

    if (request.action === 'prompt_sent') {
      try {
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
      } catch (err) {
        console.error('prompt_sent error:', err);
        safeSendResponse({ status: 'error', error: String(err?.message || err) });
      }
      return;
    }

    if (request.action === 'get_result') {
      console.log('[Background] Received get_result action');
      try {
        const storedRun = await chrome.storage.local.get(['lastRunId']);
        console.log('[Background] Last runId:', storedRun.lastRunId);
        const latest = await fetchLatestResult(storedRun.lastRunId);
        if (latest) {
          console.log('[Background] Got live result, length:', latest.length);
          safeSendResponse({ result: latest, source: 'live', runId: storedRun.lastRunId || null });
          return;
        }

        console.log('[Background] No live result, returning cached');
        const stored = await chrome.storage.local.get(['lastResult', 'lastResultAt']);
        safeSendResponse({ result: stored.lastResult || null, lastResultAt: stored.lastResultAt || null, source: 'cache' });
      } catch (err) {
        console.error('[Background] get_result error:', err);
        // Still return cached result even if fetch fails
        const stored = await chrome.storage.local.get(['lastResult', 'lastResultAt']);
        safeSendResponse({ result: stored.lastResult || null, lastResultAt: stored.lastResultAt || null, source: 'cache', error: String(err?.message || err) });
      }
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

    if (request.action === 'clear_chat_history') {
      console.log('[Background] Clearing chat history');
      await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: [] });
      safeSendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'open_chat_url') {
      const chatId = typeof request.chatId === 'string' ? request.chatId : null;
      const chatUrl = typeof request.chatUrl === 'string' ? request.chatUrl : null;
      
      console.log('[Background] Opening chat:', { chatId, chatUrl });
      
      // Construct URL
      let url = chatUrl;
      if (!url && chatId) {
        url = `https://chatgpt.com/c/${chatId}`;
      }
      if (!url) {
        safeSendResponse({ status: 'error', error: 'missing_url_or_chatId' });
        return;
      }
      
      try {
        // Check if there's already a ChatGPT tab
        const tabs = await queryChatGPTTabs();
        if (tabs.length > 0 && tabs[0].id != null) {
          // Navigate existing tab
          await chrome.tabs.update(tabs[0].id, { url, active: true });
          safeSendResponse({ status: 'ok', tabId: tabs[0].id });
        } else {
          // Create new tab
          const newTab = await chrome.tabs.create({ url, active: true });
          safeSendResponse({ status: 'ok', tabId: newTab.id });
        }
      } catch (err) {
        console.error('[Background] open_chat_url error:', err);
        safeSendResponse({ status: 'error', error: String(err?.message || err) });
      }
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

    if (request.action === 'clear_errors') {
      console.log('[Background] Clearing all errors');
      await chrome.storage.local.set({ [ERROR_LIST_KEY]: [] });
      safeSendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'run_retrospective') {
      try {
        // Get chat history and retrospective items
        const stored = await chrome.storage.local.get([CHAT_HISTORY_KEY, ERROR_LIST_KEY]);
        const history = Array.isArray(stored[CHAT_HISTORY_KEY]) ? stored[CHAT_HISTORY_KEY] : [];
        const errors = Array.isArray(stored[ERROR_LIST_KEY]) ? stored[ERROR_LIST_KEY] : [];
        
        // Build retrospective prompt from history + items
        const prompt = await buildRetrospectivePrompt(history, errors);
        
        // Send to ChatGPT with skipHistory flag
        const result = await inputPrompt(prompt, { skipHistory: true });
        
        safeSendResponse({ status: 'ok', runId: result.runId });
      } catch (err) {
        console.error('run_retrospective error:', err);
        safeSendResponse({ status: 'error', error: String(err?.message || err) });
      }
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
