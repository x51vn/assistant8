/**
 * @fileoverview Message Schema for Chrome Extension
 * Standardized message passing between Background/Content/UI
 * All messages MUST follow this schema for maintainability
 * 
 * Architecture: Message-based communication is the backbone of MV3
 */

import { generateCorrelationId } from '../logger.js';

/**
 * Base message structure - all messages must extend this
 * @typedef {Object} BaseMessage
 * @property {number} v - Schema version
 * @property {string} type - Message type (ACTION constant)
 * @property {string} correlationId - For tracing request/response
 * @property {number} [timestamp] - When message was created
 */

/**
 * Message version - increment when schema changes
 */
export const MESSAGE_VERSION = 1;

/**
 * Message types - Centralized definition
 * Naming convention: DOMAIN_VERB or VERB_DOMAIN
 */
export const MESSAGE_TYPES = {
  // Health check
  PING: 'PING',
  PONG: 'PONG',
  
  // Session management
  SESSION_CREATE: 'SESSION_CREATE',
  SESSION_CREATED: 'SESSION_CREATED',
  
  // ChatGPT operations
  CHATGPT_SEND_INPUT: 'CHATGPT_SEND_INPUT',
  CHATGPT_INPUT_SENT: 'CHATGPT_INPUT_SENT',
  CHATGPT_GET_OUTPUT: 'CHATGPT_GET_OUTPUT',
  CHATGPT_OUTPUT_READY: 'CHATGPT_OUTPUT_READY',
  CHATGPT_FILL_PROMPT: 'CHATGPT_FILL_PROMPT',
  
  // Content script actions
  CONTENT_EXTRACT: 'CONTENT_EXTRACT',
  CONTENT_EXTRACTED: 'CONTENT_EXTRACTED',
  
  // State management
  STATE_GET: 'STATE_GET',
  STATE_SET: 'STATE_SET',
  STATE_UPDATED: 'STATE_UPDATED',
  
  // Portfolio operations
  PORTFOLIO_ADD: 'PORTFOLIO_ADD',
  PORTFOLIO_UPDATE: 'PORTFOLIO_UPDATE',
  PORTFOLIO_REMOVE: 'PORTFOLIO_REMOVE',
  PORTFOLIO_EVALUATE: 'PORTFOLIO_EVALUATE',
  
  // Prompt operations
  PROMPT_SEND: 'PROMPT_SEND',
  PROMPT_SENT: 'PROMPT_SENT',
  SEND_PROMPT: 'SEND_PROMPT',
  ENSURE_CHATGPT_OPEN: 'ENSURE_CHATGPT_OPEN',
  CHATGPT_TAB_READY: 'CHATGPT_TAB_READY',
  
  // Firebase sync
  FIREBASE_AUTH: 'FIREBASE_AUTH',
  FIREBASE_SYNC: 'FIREBASE_SYNC',
  FIREBASE_SYNCED: 'FIREBASE_SYNCED',
  FIREBASE_RESTORE: 'FIREBASE_RESTORE',
  FIREBASE_RESTORED: 'FIREBASE_RESTORED',
  FIREBASE_LIST_BACKUPS: 'FIREBASE_LIST_BACKUPS',
  FIREBASE_BACKUPS_LISTED: 'FIREBASE_BACKUPS_LISTED',
  
  // History operations
  HISTORY_GET: 'HISTORY_GET',
  HISTORY_READY: 'HISTORY_READY',
  HISTORY_CLEAR: 'HISTORY_CLEAR',
  HISTORY_CLEARED: 'HISTORY_CLEARED',
  HISTORY_GET_BY_ID: 'HISTORY_GET_BY_ID',
  HISTORY_ITEM: 'HISTORY_ITEM',
  CHAT_OPEN: 'CHAT_OPEN',
  CHAT_OPENED: 'CHAT_OPENED',
  
  // Error operations
  ERROR_ADD: 'ERROR_ADD',
  ERROR_ADDED: 'ERROR_ADDED',
  ERROR_UPDATE: 'ERROR_UPDATE',
  ERROR_UPDATED: 'ERROR_UPDATED',
  ERROR_DELETE: 'ERROR_DELETE',
  ERROR_DELETED: 'ERROR_DELETED',
  ERROR_GET_ALL: 'ERROR_GET_ALL',
  ERROR_LIST: 'ERROR_LIST',
  ERROR_CLEAR_ALL: 'ERROR_CLEAR_ALL',
  
  // X51LABS-94: Telemetry
  TELEMETRY_REPORT: 'TELEMETRY_REPORT',
  TELEMETRY_RECORDED: 'TELEMETRY_RECORDED',
  ERROR_ALL_CLEARED: 'ERROR_ALL_CLEARED',
  
  // Error
  ERROR: 'ERROR'
};

