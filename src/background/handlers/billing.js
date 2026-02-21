/**
 * @fileoverview Billing & Subscription Background Handler
 * Ticket: XST-759, XST-760, XST-758
 *
 * Handles:
 * - SUBSCRIPTION_GET: fetch user's current plan + subscription
 * - PLANS_GET: list all available plans
 * - SUBSCRIPTION_CREATE_CHECKOUT: create Stripe Checkout session via Edge Function
 * - SUBSCRIPTION_CREATE_PORTAL: open Stripe Customer Portal via Edge Function
 * - USAGE_CHECK: check if user is within plan limits for a feature
 * - USAGE_INCREMENT: record feature usage
 * - USAGE_GET_STATS: return all feature usage vs plan limits
 * - USAGE_RESET_DAILY: reset daily-scoped usage counters (alarm-driven)
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('BillingHandler');

// ============================================================================
// PLAN LIMITS CONSTANTS
// Sentinel value -1 = unlimited
// ============================================================================

const UNLIMITED = -1;

/**
 * Features that reset daily (vs monthly)
 */
const DAILY_FEATURES = new Set([/* reserved for future daily-reset features */]);

/**
 * Features that are monthly-scoped
 */
const MONTHLY_FEATURES = new Set([
  'ai_enrichment',
  'writing_prompts',
  'context_menu',
]);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the current billing period dates for a given scope.
 * @param {'daily'|'monthly'} scope
 * @returns {{ periodStart: string, periodEnd: string }} ISO date strings (YYYY-MM-DD)
 */
function getCurrentPeriod(scope = 'monthly') {
  const now = new Date();
  // Use UTC+7 (Vietnam) for period boundaries
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  if (scope === 'daily') {
    const today = vn.toISOString().split('T')[0];
    return { periodStart: today, periodEnd: today };
  }

  // Monthly: first → last day of current month
  const year = vn.getUTCFullYear();
  const month = vn.getUTCMonth(); // 0-indexed
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return {
    periodStart: firstDay.toISOString().split('T')[0],
    periodEnd: lastDay.toISOString().split('T')[0]
  };
}

/**
 * Fetch the user's subscription + associated plan.
 * Always returns a result: falls back to Free plan if no subscription found.
 */
async function fetchUserSubscription(userId, correlationId) {
  const row = await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, plan:plan_id(*)')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { operationName: 'subscription.get', correlationId }
  );

  if (row) return row;

  // Fallback: no subscription row → return free plan
  const freePlan = await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', 'free')
        .single();
      if (error) throw error;
      return data;
    },
    { operationName: 'plans.getFree', correlationId }
  );

  return {
    id: null,
    user_id: userId,
    plan_id: 'free',
    status: 'active',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    plan: freePlan
  };
}

/**
 * Get usage count for a user+feature in the current period.
 */
async function getFeatureUsage(userId, feature, correlationId) {
  const scope = DAILY_FEATURES.has(feature) ? 'daily' : 'monthly';
  const { periodStart } = getCurrentPeriod(scope);

  const row = await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('usage_tracking')
        .select('count')
        .eq('user_id', userId)
        .eq('feature', feature)
        .eq('period_start', periodStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { operationName: 'usage.get', correlationId }
  );

  return row?.count ?? 0;
}

/**
 * Get the limit for a feature from a plan's limits JSONB.
 * Maps feature key → plan.limits key.
 */
function getFeatureLimit(plan, feature) {
  if (!plan?.limits) return 0;
  const limits = plan.limits;

  const featureToLimitKey = {
    ai_enrichment: 'ai_enrichment_monthly',
    writing_prompts: 'writing_prompts_monthly',
    context_menu: 'context_menu_monthly',
    portfolio_stocks: 'portfolio_stocks',
    watchlist_items: 'watchlist_items',
    asset_types: 'asset_types',
    custom_prompts: 'custom_prompts',
    chat_history_days: 'chat_history_days',
  };

  const key = featureToLimitKey[feature] ?? feature;
  const val = limits[key];
  return typeof val === 'number' ? val : 0;
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * SUBSCRIPTION_GET — fetch current plan + subscription info
 */
registerHandler(MESSAGE_TYPES.SUBSCRIPTION_GET, async (message) => {
  const correlationId = logger.startOperation('getSubscription', message.correlationId);

  try {
    const userId = await requireAuth(message);
    const subscription = await fetchUserSubscription(userId, correlationId);

    return createResponse(message, MESSAGE_TYPES.SUBSCRIPTION_DATA, {
      success: true,
      subscription: {
        id: subscription.id,
        planId: subscription.plan_id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        stripeCustomerId: subscription.stripe_customer_id,
        stripeSubscriptionId: subscription.stripe_subscription_id,
      },
      plan: subscription.plan
    });
  } catch (error) {
    logger.error('getSubscription failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    return createErrorResponse(
      message,
      ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
      getUserFriendlyMessage(ERROR_CODES.SUBSCRIPTION_NOT_FOUND)
    );
  }
});

/**
 * PLANS_GET — list all active plans
 */
registerHandler(MESSAGE_TYPES.PLANS_GET, async (message) => {
  const correlationId = logger.startOperation('getPlans', message.correlationId);

  try {
    const plans = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (error) throw error;
        return data;
      },
      { operationName: 'plans.getAll', correlationId }
    );

    return createResponse(message, MESSAGE_TYPES.PLANS_DATA, {
      success: true,
      plans: plans ?? []
    });
  } catch (error) {
    logger.error('getPlans failed', { correlationId, errorMessage: error?.message });
    return createErrorResponse(
      message,
      ERROR_CODES.PLAN_NOT_FOUND,
      getUserFriendlyMessage(ERROR_CODES.PLAN_NOT_FOUND)
    );
  }
});

