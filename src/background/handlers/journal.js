/**
 * @fileoverview Trading Journal & Checklist Handlers
 * Handles all journal entry CRUD, checklist templates, pre-fill, and metrics
 *
 * Change: trading-journal-mvp
 *
 * Message types handled:
 *   Journal:    JOURNAL_GET_ALL, JOURNAL_CREATE, JOURNAL_UPDATE, JOURNAL_DELETE,
 *               JOURNAL_GET_PREFILL, JOURNAL_GET_METRICS, JOURNAL_GET_SUMMARY
 *   Checklist:  CHECKLIST_TEMPLATES_GET, CHECKLIST_TEMPLATE_CREATE,
 *               CHECKLIST_TEMPLATE_UPDATE, CHECKLIST_TEMPLATE_DELETE
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/Journal');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Valid status transitions: key → allowed next states */
const VALID_TRANSITIONS = {
  planned: ['open'],
  open: ['closed'],
  closed: ['reviewed'],
  reviewed: [] // terminal
};

/** Default checklist rules returned when user has no templates */
const DEFAULT_CHECKLIST_RULES = [
  { rule_key: 'regime_ok',      label: 'Market regime phải ON',             order_num: 1 },
  { rule_key: 'sector_ok',      label: 'Sector trend không DOWN',           order_num: 2 },
  { rule_key: 'entry_at_zone',  label: 'Entry tại vùng kế hoạch',           order_num: 3 },
  { rule_key: 'stoploss_set',   label: 'Stoploss đã xác định',              order_num: 4 },
  { rule_key: 'position_sized', label: 'Position size đã tính',             order_num: 5 },
  { rule_key: 'thesis_written', label: 'Thesis đã viết rõ ràng',            order_num: 6 },
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute R-multiple
 * @param {number} exit
 * @param {number} entry
 * @param {number|null} plannedStoploss
 * @returns {number|null}
 */
function computeRMultiple(exit, entry, plannedStoploss) {
  if (plannedStoploss == null || plannedStoploss === entry) return null;
  const risk = entry - plannedStoploss;
  if (risk === 0) return null;
  return (exit - entry) / risk;
}

/**
 * Map a Supabase error to an error response
 */
function handleSupabaseError(message, error, operation) {
  logger.error(`${operation} failed`, { error: error.message });

  if (error.message?.includes('Failed to fetch')) {
    return createErrorResponse(message, ERROR_CODES.NETWORK_ERROR, getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR));
  }
  if (error.code === '23505') {
    return createErrorResponse(message, 'CONFLICT', 'Dữ liệu đã tồn tại. Vui lòng kiểm tra lại.');
  }
  if (error.status === 401 || error.message?.includes('JWT')) {
    return createErrorResponse(message, ERROR_CODES.AUTH_EXPIRED, getUserFriendlyMessage(ERROR_CODES.AUTH_EXPIRED));
  }
  return createErrorResponse(message, ERROR_CODES.SUPABASE_ERROR, getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR), { technicalError: error.message });
}

/**
 * Check if error indicates missing table in Supabase schema cache.
 * Typical code: PGRST205
 */
function isTableNotFoundError(error) {
  return error?.code === 'PGRST205'
    || error?.message?.includes('PGRST205')
    || error?.message?.includes('Could not find the table');
}

// ============================================================================
// JOURNAL CRUD HANDLERS
// ============================================================================

/**
 * JOURNAL_GET_ALL — Fetch journal entries with optional filters
 */
registerHandler(MESSAGE_TYPES.JOURNAL_GET_ALL, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { status, symbol, limit = 100 } = message.data || {};

    const data = await supabaseWithRetry(async () => {
      let query = supabase
        .from('trade_journal')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);
      if (symbol) query = query.eq('symbol', symbol.toUpperCase());

      const { data, error } = await query;
      if (error) throw error;
      return data;
    });

    return createResponse(message, MESSAGE_TYPES.JOURNAL_LIST, { items: data, success: true });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'JOURNAL_GET_ALL');
  }
});

/**
 * JOURNAL_CREATE — Create a new journal entry
 */
