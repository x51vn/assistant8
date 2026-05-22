/**
 * @fileoverview Content Contract Adapter — Layer 6 boundary convergence
 *
 * Maps legacy `action`-string messages sent to the content script into
 * contract-normalized data objects that align with the shared message
 * contract definitions (CHATGPT_SEND_INPUT, CHATGPT_GET_OUTPUT).
 *
 * This adapter keeps backward compatibility: callers continue sending
 * `{ action: 'send_input', prompt, ... }` and the adapter provides a
 * normalized DTO that matches contract field names and types.
 *
 * Usage in actions.js:
 *   import { adaptSendInput, adaptGetOutput } from './contractAdapter.js';
 *   const dto = adaptSendInput(request);
 *   // use dto.prompt, dto.createNewChat, dto.reviewOnly, dto.runId
 */

// ─── Action → contract type map ──────────────────────────────────────────────
// Mirrors CHATGPT_SEND_INPUT / CHATGPT_GET_OUTPUT contracts in MessageContractRegistry

/**
 * Normalize a legacy `send_input` action message into a CHATGPT_SEND_INPUT DTO.
 *
 * Contract: CHATGPT_SEND_INPUT request fields
 *   prompt        {string}  required, minLength: 1
 *   createNewChat {boolean} optional
 *   reviewOnly    {boolean} optional
 *   runId         {string}  optional
 *
 * @param {object} request - incoming legacy action message
 * @returns {{ prompt: string, createNewChat: boolean, reviewOnly: boolean, runId: string|null, _warnings: string[] }}
 */
export function adaptSendInput(request) {
  const warnings = [];

  const prompt = typeof request.prompt === 'string' ? request.prompt : '';
  if (!prompt) warnings.push("Field 'prompt' is required (warn-only: content layer)");

  const createNewChat = request.createNewChat !== false;
  const reviewOnly = request.reviewOnly === true;
  const runId = typeof request.runId === 'string' ? request.runId : null;

  return { prompt, createNewChat, reviewOnly, runId, _warnings: warnings };
}

/**
 * Normalize a legacy `get_output` action message into a CHATGPT_GET_OUTPUT DTO.
 *
 * Contract: CHATGPT_GET_OUTPUT request fields
 *   wait          {boolean} optional
 *   timeoutMs     {number}  optional, min: 1
 *   stableMs      {number}  optional, min: 0
 *   expectedChatId {string} optional
 *
 * @param {object} request - incoming legacy action message
 * @returns {{ wait: boolean, timeoutMs: number, stableMs: number, expectedChatId: string|null, _warnings: string[] }}
 */
export function adaptGetOutput(request) {
  const warnings = [];

  const wait = request.wait !== false;
  const timeoutMs = Number.isFinite(request.timeoutMs) && request.timeoutMs >= 1
    ? request.timeoutMs
    : 15 * 60 * 1000;
  const stableMs = Number.isFinite(request.stableMs) && request.stableMs >= 0
    ? request.stableMs
    : 1500;
  const expectedChatId = typeof request.expectedChatId === 'string' ? request.expectedChatId : null;

  if (request.timeoutMs !== undefined && !Number.isFinite(request.timeoutMs)) {
    warnings.push("Field 'timeoutMs' must be a finite number (warn-only: content layer)");
  }

  return { wait, timeoutMs, stableMs, expectedChatId, _warnings: warnings };
}

/**
 * Normalize a legacy `ping` action response into a CONTENT_SCRIPT_READY-compatible shape.
 *
 * @param {boolean} markerSet - whether window.__ChatGPTAssistantReady is set
 * @param {string}  url       - current page URL
 * @returns {object}
 */
export function buildPingResponse(markerSet, url) {
  return {
    pong: true,
    status: 'ok',
    ready: true,
    contentScriptVersion: 1,
    markerSet,
    markerTimestamp: typeof window !== 'undefined' ? (window.__ChatGPTAssistantReadyTimestamp || null) : null,
    url,
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
    messageListenerReady: true,
  };
}

/**
 * Map a free-form `action` string to the closest contract message type name.
 * Used for telemetry/logging only — does not alter routing.
 *
 * @param {string} action
 * @returns {string} contract type name or original action prefixed with 'legacy:'
 */
export function actionToContractType(action) {
  const MAP = {
    send_input:             'CHATGPT_SEND_INPUT',
    get_output:             'CHATGPT_GET_OUTPUT',
    get_result:             'CHATGPT_GET_OUTPUT',
    create_new_session:     'CONTENT_SCRIPT_READY',
    ping:                   'CONTENT_SCRIPT_READY',
    input_prompt:           'CHATGPT_SEND_INPUT',
  };
  return MAP[action] || `legacy:${action}`;
}