/**
 * SUBSCRIPTION_CREATE_CHECKOUT — create Stripe Checkout Session via Edge Function
 */
registerHandler(MESSAGE_TYPES.SUBSCRIPTION_CREATE_CHECKOUT, async (message) => {
  const correlationId = logger.startOperation('createCheckout', message.correlationId);

  try {
    const userId = await requireAuth(message);
    const { planId, interval = 'monthly', successUrl, cancelUrl } = message.data || {};

    if (!planId) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Thiếu thông tin gói dịch vụ.'
      );
    }

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { planId, interval, userId, successUrl, cancelUrl }
    });

    if (error) {
      logger.error('create-checkout-session Edge Function error', {
        correlationId,
        errorMessage: error?.message
      });
      return createErrorResponse(
        message,
        ERROR_CODES.CHECKOUT_FAILED,
        getUserFriendlyMessage(ERROR_CODES.CHECKOUT_FAILED)
      );
    }

    return createResponse(message, MESSAGE_TYPES.SUBSCRIPTION_CHECKOUT_URL, {
      success: true,
      checkoutUrl: data?.url
    });
  } catch (error) {
    logger.error('createCheckout failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    return createErrorResponse(
      message,
      ERROR_CODES.CHECKOUT_FAILED,
      getUserFriendlyMessage(ERROR_CODES.CHECKOUT_FAILED)
    );
  }
});

/**
 * SUBSCRIPTION_CREATE_PORTAL — create Stripe Customer Portal session via Edge Function
 */
registerHandler(MESSAGE_TYPES.SUBSCRIPTION_CREATE_PORTAL, async (message) => {
  const correlationId = logger.startOperation('createPortal', message.correlationId);

  try {
    const userId = await requireAuth(message);
    const { returnUrl } = message.data || {};

    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      body: { userId, returnUrl }
    });

    if (error) {
      logger.error('create-portal-session Edge Function error', {
        correlationId,
        errorMessage: error?.message
      });
      return createErrorResponse(
        message,
        ERROR_CODES.PORTAL_FAILED,
        getUserFriendlyMessage(ERROR_CODES.PORTAL_FAILED)
      );
    }

    return createResponse(message, MESSAGE_TYPES.SUBSCRIPTION_PORTAL_URL, {
      success: true,
      portalUrl: data?.url
    });
  } catch (error) {
    logger.error('createPortal failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    return createErrorResponse(
      message,
      ERROR_CODES.PORTAL_FAILED,
      getUserFriendlyMessage(ERROR_CODES.PORTAL_FAILED)
    );
  }
});

// ============================================================================
// USAGE TRACKING (XST-760)
// ============================================================================

/**
 * USAGE_CHECK — verify if a user can use a feature (within plan limits)
 */
registerHandler(MESSAGE_TYPES.USAGE_CHECK, async (message) => {
  const correlationId = logger.startOperation('checkUsage', message.correlationId);

  try {
    const userId = await requireAuth(message);
    const { feature } = message.data || {};

    if (!feature) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Thiếu tên tính năng.');
    }

    const subscription = await fetchUserSubscription(userId, correlationId);
    const plan = subscription.plan;
    const limit = getFeatureLimit(plan, feature);

    // Unlimited
    if (limit === UNLIMITED) {
      return createResponse(message, MESSAGE_TYPES.USAGE_ALLOWED, {
        success: true,
        allowed: true,
        feature,
        limit: UNLIMITED,
        used: 0,
        remaining: UNLIMITED
      });
    }

    const used = await getFeatureUsage(userId, feature, correlationId);
    const allowed = used < limit;
    const remaining = Math.max(0, limit - used);

    logger.info('Usage check', { correlationId, feature, used, limit, allowed });

    if (!allowed) {
      return createResponse(message, MESSAGE_TYPES.USAGE_ALLOWED, {
        success: true,
        allowed: false,
        feature,
        limit,
        used,
        remaining: 0,
        upgradeMessage: `Bạn đã hết lượt sử dụng ${feature}. Nâng cấp Pro để tiếp tục.`,
        planId: plan?.id
      });
    }

    return createResponse(message, MESSAGE_TYPES.USAGE_ALLOWED, {
      success: true,
      allowed: true,
      feature,
      limit,
      used,
      remaining
    });
  } catch (error) {
    logger.error('checkUsage failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    // On lookup error, fail open (allow usage) to prevent blocking users
    return createResponse(message, MESSAGE_TYPES.USAGE_ALLOWED, {
      success: false,
      allowed: true,
      feature: (message.data || {}).feature,
      errorMessage: error?.message
    });
  }
});