registerHandler(MESSAGE_TYPES.JOURNAL_CREATE, async (message) => {
  try {
    const userId = await requireAuth(message);
    const entry = message.data || {};

    if (!entry.symbol || !String(entry.symbol).trim()) {
      return createErrorResponse(message, 'VALIDATION_ERROR', 'Symbol là bắt buộc');
    }

    // Auto-determine initial status
    const status = entry.actual_entry != null ? 'open' : 'planned';

    const row = {
      user_id: userId,
      symbol: String(entry.symbol).toUpperCase().trim(),
      watchlist_id: entry.watchlist_id || null,
      setup: entry.setup || null,
      thesis_snapshot: entry.thesis_snapshot || null,
      market_regime_snapshot: entry.market_regime_snapshot || null,
      market_score_snapshot: entry.market_score_snapshot != null ? Number(entry.market_score_snapshot) : null,
      market_action_snapshot: entry.market_action_snapshot || null,
      planned_entry: entry.planned_entry != null ? Number(entry.planned_entry) : null,
      planned_target: entry.planned_target != null ? Number(entry.planned_target) : null,
      planned_stoploss: entry.planned_stoploss != null ? Number(entry.planned_stoploss) : null,
      planned_qty: entry.planned_qty != null ? Number(entry.planned_qty) : null,
      risk_per_trade_pct: entry.risk_per_trade_pct != null ? Number(entry.risk_per_trade_pct) : null,
      account_size_snapshot: entry.account_size_snapshot != null ? Number(entry.account_size_snapshot) : null,
      checklist: entry.checklist || {},
      status,
      actual_entry: entry.actual_entry != null ? Number(entry.actual_entry) : null,
      actual_qty: entry.actual_qty != null ? Number(entry.actual_qty) : null,
      entry_date: entry.entry_date || null,
    };

    const data = await supabaseWithRetry(async () => {
      const { data, error } = await supabase.from('trade_journal').insert(row).select().single();
      if (error) throw error;
      return data;
    });

    return createResponse(message, MESSAGE_TYPES.JOURNAL_CREATED, { item: data, success: true });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'JOURNAL_CREATE');
  }
});

/**
 * JOURNAL_UPDATE — Update entry fields and/or advance status machine
 */
registerHandler(MESSAGE_TYPES.JOURNAL_UPDATE, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { id, updates } = message.data || {};

    if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'ID là bắt buộc');

    // Fetch current entry to validate transition
    const current = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('trade_journal')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      if (error) throw error;
      return data;
    });

    if (!current) {
      return createErrorResponse(message, 'NOT_FOUND', 'Journal entry không tìm thấy');
    }

    const updateData = { updated_at: new Date().toISOString() };

    // Handle status transition
    if (updates.status && updates.status !== current.status) {
      const allowed = VALID_TRANSITIONS[current.status] || [];
      if (!allowed.includes(updates.status)) {
        return createErrorResponse(
          message,
          'INVALID_TRANSITION',
          `Không thể chuyển từ "${current.status}" sang "${updates.status}". Chỉ có thể: ${allowed.join(', ') || 'không có'}`
        );
      }
      updateData.status = updates.status;

      // When closing: compute P&L and R-multiple
      if (updates.status === 'closed') {
        const exitPrice = updates.exit_price != null ? Number(updates.exit_price) : null;
        const entryPrice = current.actual_entry != null ? Number(current.actual_entry) : null;
        const qty = current.actual_qty != null ? Number(current.actual_qty) : null;
        const stoploss = current.planned_stoploss != null ? Number(current.planned_stoploss) : null;

        if (exitPrice != null && entryPrice != null && qty != null) {
          updateData.realized_pnl = (exitPrice - entryPrice) * qty;
          updateData.pnl_pct = (exitPrice - entryPrice) / entryPrice;
          updateData.r_multiple = computeRMultiple(exitPrice, entryPrice, stoploss);
        }
      }
    }

    // Scalar field updates (safe list)
    const scalarFields = [
      'setup', 'thesis_snapshot', 'market_regime_snapshot', 'market_score_snapshot',
      'market_action_snapshot', 'planned_entry', 'planned_target', 'planned_stoploss',
      'planned_qty', 'risk_per_trade_pct', 'account_size_snapshot', 'checklist',
      'actual_entry', 'actual_qty', 'entry_date',
      'exit_price', 'exit_date', 'followed_plan',
      'lessons', 'error_category', 'rating'
    ];
    for (const field of scalarFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    const data = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('trade_journal')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    });

    return createResponse(message, MESSAGE_TYPES.JOURNAL_UPDATED, { item: data, success: true });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'JOURNAL_UPDATE');
  }
});

/**
 * JOURNAL_DELETE — Delete a journal entry
 */
registerHandler(MESSAGE_TYPES.JOURNAL_DELETE, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { id } = message.data || {};

    if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'ID là bắt buộc');

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('trade_journal')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    });

    return createResponse(message, MESSAGE_TYPES.JOURNAL_DELETED, { id, success: true });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'JOURNAL_DELETE');
  }
});

// ============================================================================
// PREFILL HANDLER
// ============================================================================

/**
 * JOURNAL_GET_PREFILL — Return pre-fill data from watchlist + latest market assessment
 */
