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
  CONTENT_PROMPT_SENT: 'CONTENT_PROMPT_SENT',
  CONTENT_PROMPT_FAILED: 'CONTENT_PROMPT_FAILED',
  
  // State management
  STATE_GET: 'STATE_GET',
  STATE_SET: 'STATE_SET',
  STATE_UPDATED: 'STATE_UPDATED',
  
  // Content script readiness (X51LABS-157: Race condition elimination)
  CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
  
  // Portfolio operations
  PORTFOLIO_GET: 'PORTFOLIO_GET',
  PORTFOLIO_DATA: 'PORTFOLIO_DATA',
  PORTFOLIO_ADD: 'PORTFOLIO_ADD',
  PORTFOLIO_ADDED: 'PORTFOLIO_ADDED',
  PORTFOLIO_UPDATE: 'PORTFOLIO_UPDATE',
  PORTFOLIO_UPDATED: 'PORTFOLIO_UPDATED',
  PORTFOLIO_REMOVE: 'PORTFOLIO_REMOVE',
  PORTFOLIO_REMOVED: 'PORTFOLIO_REMOVED',
  PORTFOLIO_UPDATE_PRICES: 'PORTFOLIO_UPDATE_PRICES',
  PORTFOLIO_PRICES_UPDATED: 'PORTFOLIO_PRICES_UPDATED',
  PORTFOLIO_EVALUATE: 'PORTFOLIO_EVALUATE',
  
  // Prompt operations (legacy/high-level - kept for backward compatibility)
  PROMPT_SEND: 'PROMPT_SEND',
  PROMPT_SENT: 'PROMPT_SENT',
  SEND_PROMPT: 'SEND_PROMPT',
  ENSURE_CHATGPT_OPEN: 'ENSURE_CHATGPT_OPEN',
  CHATGPT_TAB_READY: 'CHATGPT_TAB_READY',
  
  // Supabase Auth operations
  SUPABASE_AUTH_LOGIN: 'SUPABASE_AUTH_LOGIN',
  SUPABASE_AUTH_SUCCESS: 'SUPABASE_AUTH_SUCCESS',
  SUPABASE_AUTH_LOGOUT: 'SUPABASE_AUTH_LOGOUT',
  SUPABASE_AUTH_LOGGED_OUT: 'SUPABASE_AUTH_LOGGED_OUT',
  SUPABASE_AUTH_CHECK: 'SUPABASE_AUTH_CHECK',
  SUPABASE_AUTH_STATUS: 'SUPABASE_AUTH_STATUS',
  AUTH_STATE_CHANGED: 'AUTH_STATE_CHANGED',
  AUTH_TOKEN_REFRESHED: 'AUTH_TOKEN_REFRESHED',
  
  // History operations
  HISTORY_GET_ALL: 'HISTORY_GET_ALL',
  HISTORY_LIST: 'HISTORY_LIST',
  HISTORY_GET: 'HISTORY_GET',
  HISTORY_READY: 'HISTORY_READY',
  HISTORY_GET_BY_ID: 'HISTORY_GET_BY_ID',
  HISTORY_ITEM: 'HISTORY_ITEM',
  HISTORY_ADD: 'HISTORY_ADD',
  HISTORY_ADDED: 'HISTORY_ADDED',
  HISTORY_UPDATE: 'HISTORY_UPDATE',
  HISTORY_UPDATED: 'HISTORY_UPDATED',
  HISTORY_CLEAR: 'HISTORY_CLEAR',
  HISTORY_CLEARED: 'HISTORY_CLEARED',
  CHAT_OPEN: 'CHAT_OPEN',
  CHAT_OPENED: 'CHAT_OPENED',
  
  // Error operations
  ERROR_GET_ALL: 'ERROR_GET_ALL',
  ERROR_DATA: 'ERROR_DATA',
  ERROR_LIST: 'ERROR_LIST',
  ERROR_ADD: 'ERROR_ADD',
  ERROR_ADDED: 'ERROR_ADDED',
  ERROR_UPDATE: 'ERROR_UPDATE',
  ERROR_UPDATED: 'ERROR_UPDATED',
  ERROR_DELETE: 'ERROR_DELETE',
  ERROR_DELETED: 'ERROR_DELETED',
  ERROR_CLEAR_ALL: 'ERROR_CLEAR_ALL',
  ERROR_ALL_CLEARED: 'ERROR_ALL_CLEARED',
  
  // Settings operations (✅ GPT-FIX: Added for Supabase settings)
  SETTINGS_GET: 'SETTINGS_GET',
  SETTINGS_DATA: 'SETTINGS_DATA',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  SETTINGS_DELETE: 'SETTINGS_DELETE',
  SETTINGS_DELETED: 'SETTINGS_DELETED',
  
  // X51LABS-94: Telemetry
  TELEMETRY_REPORT: 'TELEMETRY_REPORT',
  TELEMETRY_RECORDED: 'TELEMETRY_RECORDED',
  
  // Migration
  MIGRATION_CHECK: 'MIGRATION_CHECK',
  MIGRATION_AVAILABLE: 'MIGRATION_AVAILABLE',
  MIGRATE_LOCAL_TO_SUPABASE: 'MIGRATE_LOCAL_TO_SUPABASE',
  MIGRATION_COMPLETE: 'MIGRATION_COMPLETE',
  
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
