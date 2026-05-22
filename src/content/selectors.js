/**
 * @fileoverview Content Script — DOM Selector Engine
 *
 * Encapsulates all ChatGPT DOM selector logic:
 * - Selector chains with prioritised fallbacks (X51LABS-61)
 * - Selector cache in chrome.storage.local (survives reload)
 * - ChatGPT version detection
 * - Selector stats / telemetry
 *
 * Exports:
 *   findEditor()          → HTMLElement | null
 *   findNewChatButton()   → HTMLElement | null
 *   findSendButton()      → HTMLElement | null
 *   getConversationMessageCount() → number
 *   getSelectorStats()    → object
 *   detectChatGPTVersion() → string
 */

// ===== SELECTOR CHAINS =====

const SELECTOR_CHAINS = {
  editor: [
    { selector: '#prompt-textarea.ProseMirror[contenteditable="true"]', name: 'testid-prosemirror' },
    { selector: '#prompt-textarea[contenteditable="true"]', name: 'testid-editable' },
    { selector: 'div[data-id="root"] textarea', name: 'semantic-textarea' },
    { selector: 'main textarea', name: 'main-textarea' },
    { selector: 'textarea', name: 'generic-textarea' },
    { selector: '[contenteditable="true"]', name: 'generic-editable' }
  ],
  newChatButton: [
    { selector: 'a[data-testid="create-new-chat-button"]', name: 'testid-create-new' },
    { selector: 'a[data-sidebar-item="true"][href="/"]', name: 'sidebar-home-link' },
    { selector: 'nav a[href="/"]', name: 'nav-home-link' },
    { selector: 'a[href*="chatgpt.com/"]', name: 'domain-link' }
  ]
};

// ===== SELECTOR STATS =====

let selectorStats = {
  editor: { lastMatch: null, matchCount: {} },
  newChatButton: { lastMatch: null, matchCount: {} }
};

const SELECTOR_CACHE_KEY = 'x51labs_selector_cache_v1';

/** @private Load cached selector preference from storage */
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

/** @private Save selector stats to storage for recovery after reload */
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

/**
 * Detect ChatGPT version from page metadata.
 * @returns {string}
 */
export function detectChatGPTVersion() {
  try {
    const metaGenerator = document.querySelector('meta[name="generator"]')?.content;
    const nextData = document.getElementById('__NEXT_DATA__')?.textContent;

    let detectedVersion = 'unknown';

    if (metaGenerator) {
      detectedVersion = `meta:${metaGenerator}`;
    } else if (nextData) {
      try {
        const data = JSON.parse(nextData);
        if (data.buildId) {
          detectedVersion = `nextjs:${data.buildId.substring(0, 8)}`;
        }
      } catch {
        // Silent fail
      }
    }

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

// ===== CORE CHAIN RESOLVER =====

/**
 * @private Try a selector chain with optional cached preference.
 * @param {string} chainName
 * @param {Object|null} cachedSelectors
 * @returns {HTMLElement|null}
 */
function trySelectorsChain(chainName, cachedSelectors = null) {
  const chain = SELECTOR_CHAINS[chainName];
  if (!chain) {
    console.error(`[Content] Unknown selector chain: ${chainName}`);
    return null;
  }

  // Try cached selector first (fast path)
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
          saveSelectorStats();
          return element;
        }
      } catch (err) {
        console.warn(`[Content] Cached selector failed: ${cachedDef.selector}`, err);
      }
    }
  }

  // Full fallback chain scan
  for (const { selector, name } of chain) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        if (!selectorStats[chainName].matchCount[name]) {
          selectorStats[chainName].matchCount[name] = 0;
        }
        selectorStats[chainName].matchCount[name]++;
        selectorStats[chainName].lastMatch = name;
        console.log(`[Content] ✅ ${chainName} found via: ${name} (${selector})`);
        saveSelectorStats();
        return element;
      }
    } catch (err) {
      console.warn(`[Content] Selector failed: ${selector}`, err);
    }
  }

  console.warn(`[Content] ⚠️ No ${chainName} selector matched. Tried ${chain.length} selectors.`);
  return null;
}

// ===== CACHED SELECTORS (loaded once at init) =====

let cachedSelectors = null;

/** @internal Initialise the selector cache (called by entry‐point) */
export async function initSelectorCache() {
  try {
    cachedSelectors = await loadSelectorCache();
    console.log('[Content] Selector cache initialized:', cachedSelectors);
  } catch (err) {
    console.warn('[Content] Cache init failed (non-blocking):', err);
  }
}

// ===== PUBLIC API =====

/**
 * Find the ChatGPT prompt editor element.
 * @returns {HTMLElement|null}
 */
export function findEditor() {
  return trySelectorsChain('editor', cachedSelectors);
}

/**
 * Find the "new chat" button.
 * @returns {HTMLElement|null}
 */
export function findNewChatButton() {
  return trySelectorsChain('newChatButton', cachedSelectors);
}

/**
 * Find the send/submit button.
 * @returns {HTMLElement|null}
 */
export function findSendButton() {
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

/**
 * Count user + assistant messages in the current conversation.
 * @returns {number}
 */
export function getConversationMessageCount() {
  try {
    return document.querySelectorAll(
      'div[data-message-author-role="user"], div[data-message-author-role="assistant"]'
    ).length;
  } catch (error) {
    console.warn('[Content] getConversationMessageCount failed:', error);
    return 0;
  }
}

/**
 * Get selector stats and send telemetry to background.
 * @returns {Object}
 */
export function getSelectorStats() {
  const stats = {
    ...JSON.parse(JSON.stringify(selectorStats)),
    version: detectChatGPTVersion(),
    timestamp: Date.now()
  };

  // Fire-and-forget telemetry
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