/**
 * Create a base message with required fields
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {Object} [payload] - Optional payload data
 * @returns {Object} Message object
 */
export function createMessage(type, payload = {}) {
  return {
    v: MESSAGE_VERSION,
    type,
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    ...payload
  };
}

/**
 * Create a response message for a received message
 * @param {Object} originalMessage - The message being responded to
 * @param {string} responseType - Response message type
 * @param {Object} [payload] - Response payload
 * @returns {Object} Response message
 */
export function createResponse(originalMessage, responseType, payload = {}) {
  return {
    v: MESSAGE_VERSION,
    type: responseType,
    correlationId: originalMessage.correlationId, // Keep same correlation ID
    timestamp: Date.now(),
    inResponseTo: originalMessage.type,
    ...payload
  };
}

/**
 * Create an error response
 * @param {Object} originalMessage - The message that caused error
 * @param {string} errorCode - Error code
 * @param {string} errorMessage - Error message
 * @param {*} [details] - Additional error details
 * @returns {Object} Error response message
 */
export function createErrorResponse(originalMessage, errorCode, errorMessage, details = null) {
  return {
    v: MESSAGE_VERSION,
    type: MESSAGE_TYPES.ERROR,
    correlationId: originalMessage.correlationId,
    timestamp: Date.now(),
    inResponseTo: originalMessage.type,
    error: {
      code: errorCode,
      message: errorMessage,
      details
    }
  };
}

/**
 * Validate message structure
 * @param {*} message - Message to validate
 * @returns {boolean} True if valid
 */
export function isValidMessage(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  if (typeof message.v !== 'number' || message.v !== MESSAGE_VERSION) {
    return false;
  }
  
  if (typeof message.type !== 'string' || !message.type) {
    return false;
  }
  
  if (typeof message.correlationId !== 'string' || !message.correlationId) {
    return false;
  }
  
  return true;
}

/**
 * Type guards for specific message types
 */

/** @param {*} msg @returns {boolean} */
export function isPingMessage(msg) {
  return isValidMessage(msg) && msg.type === MESSAGE_TYPES.PING;
}

/** @param {*} msg @returns {boolean} */
export function isChatGPTMessage(msg) {
  return isValidMessage(msg) && msg.type.startsWith('CHATGPT_');
}

/** @param {*} msg @returns {boolean} */
export function isErrorMessage(msg) {
  return isValidMessage(msg) && msg.type === MESSAGE_TYPES.ERROR;
}

/**
 * Message payload types (for type safety)
 */

/**
 * @typedef {Object} ChatGPTSendInputPayload
 * @property {string} prompt - The prompt to send
 * @property {boolean} [createNewChat] - Create new chat session
 * @property {boolean} [reviewOnly] - Only fill, don't send
 * @property {string} [runId] - Optional run identifier
 */

/**
 * @typedef {Object} ContentExtractPayload
 * @property {string[]} [selectors] - Optional CSS selectors to try
 * @property {number} [maxLength] - Max content length
 */

/**
 * @typedef {Object} PortfolioAddPayload
 * @property {string} symbol - Stock symbol
 * @property {number} entry - Entry price
 * @property {number} quantity - Number of shares
 */
