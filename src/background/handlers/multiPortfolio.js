/**
 * @fileoverview Multi-Portfolio Background Handler
 * Ticket: XST-779 — Multi-Portfolio Support
 *
 * Message types:
 *  PORTFOLIO_LIST_PORTFOLIOS   — list user's named portfolios
 *  PORTFOLIO_CREATE_PORTFOLIO  — create a new portfolio
 *  PORTFOLIO_UPDATE_PORTFOLIO  — rename/update a portfolio
 *  PORTFOLIO_DELETE_PORTFOLIO  — delete a portfolio (and its stocks)
 *  PORTFOLIO_SET_DEFAULT       — mark a portfolio as default
 *
 * The existing PORTFOLIO_GET/ADD/UPDATE/REMOVE handlers in portfolio.js
 * accept an optional `portfolio_id` field to scope operations.
 * If portfolio_id is omitted, they fall back to the default portfolio.
 */

import { registerHandler } from '../messageRouter.js';
import {
  MESSAGE_TYPES,
  createResponse,
  createErrorResponse,
} from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('MultiPortfolio');

const PLAN_LIMITS = { free: 1, pro: 3, enterprise: Infinity };

async function getPlanLimit(userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const planId = data?.plan_id || 'free';
  return { planId, limit: PLAN_LIMITS[planId] ?? PLAN_LIMITS.free };
}

/** Ensure user has a default portfolio; create one if not. Returns its UUID. */
async function ensureDefaultPortfolio(userId) {
  const { data: existing } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('portfolios')
    .insert({ user_id: userId, name: 'Default', is_default: true })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

// ============================================================
// PORTFOLIO_LIST_PORTFOLIOS
// ============================================================
registerHandler('PORTFOLIO_LIST_PORTFOLIOS', async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);

    const items = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('id, name, description, is_default, created_at, updated_at')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    }, { operationName: 'listPortfolios', correlationId });

    return createResponse(message, 'PORTFOLIO_PORTFOLIOS_DATA', { success: true, items });
  } catch (err) {
    logger.error('PORTFOLIO_LIST_PORTFOLIOS failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'PORTFOLIO_LIST_ERROR', err?.message || 'Lấy danh sách portfolio thất bại');
  }
});

// ============================================================
// PORTFOLIO_CREATE_PORTFOLIO
// ============================================================
registerHandler('PORTFOLIO_CREATE_PORTFOLIO', async (message) => {
  const correlationId = message.correlationId;
  const { name, description } = message;

  if (!name?.trim()) return createErrorResponse(message, 'VALIDATION_ERROR', 'Tên portfolio là bắt buộc');

  try {
    const userId = await requireAuth(message);
    const { planId, limit } = await getPlanLimit(userId);

    const { count } = await supabase
      .from('portfolios')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if ((count || 0) >= limit) {
      return createErrorResponse(
        message, 'PLAN_LIMIT',
        `Gói ${planId} giới hạn ${limit} portfolio. Nâng cấp để tạo thêm.`
      );
    }

    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .insert({ user_id: userId, name: name.trim(), description: description || null, is_default: false })
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'createPortfolio', correlationId });

    logger.info('Portfolio created', { name, correlationId });
    return createResponse(message, 'PORTFOLIO_PORTFOLIO_CREATED', { success: true, item });
  } catch (err) {
    logger.error('PORTFOLIO_CREATE_PORTFOLIO failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'PORTFOLIO_CREATE_ERROR', err?.message || 'Tạo portfolio thất bại');
  }
});

// ============================================================
// PORTFOLIO_UPDATE_PORTFOLIO
// ============================================================
registerHandler('PORTFOLIO_UPDATE_PORTFOLIO', async (message) => {
  const correlationId = message.correlationId;
  const { id, name, description } = message;
  if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu id');

  try {
    const userId = await requireAuth(message);
    const updates = { updated_at: new Date().toISOString() };
    if (name?.trim()) updates.name = name.trim();
    if (description !== undefined) updates.description = description;

    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'updatePortfolio', correlationId });

    return createResponse(message, 'PORTFOLIO_PORTFOLIO_UPDATED', { success: true, item });
  } catch (err) {
    logger.error('PORTFOLIO_UPDATE_PORTFOLIO failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'PORTFOLIO_UPDATE_ERROR', err?.message || 'Cập nhật portfolio thất bại');
  }
});

// ============================================================
// PORTFOLIO_DELETE_PORTFOLIO
// ============================================================
registerHandler('PORTFOLIO_DELETE_PORTFOLIO', async (message) => {
  const correlationId = message.correlationId;
  const { id } = message;
  if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu id');

  try {
    const userId = await requireAuth(message);

    // Prevent deleting default portfolio
    const { data: p } = await supabase
      .from('portfolios')
      .select('is_default')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!p) return createErrorResponse(message, 'NOT_FOUND', 'Portfolio không tìm thấy');
    if (p.is_default) return createErrorResponse(message, 'VALIDATION_ERROR', 'Không thể xóa portfolio mặc định');

    // Delete all stocks in this portfolio first
    await supabase.from('portfolio').delete().eq('portfolio_id', id).eq('user_id', userId);

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    }, { operationName: 'deletePortfolio', correlationId });

    return createResponse(message, 'PORTFOLIO_PORTFOLIO_DELETED', { success: true, id });
  } catch (err) {
    logger.error('PORTFOLIO_DELETE_PORTFOLIO failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'PORTFOLIO_DELETE_ERROR', err?.message || 'Xóa portfolio thất bại');
  }
});

// ============================================================
// PORTFOLIO_SET_DEFAULT
// ============================================================
registerHandler('PORTFOLIO_SET_DEFAULT', async (message) => {
  const correlationId = message.correlationId;
  const { id } = message;
  if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu id');

  try {
    const userId = await requireAuth(message);

    // Unset all defaults first
    await supabase.from('portfolios').update({ is_default: false }).eq('user_id', userId);

    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'setDefaultPortfolio', correlationId });

    return createResponse(message, 'PORTFOLIO_DEFAULT_SET', { success: true, item });
  } catch (err) {
    logger.error('PORTFOLIO_SET_DEFAULT failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'PORTFOLIO_SET_DEFAULT_ERROR', err?.message || 'Đặt portfolio mặc định thất bại');
  }
});
