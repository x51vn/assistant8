/**
 * @fileoverview Price Alert Background Handler
 * Ticket: XST-776 — Price Alert System
 *
 * Message types handled:
 *  ALERT_CREATE  — create a new price alert
 *  ALERT_LIST    — list all alerts for current user
 *  ALERT_DELETE  — delete an alert
 *  ALERT_TOGGLE  — enable/disable an alert
 *
 * Alert checking is triggered by XNEEWS_PRICE_UPDATE handler in supabasePriceUpdate.js
 * after each SSI price fetch; it calls checkPriceAlerts() exported from this module.
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

const logger = createLogger('PriceAlerts');

// ============================================================
// FREE PLAN LIMIT — max active alerts for free users
// ============================================================
const PLAN_LIMITS = { free: 3, pro: 20, enterprise: Infinity };

// ============================================================
// ALERT_LIST
// ============================================================
registerHandler('ALERT_LIST', async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const items = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('price_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }, { operationName: 'alertList', correlationId });

    return createResponse(message, 'ALERT_DATA', { success: true, items });
  } catch (err) {
    logger.error('ALERT_LIST failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'ALERT_LIST_ERROR', err?.message || 'Lấy danh sách cảnh báo thất bại');
  }
});

// ============================================================
// ALERT_CREATE
// ============================================================
registerHandler('ALERT_CREATE', async (message) => {
  const correlationId = message.correlationId;
  const { symbol, alert_type, target_value, note } = message.data || message;

  if (!symbol || !alert_type || target_value == null) {
    return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu thông tin: symbol, alert_type, target_value');
  }
  if (!['above', 'below', 'change_pct'].includes(alert_type)) {
    return createErrorResponse(message, 'VALIDATION_ERROR', 'alert_type phải là above, below hoặc change_pct');
  }

  try {
    const userId = await requireAuth(message);

    // Plan limit check
    const { count } = await supabase
      .from('price_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('enabled', true)
      .eq('triggered', false);

    // Get user plan from subscriptions
    const { data: subData } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    const planId = subData?.plan_id || 'free';
    const limit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free;

    if ((count || 0) >= limit) {
      return createErrorResponse(message, 'PLAN_LIMIT', `Gói ${planId} giới hạn ${limit} cảnh báo đang hoạt động. Nâng cấp để thêm.`);
    }

    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('price_alerts')
        .insert({
          user_id: userId,
          symbol: symbol.toUpperCase(),
          alert_type,
          target_value: Number(target_value),
          note: note || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'alertCreate', correlationId });

    logger.info('Alert created', { symbol, alert_type, target_value, correlationId });
    return createResponse(message, 'ALERT_CREATED', { success: true, item });
  } catch (err) {
    logger.error('ALERT_CREATE failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'ALERT_CREATE_ERROR', err?.message || 'Tạo cảnh báo thất bại');
  }
});

// ============================================================
// ALERT_DELETE
// ============================================================
registerHandler('ALERT_DELETE', async (message) => {
  const correlationId = message.correlationId;
  const { id } = message.data || message;
  if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu id');

  try {
    const userId = await requireAuth(message);
    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('price_alerts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    }, { operationName: 'alertDelete', correlationId });

    return createResponse(message, 'ALERT_DELETED', { success: true, id });
  } catch (err) {
    logger.error('ALERT_DELETE failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'ALERT_DELETE_ERROR', err?.message || 'Xóa cảnh báo thất bại');
  }
});

// ============================================================
// ALERT_TOGGLE (enable/disable)
// ============================================================
registerHandler('ALERT_TOGGLE', async (message) => {
  const correlationId = message.correlationId;
  const { id, enabled } = message.data || message;
  if (!id || enabled === undefined) {
    return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu id hoặc enabled');
  }

  try {
    const userId = await requireAuth(message);
    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('price_alerts')
        .update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'alertToggle', correlationId });

    return createResponse(message, 'ALERT_TOGGLED', { success: true, item });
  } catch (err) {
    logger.error('ALERT_TOGGLE failed', { error: err?.message, correlationId });
    return createErrorResponse(message, 'ALERT_TOGGLE_ERROR', err?.message || 'Cập nhật cảnh báo thất bại');
  }
});

// ============================================================
// checkPriceAlerts — called by supabasePriceUpdate after each fetch
// ============================================================

/**
 * Check all active alerts against updated prices and fire Chrome notification
 * for each triggered alert.
 *
 * @param {Record<string, number>} priceMap - { SYMBOL: currentPrice }
 */
export async function checkPriceAlerts(priceMap) {
  if (!priceMap || Object.keys(priceMap).length === 0) return;

  try {
    // Fetch all active, non-triggered alerts for symbols in priceMap
    const symbols = Object.keys(priceMap).map(s => s.toUpperCase());
    const { data: alerts, error } = await supabase
      .from('price_alerts')
      .select('*')
      .in('symbol', symbols)
      .eq('enabled', true)
      .eq('triggered', false);

    if (error || !alerts?.length) return;

    const triggered = [];
    for (const alert of alerts) {
      const price = priceMap[alert.symbol];
      if (price == null) continue;

      let hit = false;
      if (alert.alert_type === 'above' && price >= alert.target_value) hit = true;
      if (alert.alert_type === 'below' && price <= alert.target_value) hit = true;
      if (alert.alert_type === 'change_pct') {
        if (alert.current_value && alert.current_value > 0) {
          const pct = Math.abs((price - alert.current_value) / alert.current_value * 100);
          if (pct >= Math.abs(alert.target_value)) hit = true;
        }
      }

      if (hit) triggered.push({ ...alert, hit_price: price });
    }

    if (!triggered.length) return;

    // Mark as triggered in DB
    const ids = triggered.map(a => a.id);
    await supabase
      .from('price_alerts')
      .update({ triggered: true, triggered_at: new Date().toISOString(), current_value: null })
      .in('id', ids);

    // Fire Chrome notifications
    for (const alert of triggered) {
      const label = alert.alert_type === 'above' ? 'vượt' : alert.alert_type === 'below' ? 'xuống dưới' : 'thay đổi';
      const title = `Cảnh báo giá: ${alert.symbol}`;
      const message = `${alert.symbol} đã ${label} ${alert.target_value.toLocaleString('vi-VN')} (hiện tại: ${alert.hit_price.toLocaleString('vi-VN')})`;

      try {
        chrome.notifications.create(`alert-${alert.id}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title,
          message,
          priority: 2,
        });
      } catch (notifErr) {
        logger.warn('Notification failed', { error: notifErr?.message });
      }

      // Broadcast to UI via storage event (UI can listen for this)
      chrome.storage.local.set({
        [`alert_triggered_${alert.id}`]: {
          alertId: alert.id,
          symbol: alert.symbol,
          hitPrice: alert.hit_price,
          targetValue: alert.target_value,
          alertType: alert.alert_type,
          triggeredAt: new Date().toISOString(),
        }
      });
    }

    logger.info(`Triggered ${triggered.length} price alerts`, { symbols: triggered.map(a => a.symbol) });
  } catch (err) {
    logger.error('checkPriceAlerts failed', { error: err?.message });
  }
}