/**
 * USAGE_INCREMENT — record that a feature was used (+1 to count)
 */
registerHandler(MESSAGE_TYPES.USAGE_INCREMENT, async (message) => {
  const correlationId = logger.startOperation('incrementUsage', message.correlationId);

  try {
    const userId = await requireAuth(message);
    const { feature, amount = 1 } = message.data || {};

    if (!feature) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Thiếu tên tính năng.');
    }

    const scope = DAILY_FEATURES.has(feature) ? 'daily' : 'monthly';
    const { periodStart, periodEnd } = getCurrentPeriod(scope);

    const { data, error } = await supabase
      .from('usage_tracking')
      .upsert(
        {
          user_id: userId,
          feature,
          count: amount,
          period_start: periodStart,
          period_end: periodEnd,
        },
        {
          onConflict: 'user_id,feature,period_start',
          // Increment: use raw SQL expression via RPC alternative pattern
          ignoreDuplicates: false
        }
      )
      .select('count')
      .single();

    // If upsert returned an existing row, we need to increment manually
    // (Supabase JS doesn't support increment directly in upsert)
    if (!error && data) {
      // Row existed → increment using update
      await supabase
        .from('usage_tracking')
        .update({ count: data.count + amount })
        .eq('user_id', userId)
        .eq('feature', feature)
        .eq('period_start', periodStart);
    }

    logger.info('Usage incremented', { correlationId, feature, amount, periodStart });

    return createResponse(message, MESSAGE_TYPES.USAGE_INCREMENTED, {
      success: true,
      feature,
      amount,
      periodStart
    });
  } catch (error) {
    logger.error('incrementUsage failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    // Non-fatal: don't block user if usage tracking fails
    return createResponse(message, MESSAGE_TYPES.USAGE_INCREMENTED, {
      success: false,
      feature: (message.data || {}).feature,
      errorMessage: error?.message
    });
  }
});

/**
 * USAGE_GET_STATS — return all feature usage vs plan limits for current period
 */
registerHandler(MESSAGE_TYPES.USAGE_GET_STATS, async (message) => {
  const correlationId = logger.startOperation('getUsageStats', message.correlationId);

  try {
    const userId = await requireAuth(message);
    const subscription = await fetchUserSubscription(userId, correlationId);
    const plan = subscription.plan;

    // All tracked features
    const trackedFeatures = [
      'ai_enrichment',
      'writing_prompts',
      'context_menu',
    ];

    const { periodStart, periodEnd } = getCurrentPeriod('monthly');

    // Fetch all usage rows for this period
    const usageRows = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('usage_tracking')
          .select('feature, count')
          .eq('user_id', userId)
          .eq('period_start', periodStart);
        if (error) throw error;
        return data ?? [];
      },
      { operationName: 'usage.getStats', correlationId }
    );

    const usageMap = {};
    for (const row of usageRows) {
      usageMap[row.feature] = row.count;
    }

    const stats = {};
    for (const feature of trackedFeatures) {
      const limit = getFeatureLimit(plan, feature);
      const used = usageMap[feature] ?? 0;
      stats[feature] = {
        used,
        limit,
        remaining: limit === UNLIMITED ? UNLIMITED : Math.max(0, limit - used),
        unlimited: limit === UNLIMITED
      };
    }

    return createResponse(message, MESSAGE_TYPES.USAGE_STATS, {
      success: true,
      stats,
      periodStart,
      periodEnd,
      planId: plan?.id
    });
  } catch (error) {
    logger.error('getUsageStats failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    return createErrorResponse(
      message,
      ERROR_CODES.OPERATION_FAILED,
      getUserFriendlyMessage(ERROR_CODES.OPERATION_FAILED)
    );
  }
});

/**
 * USAGE_RESET_DAILY — triggered by alarm to reset daily usage counters
 * (currently a no-op since we scope by period_start date; counts auto-reset
 *  when period_start changes. Kept for future explicit reset needs.)
 */
registerHandler(MESSAGE_TYPES.USAGE_RESET_DAILY, async (message) => {
  logger.info('Daily usage reset triggered (period-based, auto-reset via date scoping)');
  return createResponse(message, MESSAGE_TYPES.USAGE_INCREMENTED, {
    success: true,
    message: 'Daily period reset handled by date scoping'
  });
});
