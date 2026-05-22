/**
 * Unified UI -> Background messaging gateway.
 * Keeps envelope and error handling consistent across feature APIs.
 */

import { createMessage, MESSAGE_TYPES, getMessageDomainVersion } from '../../shared/messageSchema.js';

/**
 * Send a typed message to background with the standard envelope.
 * @param {string} type
 * @param {object} payload
 * @returns {Promise<any>}
 */
export async function sendRuntimeMessage(type, payload = {}) {
  const message = createMessage(type, payload);
  const domainVersion = getMessageDomainVersion(type);
  if (domainVersion) {
    message.domainVersion = domainVersion;
  }
  return chrome.runtime.sendMessage(message);
}

/**
 * Throw a normalized error when background returns an error response.
 * @param {any} response
 * @param {string} fallbackMessage
 */
export function assertNoRuntimeError(response, fallbackMessage = 'Request failed') {
  const responseError = response?.error?.message || response?.errorMessage;
  if (response?.type === MESSAGE_TYPES.ERROR || response?.errorCode || responseError) {
    throw new Error(responseError || fallbackMessage);
  }
}

