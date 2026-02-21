/**
 * Billing API - Background communication layer
 * XST-758, XST-759, XST-760, XST-761, XST-762
 *
 * UI → chrome.runtime.sendMessage → background billing handler → Supabase/Stripe
 *
 * Note: createResponse() spreads payload directly.
 * Access response.subscription, response.plans, etc. (NOT response.data.xxx)
 */

import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { generateCorrelationId } from '../../logger.js';

// ============================================================================
// SUBSCRIPTION
// ============================================================================

/**
 * Get current user's subscription + plan info.
 * @returns {Promise<{success: boolean, subscription: Object, plan: Object, error?: string}>}
 */
export async function getSubscription() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUBSCRIPTION_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode || response.error) {
      return { success: false, error: response.errorMessage || 'Không thể tải thông tin gói.' };
    }

    return {
      success: true,
      subscription: response.subscription,
      plan: response.plan
    };
  } catch (error) {
    console.error('[BillingAPI] getSubscription failed:', error);
    return { success: false, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

/**
 * Get all available plans.
 * @returns {Promise<{success: boolean, plans: Array, error?: string}>}
 */
export async function getPlans() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PLANS_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode || response.error) {
      return { success: false, plans: [], error: response.errorMessage };
    }

    return { success: true, plans: response.plans || [] };
  } catch (error) {
    console.error('[BillingAPI] getPlans failed:', error);
    return { success: false, plans: [], error: 'Không thể tải gói dịch vụ.' };
  }
}

/**
 * Create Stripe Checkout session for upgrading.
 * @param {string} planId - Target plan ('pro' | 'enterprise')
 * @param {'monthly'|'yearly'} interval
 * @returns {Promise<{success: boolean, checkoutUrl: string|null, error?: string}>}
 */
export async function createCheckoutSession(planId, interval = 'monthly') {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUBSCRIPTION_CREATE_CHECKOUT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { planId, interval }
    });

    if (response.errorCode || response.error) {
      return { success: false, checkoutUrl: null, error: response.errorMessage || 'Không thể tạo phiên thanh toán.' };
    }

    return { success: true, checkoutUrl: response.checkoutUrl };
  } catch (error) {
    console.error('[BillingAPI] createCheckoutSession failed:', error);
    return { success: false, checkoutUrl: null, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

/**
 * Create Stripe Customer Portal session for managing billing.
 * @returns {Promise<{success: boolean, portalUrl: string|null, error?: string}>}
 */
export async function createPortalSession() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.SUBSCRIPTION_CREATE_PORTAL,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode || response.error) {
      return { success: false, portalUrl: null, error: response.errorMessage || 'Không thể mở trang quản lý.' };
    }

    return { success: true, portalUrl: response.portalUrl };
  } catch (error) {
    console.error('[BillingAPI] createPortalSession failed:', error);
    return { success: false, portalUrl: null, error: 'Không thể kết nối. Vui lòng thử lại.' };
  }
}

// ============================================================================
// USAGE
// ============================================================================

/**
 * Check if the user can use a feature (within plan limits).
 * @param {string} feature - Feature key (e.g. 'ai_enrichment')
 * @returns {Promise<{allowed: boolean, limit: number, used: number, remaining: number, upgradeMessage?: string}>}
 */
export async function checkUsage(feature) {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.USAGE_CHECK,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { feature }
    });

    // Fail open: if check fails, allow usage
    return {
      allowed: response.allowed ?? true,
      limit: response.limit ?? -1,
      used: response.used ?? 0,
      remaining: response.remaining ?? -1,
      upgradeMessage: response.upgradeMessage
    };
  } catch (error) {
    console.error('[BillingAPI] checkUsage failed:', error);
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }
}

/**
 * Increment usage count for a feature.
 * Fire-and-forget. Non-blocking — does not throw.
 * @param {string} feature - Feature key
 * @param {number} [amount=1] - How much to increment
 */
export async function incrementUsage(feature, amount = 1) {
  try {
    await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.USAGE_INCREMENT,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: { feature, amount }
    });
  } catch (error) {
    console.warn('[BillingAPI] incrementUsage failed (non-fatal):', error);
  }
}

/**
 * Get all usage stats for the current billing period.
 * @returns {Promise<{success: boolean, stats: Object, periodStart: string, periodEnd: string, planId: string}>}
 */
export async function getUsageStats() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.USAGE_GET_STATS,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });

    if (response.errorCode || response.error) {
      return { success: false, stats: {}, error: response.errorMessage };
    }

    return {
      success: true,
      stats: response.stats || {},
      periodStart: response.periodStart,
      periodEnd: response.periodEnd,
      planId: response.planId
    };
  } catch (error) {
    console.error('[BillingAPI] getUsageStats failed:', error);
    return { success: false, stats: {}, error: 'Không thể tải thống kê sử dụng.' };
  }
}
