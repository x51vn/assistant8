/**
 * Market Assessment API — Background communication layer
 * Routes market assessment + sectors operations to background handlers.
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

// ─── Helpers ───

function extractError(response) {
  if (response.errorCode) {
    return { code: response.errorCode, message: response.errorMessage || 'Có lỗi xảy ra' };
  }
  if (response.error) {
    if (typeof response.error === 'string') return { code: 'ERROR', message: response.error };
    if (response.error.message) return { code: response.error.code || 'ERROR', message: response.error.message };
  }
  if (response.errorMessage) return { code: 'ERROR', message: response.errorMessage };
  return null;
}

async function sendMessage(type, data = {}) {
  const response = await chrome.runtime.sendMessage({
    v: 1,
    type,
    data,
    correlationId: generateCorrelationId(),
    timestamp: Date.now()
  });
  const err = extractError(response);
  if (err) return { success: false, error: err, ...response };
  return response;
}

// ============================================================
// Market Assessment API
// ============================================================

/**
 * Run market assessment (manual trigger)
 * @returns {Promise<Object>} { success, runId, records, ... }
 */
export async function runMarketAssessment() {
  return sendMessage(MESSAGE_TYPES.MARKET_ASSESSMENT_RUN);
}

/**
 * Fetch assessment history
 * @param {Object} [filters] - { days, symbol, sector_name }
 * @returns {Promise<Object>} { success, items, runs }
 */
export async function fetchAssessmentHistory(filters = {}) {
  return sendMessage(MESSAGE_TYPES.MARKET_ASSESSMENT_GET_HISTORY, filters);
}

/**
 * Fetch single run detail
 * @param {string} runId
 * @returns {Promise<Object>} { success, items }
 */
export async function fetchAssessmentDetail(runId) {
  return sendMessage(MESSAGE_TYPES.MARKET_ASSESSMENT_GET_DETAIL, { run_id: runId });
}

/**
 * Delete a full run
 * @param {string} runId
 * @returns {Promise<Object>} { success }
 */
export async function deleteAssessmentRun(runId) {
  return sendMessage(MESSAGE_TYPES.MARKET_ASSESSMENT_DELETE_RUN, { run_id: runId });
}

// ============================================================
// Sectors API
// ============================================================

/**
 * Fetch user sectors
 * @param {boolean} [includeInactive=false]
 * @returns {Promise<Object>} { success, items }
 */
export async function fetchSectors(includeInactive = false) {
  return sendMessage(MESSAGE_TYPES.SECTORS_GET, { includeInactive });
}

/**
 * Add or update a sector
 * @param {Object} sector - { id?, sector_name, is_active? }
 * @returns {Promise<Object>} { success, item }
 */
export async function upsertSector(sector) {
  return sendMessage(MESSAGE_TYPES.SECTORS_UPSERT, sector);
}

/**
 * Delete a sector
 * @param {string} id
 * @returns {Promise<Object>} { success }
 */
export async function deleteSector(id) {
  return sendMessage(MESSAGE_TYPES.SECTORS_DELETE, { id });
}
