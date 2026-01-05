// Background Service Worker (MV3)
// Mục tiêu: ổn định, ít race condition, lưu lastResult để popup hiển thị nhanh.

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function enhancePromptWithJsonRequest(userPrompt) {
  if (!userPrompt || !userPrompt.trim()) return userPrompt;
  return userPrompt.trim() + '\n\nPlease respond ONLY with valid JSON in ```json\n...\n``` format.';
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
    await ensureContentScriptInjected(tabId);
    await delay(350);
    return await sendToTab(tabId, message);
  }
}

async function inputPrompt(prompt) {
  const tab = await ensureChatGPTTab();
  if (tab.id == null) throw new Error('No tab id');

  try {
    const enhancedPrompt = enhancePromptWithJsonRequest(prompt);
    const response = await sendToTabRobust(tab.id, { action: 'input_prompt', prompt: enhancedPrompt });
    await chrome.storage.local.set({ lastRunAt: Date.now(), lastPrompt: prompt, lastTabId: tab.id });

    // Schedule a poll to capture result even when popup is closed.
    await chrome.alarms.clear(ALARMS.POLL);
    chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 12000 });
    return response;
  } catch (error) {
    // content script might not be ready yet; retry once after short delay.
    await delay(1500);
    try {
      const enhancedPrompt = enhancePromptWithJsonRequest(prompt);
      const response = await sendToTabRobust(tab.id, { action: 'input_prompt', prompt: enhancedPrompt });
      await chrome.storage.local.set({ lastRunAt: Date.now(), lastPrompt: prompt, lastTabId: tab.id });
      await chrome.alarms.clear(ALARMS.POLL);
      chrome.alarms.create(ALARMS.POLL, { when: Date.now() + 12000 });
      return response;
    } catch (finalError) {
      // Keep the worker stable; let caller decide how to surface this.
      throw finalError;
    }
  }
}

async function fetchLatestResult() {
  const tabs = await queryChatGPTTabs();
  if (tabs.length === 0 || tabs[0].id == null) return null;

  try {
    const response = await sendToTabRobust(tabs[0].id, { action: 'get_result' });
    const resultText = response && typeof response.result === 'string' ? response.result : null;
    if (resultText) {
      await chrome.storage.local.set({ lastResult: resultText, lastResultAt: Date.now() });
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
    fetchLatestResult().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (!request || typeof request.action !== 'string') return;

    if (request.action === 'ensure_chatgpt_open') {
      await ensureChatGPTTab();
      sendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'send_prompt') {
      const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
      if (!prompt) {
        sendResponse({ status: 'error', error: 'missing_prompt' });
        return;
      }
      await inputPrompt(prompt);
      sendResponse({ status: 'ok' });
      return;
    }

    if (request.action === 'get_result') {
      const latest = await fetchLatestResult();
      if (latest) {
        sendResponse({ result: latest, source: 'live' });
        return;
      }

      const stored = await chrome.storage.local.get(['lastResult', 'lastResultAt']);
      sendResponse({ result: stored.lastResult || null, lastResultAt: stored.lastResultAt || null, source: 'cache' });
      return;
    }

    if (request.action === 'get_status') {
      const status = await chrome.storage.local.get(['lastRunAt', 'lastResultAt']);
      sendResponse({ status: 'ok', ...status });
    }
  })().catch((e) => {
    console.error('onMessage handler error:', e);
    try {
      sendResponse({ status: 'error', error: String(e && e.message ? e.message : e) });
    } catch {
      // ignore
    }
  });

  return true;
});
