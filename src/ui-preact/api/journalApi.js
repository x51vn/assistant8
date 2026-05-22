/**
 * Journal API — background communication layer
 * Routes journal operations to background handlers
 *
 * Change: trading-journal-mvp
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { sendRuntimeMessage } from './runtimeGateway.js';

function extractError(response) {
  if (!response) return { code: 'NO_RESPONSE', message: 'Không nhận được phản hồi' };
  if (response.errorCode) return { code: response.errorCode, message: response.errorMessage || 'Có lỗi xảy ra' };
  if (response.type === MESSAGE_TYPES.ERROR) return { code: 'ERROR', message: response.errorMessage || 'Có lỗi xảy ra' };
  return null;
}

async function sendMsg(type, data = {}) {
  return sendRuntimeMessage(type, { data });
}

/**
 * Fetch journal entries with optional filters
 * @param {{ status?: string, symbol?: string, limit?: number }} [filters]
 */
export async function fetchJournalEntries(filters = {}) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_GET_ALL, filters);
    const error = extractError(response);
    if (error) return { items: [], error };
    return { items: response.items || [], error: null };
  } catch (err) {
    return { items: [], error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Create a new journal entry
 * @param {Object} data
 */
export async function createJournalEntry(data) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_CREATE, data);
    const error = extractError(response);
    if (error) return { item: null, error };
    return { item: response.item, error: null };
  } catch (err) {
    return { item: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Update a journal entry (status advance, field updates)
 * @param {string} id
 * @param {Object} updates
 */
export async function updateJournalEntry(id, updates) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_UPDATE, { id, updates });
    const error = extractError(response);
    if (error) return { item: null, error };
    return { item: response.item, error: null };
  } catch (err) {
    return { item: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Delete a journal entry
 * @param {string} id
 */
export async function deleteJournalEntry(id) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_DELETE, { id });
    const error = extractError(response);
    if (error) return { success: false, error };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Get pre-fill data for a new journal entry
 * @param {string} symbol
 * @param {string|null} [watchlistId]
 */
export async function getJournalPrefill(symbol, watchlistId = null) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_GET_PREFILL, {
      symbol,
      watchlist_id: watchlistId,
    });
    const error = extractError(response);
    if (error) return { prefill: null, error };
    return {
      prefill: {
        symbol: response.symbol,
        watchlistPrefill: response.watchlistPrefill,
        regimePrefill: response.regimePrefill,
        checklistTemplate: response.checklistTemplate || [],
      },
      error: null,
    };
  } catch (err) {
    return { prefill: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Get aggregate journal metrics
 */
export async function getJournalMetrics() {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_GET_METRICS);
    const error = extractError(response);
    if (error) return { metrics: null, error };
    return {
      metrics: {
        totalTrades: response.totalTrades,
        winCount: response.winCount,
        lossCount: response.lossCount,
        winRate: response.winRate,
        avgRMultiple: response.avgRMultiple,
        ruleAdherenceRate: response.ruleAdherenceRate,
        topErrors: response.topErrors || [],
        periodTrades: response.periodTrades,
        repeatedErrorRate: response.repeatedErrorRate,
        disciplineScore: response.disciplineScore,
        insightAdoptionRate: response.insightAdoptionRate,
      },
      error: null,
    };
  } catch (err) {
    return { metrics: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Get lightweight journal summary for Dashboard
 */
export async function getJournalSummary() {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_GET_SUMMARY);
    const error = extractError(response);
    if (error) return { summary: null, error };
    return {
      summary: {
        openCount: response.openCount ?? 0,
        plannedCount: response.plannedCount ?? 0,
        recentWinRate: response.recentWinRate,
        avgRMultiple: response.avgRMultiple,
        disciplineScore: response.disciplineScore,
        topRepeatedErrors: response.topRepeatedErrors || [],
      },
      error: null,
    };
  } catch (err) {
    return { summary: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Evaluate weighted decision score for an entry candidate.
 * @param {Object} data
 */
export async function evaluateDecisionScore(data) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.DECISION_SCORE_EVALUATE, data);
    const error = extractError(response);
    if (error) return { result: null, error };
    return {
      result: {
        policyVersion: response.policyVersion,
        decisionScore: response.decisionScore,
        grade: response.grade,
        ruleBreakdown: response.ruleBreakdown || [],
        blockingReasons: response.blockingReasons || [],
        advice: response.advice || [],
      },
      error: null,
    };
  } catch (err) {
    return { result: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Evaluate pre-trade guardrails.
 * @param {Object} data
 */
export async function evaluateJournalGuardrails(data) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.JOURNAL_GUARDRAIL_EVALUATE, data);
    const error = extractError(response);
    if (error) return { result: null, error };
    return {
      result: {
        policyVersion: response.policyVersion,
        allowed: Boolean(response.allowed),
        checks: response.checks || [],
        blockingReasons: response.blockingReasons || [],
        warnings: response.warnings || [],
      },
      error: null,
    };
  } catch (err) {
    return { result: null, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Get or refresh playbook insights.
 * @param {{ refresh?: boolean, limit?: number }} options
 */
export async function getPlaybookInsights(options = {}) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.PLAYBOOK_INSIGHTS_GET, options);
    const error = extractError(response);
    if (error) return { items: [], error };
    return { items: response.items || [], error: null };
  } catch (err) {
    return { items: [], error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}

/**
 * Save helpful/not-helpful feedback for an insight.
 * @param {string} insightId
 * @param {boolean} helpful
 */
export async function savePlaybookInsightFeedback(insightId, helpful) {
  try {
    const response = await sendMsg(MESSAGE_TYPES.PLAYBOOK_INSIGHT_FEEDBACK, { insightId, helpful });
    const error = extractError(response);
    if (error) return { success: false, error };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { code: 'EXTENSION_ERROR', message: err.message } };
  }
}
