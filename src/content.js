// =============================================================================
// Content Script — Entry Point
// Runs on chatgpt.com. Registers message listener, drains pending prompts,
// and signals readiness to the background service worker.
//
// All domain logic lives in src/content/*.js modules:
//   utils.js         — sleep, getChatMeta, truncateText
//   selectors.js     — DOM selector chains, cache, stats
//   editor.js        — editor interaction, new-chat creation
//   output.js        — assistant message extraction, noise removal
//   pendingPrompt.js — sessionStorage prompt queue
//   capture.js       — auto-capture assistant response
//   actions.js       — message action dispatcher
// =============================================================================

import { initSelectorCache } from './content/selectors.js';
import { drainPendingPrompt } from './content/pendingPrompt.js';
import { handleMessage } from './content/actions.js';

// Lightweight inline logger (content scripts are classic scripts — can't import shared chunks)
const LOG_PREFIX = '[Content]';
const logger = {
  debug: (msg, data) => console.debug(LOG_PREFIX, msg, data || ''),
  info:  (msg, data) => console.log(LOG_PREFIX, msg, data || ''),
  warn:  (msg, data) => console.warn(LOG_PREFIX, msg, data || ''),
  error: (msg, data) => console.error(LOG_PREFIX, msg, data || ''),
};

logger.info('Content script loaded', { url: location.href, hostname: location.hostname });

// X51LABS-83: Detect and handle chatbot-ui.com redirect
if (location.hostname.includes('chatbot-ui.com')) {
  logger.warn('Detected chatbot-ui.com redirect - redirecting to chatgpt.com');
  try {
    location.replace('https://chatgpt.com/');
  } catch (error) {
    logger.error('Redirect to chatgpt.com failed', { error: error?.message });
  }
}

// X51LABS-156: Window marker for ping detection (SYNCHRONOUS, before any async)
window.__ChatGPTAssistantReady = true;
window.__ChatGPTAssistantReadyTimestamp = Date.now();
logger.debug('Window marker set for ping detection');

// Initialise selector cache from storage (non-blocking)
initSelectorCache();

// ===== Message listener =====
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  let responded = false;
  const safeSendResponse = (payload) => {
    if (responded) return;
    responded = true;
    try {
      sendResponse(payload);
    } catch {
      // ignore — port may be closed
    }
  };

  if (!request || typeof request.action !== 'string') {
    safeSendResponse({ status: 'error', error: 'invalid_request' });
    return true;
  }

  const isAsync = handleMessage(request, safeSendResponse);
  // Always return true to keep the message port open (safe for both sync & async).
  return true;
});

// Drain any pending prompt left from a prior navigation
drainPendingPrompt({ timeoutMs: 30000 }).catch(() => {});

logger.info('Content script ready');

// ========== X51LABS-157: PROACTIVE READINESS SIGNALING ==========
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 100));

    chrome.runtime.sendMessage(
      {
        v: 1,
        type: 'CONTENT_SCRIPT_READY',
        correlationId: `content-ready-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: location.href,
        hostname: location.hostname,
        timestamp: Date.now(),
        markerSet: window.__ChatGPTAssistantReady
      },
      (response) => {
        if (chrome.runtime.lastError) {
          logger.warn('Ready signal failed', { error: chrome.runtime.lastError.message });
          return;
        }
        logger.info('Ready signal acknowledged', {
          success: response?.success,
          tabId: response?.tabId,
          registrySize: response?.registrySize
        });
      }
    );
  } catch (error) {
    logger.error('Ready signal error', { error: error?.message });
  }
})();