registerHandler(MESSAGE_TYPES.JOURNAL_GET_PREFILL, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { symbol, watchlist_id } = message.data || {};

    if (!symbol && !watchlist_id) {
      return createErrorResponse(message, 'VALIDATION_ERROR', 'symbol hoặc watchlist_id là bắt buộc');
    }

    // Fetch watchlist item
    let watchlistPrefill = null;
    let resolvedSymbol = symbol ? String(symbol).toUpperCase().trim() : null;

    if (watchlist_id) {
      const { data: wItem } = await supabase
        .from('watchlist')
        .select('id, symbol, investment_thesis, risk, entry, target, stoploss, pprofit, price')
        .eq('id', watchlist_id)
        .eq('user_id', userId)
        .single();

      if (wItem) {
        watchlistPrefill = wItem;
        resolvedSymbol = wItem.symbol;
      }
    }

    // Fetch latest market assessment for symbol
    let regimePrefill = null;
    if (resolvedSymbol) {
      const { data: maItem } = await supabase
        .from('market_assessment')
        .select('market_regime_state, market_regime_score, action, symbol_score, sector_score, sector_trend, as_of_date')
        .eq('user_id', userId)
        .eq('symbol', resolvedSymbol)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (maItem) regimePrefill = maItem;
    }

    // Fetch active checklist templates
    const { data: templates } = await supabase
      .from('checklist_templates')
      .select('rule_key, label, order_num')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('order_num', { ascending: true });

    const checklistTemplate = (templates && templates.length > 0)
      ? templates
      : DEFAULT_CHECKLIST_RULES.map(r => ({ ...r, is_default: true }));

    return createResponse(message, MESSAGE_TYPES.JOURNAL_PREFILL, {
      success: true,
      symbol: resolvedSymbol,
      watchlistPrefill,
      regimePrefill,
      checklistTemplate,
    });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'JOURNAL_GET_PREFILL');
  }
});

// ============================================================================
// METRICS & SUMMARY HANDLERS
// ============================================================================

/**
 * JOURNAL_GET_METRICS — Compute aggregate stats from closed/reviewed entries
 */
registerHandler(MESSAGE_TYPES.JOURNAL_GET_METRICS, async (message) => {
  try {
    const userId = await requireAuth(message);

    const entries = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('trade_journal')
        .select('pnl_pct, r_multiple, checklist, error_category, entry_date, status')
        .eq('user_id', userId)
        .in('status', ['closed', 'reviewed']);
      if (error) throw error;
      return data || [];
    });

    if (entries.length === 0) {
      return createResponse(message, MESSAGE_TYPES.JOURNAL_METRICS, {
        success: true,
        totalTrades: 0, winCount: 0, lossCount: 0, winRate: null,
        avgRMultiple: null, ruleAdherenceRate: null, topErrors: [], periodTrades: 0,
      });
    }

    const winCount = entries.filter(e => (e.pnl_pct || 0) > 0).length;
    const lossCount = entries.length - winCount;
    const winRate = entries.length > 0 ? winCount / entries.length : null;

    const validR = entries.filter(e => e.r_multiple != null).map(e => Number(e.r_multiple));
    const avgRMultiple = validR.length > 0
      ? validR.reduce((s, r) => s + r, 0) / validR.length
      : null;

    const withChecklist = entries.filter(e => e.checklist && Object.keys(e.checklist).length > 0);
    let ruleAdherenceRate = null;
    if (withChecklist.length > 0) {
      let total = 0, checked = 0;
      for (const e of withChecklist) {
        const vals = Object.values(e.checklist);
        total += vals.length;
        checked += vals.filter(Boolean).length;
      }
      ruleAdherenceRate = total > 0 ? checked / total : null;
    }

    const errorCounts = {};
    for (const e of entries) {
      if (e.error_category) {
        errorCounts[e.error_category] = (errorCounts[e.error_category] || 0) + 1;
      }
    }
    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const periodTrades = entries.filter(e => {
      if (!e.entry_date) return false;
      return new Date(e.entry_date) >= thirtyDaysAgo;
    }).length;

    return createResponse(message, MESSAGE_TYPES.JOURNAL_METRICS, {
      success: true,
      totalTrades: entries.length, winCount, lossCount, winRate,
      avgRMultiple, ruleAdherenceRate, topErrors, periodTrades,
    });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'JOURNAL_GET_METRICS');
  }
});

/**
 * JOURNAL_GET_SUMMARY — Lightweight summary for Dashboard widget
 */
