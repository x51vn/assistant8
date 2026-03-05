/**
 * @fileoverview Safe broadcast helper for MV3 background → UI messaging
 *
 * In Chrome MV3, `chrome.runtime.sendMessage()` returns a Promise that
 * rejects with "Receiving end does not exist" when no listener is active
 * (e.g. sidepanel closed). This helper wraps broadcasts so the rejection
 * is always caught, preventing unhandled-promise errors in the SW console.
 *
 * Usage:
 *   import { safeBroadcast } from '../../shared/safeBroadcast.js';
 *   safeBroadcast({ type: 'MY_EVENT', ... });
 */

import { createLogger } from '../logger.js';

const logger = createLogger('SafeBroadcast');

const RECEIVING_END_RE = /Receiving end does not exist/i;

/**
 * Broadcast a message to all extension contexts (sidepanel, popup, etc.).
 * Always fire-and-forget: never throws, never returns a meaningful value.
 *
 * @param {Object} message - Message payload (must include `type`)
 * @param {Object} [options]
 * @param {'debug'|'warn'|'none'} [options.logLevelOnNoReceiver='debug']
 *        Log level when no receiver is listening.
 * @returns {void}
 */
export function safeBroadcast(message, options = {}) {
  const { logLevelOnNoReceiver = 'debug' } = options;

  try {
    chrome.runtime.sendMessage(message).catch((err) => {
      if (RECEIVING_END_RE.test(err?.message)) {
        if (logLevelOnNoReceiver === 'debug') {
          logger.debug('No receiver for broadcast', { type: message.type });
        } else if (logLevelOnNoReceiver === 'warn') {
          logger.warn('No receiver for broadcast', { type: message.type });
        }
        // 'none' → silent
        return;
      }
      // Unexpected broadcast error — always log as warn
      logger.warn('Broadcast failed', {
        type: message.type,
        error: err?.message,
      });
    });
  } catch (err) {
    // chrome.runtime may not be available (test env, extension unloading)
    logger.debug('chrome.runtime.sendMessage threw synchronously', {
      type: message.type,
      error: err?.message,
    });
  }
}
