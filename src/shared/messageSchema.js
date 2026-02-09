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
  SESSION_CHECK: 'SESSION_CHECK',
  SESSION_STATUS: 'SESSION_STATUS',
  FORCE_SESSION_REFRESH: 'FORCE_SESSION_REFRESH',
  SESSION_REFRESH_STATUS: 'SESSION_REFRESH_STATUS',
  SESSION_ABOUT_TO_EXPIRE: 'SESSION_ABOUT_TO_EXPIRE',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
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
  // Content script -> Background: captured assistant response for an extension-run prompt
  CONTENT_RESPONSE_CAPTURED: 'CONTENT_RESPONSE_CAPTURED',
  
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
  HISTORY_DETAIL: 'HISTORY_DETAIL',
  HISTORY_ITEM: 'HISTORY_ITEM',
  HISTORY_ADD: 'HISTORY_ADD',
  HISTORY_ADDED: 'HISTORY_ADDED',
  HISTORY_UPDATE: 'HISTORY_UPDATE',
  HISTORY_UPDATED: 'HISTORY_UPDATED',
  HISTORY_DELETE: 'HISTORY_DELETE',
  HISTORY_DELETED: 'HISTORY_DELETED',
  HISTORY_CLEAR: 'HISTORY_CLEAR',
  HISTORY_CLEARED: 'HISTORY_CLEARED',
  CHAT_OPEN: 'CHAT_OPEN',
  CHAT_OPENED: 'CHAT_OPENED',
  
  // Error operations
  ERROR_GET_ALL: 'ERROR_GET_ALL',
  ERROR_DATA: 'ERROR_DATA',
  ERROR_LIST: 'ERROR_LIST',
  ERROR_GET_BY_ID: 'ERROR_GET_BY_ID',
  ERROR_DETAIL: 'ERROR_DETAIL',
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

  // Writing Templates operations (Writing Prompt Templates feature)
  WRITING_TEMPLATES_GET: 'WRITING_TEMPLATES_GET',
  WRITING_TEMPLATES_DATA: 'WRITING_TEMPLATES_DATA',
  WRITING_TEMPLATES_UPSERT: 'WRITING_TEMPLATES_UPSERT',
  WRITING_TEMPLATES_UPSERTED: 'WRITING_TEMPLATES_UPSERTED',
  WRITING_TEMPLATES_INIT: 'WRITING_TEMPLATES_INIT',
  WRITING_TEMPLATES_INITIALIZED: 'WRITING_TEMPLATES_INITIALIZED',

  // System Prompts operations (System Prompt Management feature) - DEPRECATED: Use PROMPTS_* instead
  SYSTEM_PROMPTS_GET: 'SYSTEM_PROMPTS_GET',
  SYSTEM_PROMPTS_DATA: 'SYSTEM_PROMPTS_DATA',
  SYSTEM_PROMPTS_UPSERT: 'SYSTEM_PROMPTS_UPSERT',
  SYSTEM_PROMPTS_UPSERTED: 'SYSTEM_PROMPTS_UPSERTED',
  SYSTEM_PROMPTS_INIT: 'SYSTEM_PROMPTS_INIT',
  SYSTEM_PROMPTS_INITIALIZED: 'SYSTEM_PROMPTS_INITIALIZED',

  // Unified Prompts operations (ALL prompts: system + writing)
  PROMPTS_GET_ALL: 'PROMPTS_GET_ALL',
  PROMPTS_DATA_ALL: 'PROMPTS_DATA_ALL',
  PROMPTS_GET_BY_TYPE: 'PROMPTS_GET_BY_TYPE',
  PROMPTS_DATA_BY_TYPE: 'PROMPTS_DATA_BY_TYPE',
  PROMPTS_UPSERT: 'PROMPTS_UPSERT',
  PROMPTS_UPSERTED: 'PROMPTS_UPSERTED',
  PROMPTS_INIT: 'PROMPTS_INIT',
  PROMPTS_INITIALIZED: 'PROMPTS_INITIALIZED',

  // Asset Management operations (XST-696)
  ASSETS_GET: 'ASSETS_GET',
  ASSETS_DATA: 'ASSETS_DATA',
  ASSET_ADD: 'ASSET_ADD',
  ASSET_ADDED: 'ASSET_ADDED',
  ASSET_UPDATE: 'ASSET_UPDATE',
  ASSET_UPDATED: 'ASSET_UPDATED',
  ASSET_DELETE: 'ASSET_DELETE',
  ASSET_DELETED: 'ASSET_DELETED',
  
  // Net Worth & History operations (XST-696)
  NET_WORTH_GET: 'NET_WORTH_GET',
  NET_WORTH_DATA: 'NET_WORTH_DATA',
  ASSET_HISTORY_GET: 'ASSET_HISTORY_GET',
  ASSET_HISTORY_DATA: 'ASSET_HISTORY_DATA',
  ASSET_SNAPSHOT_CREATE: 'ASSET_SNAPSHOT_CREATE',
  ASSET_SNAPSHOT_CREATED: 'ASSET_SNAPSHOT_CREATED',
  
  // English learning operations
  ENGLISH_GET_ALL: 'ENGLISH_GET_ALL',
  ENGLISH_DATA: 'ENGLISH_DATA',
  ENGLISH_ADD: 'ENGLISH_ADD',
  ENGLISH_ADDED: 'ENGLISH_ADDED',
  ENGLISH_DELETE: 'ENGLISH_DELETE',
  ENGLISH_DELETED: 'ENGLISH_DELETED',
  
  // Commodity prices (gold, crypto) - XST-xxx
  COMMODITY_GET_GOLD_PRICES: 'COMMODITY_GET_GOLD_PRICES',
  COMMODITY_GOLD_PRICES: 'COMMODITY_GOLD_PRICES',
  COMMODITY_GET_CRYPTO_PRICES: 'COMMODITY_GET_CRYPTO_PRICES',
  COMMODITY_CRYPTO_PRICES: 'COMMODITY_CRYPTO_PRICES',
  COMMODITY_UPDATE_ASSET_PRICES: 'COMMODITY_UPDATE_ASSET_PRICES',
  COMMODITY_PRICES_UPDATED: 'COMMODITY_PRICES_UPDATED',

  // Market indices (VNI, VN30, HNX, UPCOM)
  MARKET_INDICES_GET: 'MARKET_INDICES_GET',
  MARKET_INDICES_DATA: 'MARKET_INDICES_DATA',

  // Atlassian Integration (Jira + Confluence)
  ATLASSIAN_JIRA_GET_ISSUES: 'ATLASSIAN_JIRA_GET_ISSUES',
  ATLASSIAN_JIRA_ISSUES_DATA: 'ATLASSIAN_JIRA_ISSUES_DATA',
  ATLASSIAN_JIRA_CREATE_ISSUE: 'ATLASSIAN_JIRA_CREATE_ISSUE',
  ATLASSIAN_JIRA_ISSUE_CREATED: 'ATLASSIAN_JIRA_ISSUE_CREATED',
  ATLASSIAN_JIRA_UPDATE_ISSUE: 'ATLASSIAN_JIRA_UPDATE_ISSUE',
  ATLASSIAN_JIRA_ISSUE_UPDATED: 'ATLASSIAN_JIRA_ISSUE_UPDATED',
  ATLASSIAN_JIRA_DELETE_ISSUE: 'ATLASSIAN_JIRA_DELETE_ISSUE',
  ATLASSIAN_JIRA_ISSUE_DELETED: 'ATLASSIAN_JIRA_ISSUE_DELETED',
  ATLASSIAN_JIRA_GET_PROJECTS: 'ATLASSIAN_JIRA_GET_PROJECTS',
  ATLASSIAN_JIRA_PROJECTS_DATA: 'ATLASSIAN_JIRA_PROJECTS_DATA',
  ATLASSIAN_CONFLUENCE_GET_PAGES: 'ATLASSIAN_CONFLUENCE_GET_PAGES',
  ATLASSIAN_CONFLUENCE_PAGES_DATA: 'ATLASSIAN_CONFLUENCE_PAGES_DATA',
  ATLASSIAN_CONFLUENCE_GET_PAGE: 'ATLASSIAN_CONFLUENCE_GET_PAGE',
  ATLASSIAN_CONFLUENCE_PAGE_DATA: 'ATLASSIAN_CONFLUENCE_PAGE_DATA',
  ATLASSIAN_CONFLUENCE_CREATE_PAGE: 'ATLASSIAN_CONFLUENCE_CREATE_PAGE',
  ATLASSIAN_CONFLUENCE_PAGE_CREATED: 'ATLASSIAN_CONFLUENCE_PAGE_CREATED',
  ATLASSIAN_CONFLUENCE_UPDATE_PAGE: 'ATLASSIAN_CONFLUENCE_UPDATE_PAGE',
  ATLASSIAN_CONFLUENCE_PAGE_UPDATED: 'ATLASSIAN_CONFLUENCE_PAGE_UPDATED',
  ATLASSIAN_TEST_CONNECTION: 'ATLASSIAN_TEST_CONNECTION',
  ATLASSIAN_CONNECTION_STATUS: 'ATLASSIAN_CONNECTION_STATUS',

  // X51LABS-94: Telemetry
  TELEMETRY_REPORT: 'TELEMETRY_REPORT',
  TELEMETRY_RECORDED: 'TELEMETRY_RECORDED',

  // Context Menu → Side Panel (analysis in panel instead of ChatGPT tab)
  CONTEXT_MENU_TO_SIDEPANEL: 'CONTEXT_MENU_TO_SIDEPANEL',
  
  // Migration
  MIGRATION_CHECK: 'MIGRATION_CHECK',
  MIGRATION_AVAILABLE: 'MIGRATION_AVAILABLE',
  MIGRATE_LOCAL_TO_SUPABASE: 'MIGRATE_LOCAL_TO_SUPABASE',
  MIGRATION_COMPLETE: 'MIGRATION_COMPLETE',

  // X-Neews Authentication operations (XST-738, XST-739)
  XNEEWS_AUTH_REGISTER: 'XNEEWS_AUTH_REGISTER',
  XNEEWS_AUTH_LOGIN: 'XNEEWS_AUTH_LOGIN',
  XNEEWS_AUTH_REFRESH: 'XNEEWS_AUTH_REFRESH',
  XNEEWS_AUTH_SUCCESS: 'XNEEWS_AUTH_SUCCESS',
  XNEEWS_AUTH_LOGOUT: 'XNEEWS_AUTH_LOGOUT',
  XNEEWS_AUTH_LOGGED_OUT: 'XNEEWS_AUTH_LOGGED_OUT',

  // X-Neews Watchlist operations (XST-738, XST-741)
  XNEEWS_WATCHLIST_GET: 'XNEEWS_WATCHLIST_GET',
  XNEEWS_WATCHLIST_DATA: 'XNEEWS_WATCHLIST_DATA',
  XNEEWS_WATCHLIST_CREATE: 'XNEEWS_WATCHLIST_CREATE',
  XNEEWS_WATCHLIST_CREATED: 'XNEEWS_WATCHLIST_CREATED',
  XNEEWS_WATCHLIST_UPDATE: 'XNEEWS_WATCHLIST_UPDATE',
  XNEEWS_WATCHLIST_UPDATED: 'XNEEWS_WATCHLIST_UPDATED',
  XNEEWS_WATCHLIST_DELETE: 'XNEEWS_WATCHLIST_DELETE',
  XNEEWS_WATCHLIST_DELETED: 'XNEEWS_WATCHLIST_DELETED',
  XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT: 'XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT',
  XNEEWS_WATCHLIST_HIGHLIGHT_TOGGLED: 'XNEEWS_WATCHLIST_HIGHLIGHT_TOGGLED',
  
  // X-Neews Price Updates (XST-744)
  XNEEWS_PRICE_UPDATE: 'XNEEWS_PRICE_UPDATE',           // Request from alarm to handler
  XNEEWS_PRICES_UPDATED: 'XNEEWS_PRICES_UPDATED',      // Broadcast from handler to UI
  
  // Watchlist AI Enrichment (entry/target/stoploss/thesis via ChatGPT)
  WATCHLIST_AI_ENRICH_RUN: 'WATCHLIST_AI_ENRICH_RUN',           // UI → Background: start enrichment
  WATCHLIST_AI_ENRICH_STATUS: 'WATCHLIST_AI_ENRICH_STATUS',     // Background → UI: progress update
  WATCHLIST_AI_ENRICH_DONE: 'WATCHLIST_AI_ENRICH_DONE',         // Background → UI: run completed
  
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