registerHandler(MESSAGE_TYPES.JOURNAL_GET_SUMMARY, async (message) => {
  try {
    const userId = await requireAuth(message);

    const { data: entries, error } = await supabase
      .from('trade_journal')
      .select('status, pnl_pct, r_multiple, entry_date')
      .eq('user_id', userId);

    if (error) throw error;

    const items = entries || [];
    const openCount = items.filter(e => e.status === 'open').length;
    const plannedCount = items.filter(e => e.status === 'planned').length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = items.filter(e =>
      ['closed', 'reviewed'].includes(e.status) &&
      e.entry_date && new Date(e.entry_date) >= thirtyDaysAgo
    );
    const recentWinRate = recent.length > 0
      ? recent.filter(e => (e.pnl_pct || 0) > 0).length / recent.length
      : null;

    const validR = recent.filter(e => e.r_multiple != null).map(e => Number(e.r_multiple));
    const avgRMultiple = validR.length > 0
      ? validR.reduce((s, r) => s + r, 0) / validR.length
      : null;

    return createResponse(message, MESSAGE_TYPES.JOURNAL_SUMMARY, {
      success: true,
      openCount, plannedCount, recentWinRate, avgRMultiple,
    });
  } catch (error) {
    if (error.errorCode) return error;

    if (isTableNotFoundError(error)) {
      logger.warn('JOURNAL_GET_SUMMARY: trade_journal table not found, returning empty summary fallback');
      return createResponse(message, MESSAGE_TYPES.JOURNAL_SUMMARY, {
        success: true,
        openCount: 0,
        plannedCount: 0,
        recentWinRate: null,
        avgRMultiple: null,
      });
    }

    return handleSupabaseError(message, error, 'JOURNAL_GET_SUMMARY');
  }
});

// ============================================================================
// CHECKLIST TEMPLATE HANDLERS
// ============================================================================

/**
 * CHECKLIST_TEMPLATES_GET — Fetch user templates or return defaults
 */
registerHandler(MESSAGE_TYPES.CHECKLIST_TEMPLATES_GET, async (message) => {
  try {
    const userId = await requireAuth(message);

    const { data, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('user_id', userId)
      .order('order_num', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      const defaults = DEFAULT_CHECKLIST_RULES.map(r => ({ ...r, is_default: true, is_active: true }));
      return createResponse(message, MESSAGE_TYPES.CHECKLIST_TEMPLATES_DATA, {
        success: true, items: defaults, isDefault: true,
      });
    }

    return createResponse(message, MESSAGE_TYPES.CHECKLIST_TEMPLATES_DATA, {
      success: true, items: data, isDefault: false,
    });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'CHECKLIST_TEMPLATES_GET');
  }
});

/**
 * CHECKLIST_TEMPLATE_CREATE — Add a new rule to user's templates
 */
registerHandler(MESSAGE_TYPES.CHECKLIST_TEMPLATE_CREATE, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { rule_key, label, order_num = 0 } = message.data || {};

    if (!rule_key || !label) {
      return createErrorResponse(message, 'VALIDATION_ERROR', 'rule_key và label là bắt buộc');
    }

    const { data, error } = await supabase
      .from('checklist_templates')
      .insert({ user_id: userId, rule_key: String(rule_key).trim(), label: String(label).trim(), order_num })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return createErrorResponse(message, 'CONFLICT', `Rule "${rule_key}" đã tồn tại`);
      }
      throw error;
    }

    return createResponse(message, MESSAGE_TYPES.CHECKLIST_TEMPLATES_DATA, { success: true, item: data });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'CHECKLIST_TEMPLATE_CREATE');
  }
});

/**
 * CHECKLIST_TEMPLATE_UPDATE — Update label, is_active, or order_num
 */
registerHandler(MESSAGE_TYPES.CHECKLIST_TEMPLATE_UPDATE, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { id, updates } = message.data || {};

    if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'ID là bắt buộc');

    const updateData = { updated_at: new Date().toISOString() };
    if (updates.label !== undefined) updateData.label = String(updates.label).trim();
    if (updates.is_active !== undefined) updateData.is_active = Boolean(updates.is_active);
    if (updates.order_num !== undefined) updateData.order_num = Number(updates.order_num);

    const { data, error } = await supabase
      .from('checklist_templates')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return createResponse(message, MESSAGE_TYPES.CHECKLIST_TEMPLATES_DATA, { success: true, item: data });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'CHECKLIST_TEMPLATE_UPDATE');
  }
});

/**
 * CHECKLIST_TEMPLATE_DELETE — Remove a template rule
 */
registerHandler(MESSAGE_TYPES.CHECKLIST_TEMPLATE_DELETE, async (message) => {
  try {
    const userId = await requireAuth(message);
    const { id } = message.data || {};

    if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'ID là bắt buộc');

    const { error } = await supabase
      .from('checklist_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return createResponse(message, MESSAGE_TYPES.CHECKLIST_TEMPLATES_DATA, { success: true, id });
  } catch (error) {
    if (error.errorCode) return error;
    return handleSupabaseError(message, error, 'CHECKLIST_TEMPLATE_DELETE');
  }
});
