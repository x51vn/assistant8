/**
 * SubscriptionContext - Centralized billing/plan state management
 * Ticket: XST-761
 *
 * Provides:
 * - useSubscription() → { plan, subscription, status, loading, error }
 * - useFeatureGate(feature) → { allowed, limit, used, remaining, unlimited }
 * - usePlanUpgrade() → { upgrade(planId), openPortal, loading }
 *
 * Mirrors AuthContext pattern for consistency.
 */

import { createContext } from 'preact';
import { useState, useEffect, useContext, useCallback } from 'preact/hooks';
import { getSubscription, getPlans, getUsageStats, createCheckoutSession, createPortalSession } from '../api/billingApi.js';

// ============================================================================
// PLAN LIMITS (client-side mirror for fast UI rendering)
// Source of truth is Supabase plans.limits JSONB
// ============================================================================

const DEFAULT_FREE_PLAN = {
  id: 'free',
  name: 'Miễn phí',
  price_monthly: 0,
  limits: {
    portfolio_stocks: 5,
    watchlist_items: 10,
    ai_enrichment_monthly: 5,
    writing_prompts_monthly: 10,
    context_menu_monthly: 10,
    asset_types: 3,
    chat_history_days: 30,
    custom_prompts: 3
  },
  features: {
    jira_integration: false,
    confluence_upload: false,
    data_export: false,
    priority_support: false,
    team_workspace: false,
    market_indices: true,
    commodity_prices: true
  }
};

const UNLIMITED = -1;

export const SubscriptionContext = createContext(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function SubscriptionProvider({ children }) {
  const [plan, setPlan] = useState(DEFAULT_FREE_PLAN);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [upgrading, setUpgrading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subResult, plansResult, statsResult] = await Promise.all([
        getSubscription(),
        getPlans(),
        getUsageStats()
      ]);

      if (subResult.success) {
        setSubscription(subResult.subscription);
        setPlan(subResult.plan || DEFAULT_FREE_PLAN);
      } else {
        setError(subResult.error);
        setPlan(DEFAULT_FREE_PLAN);
      }

      if (plansResult.success) {
        setPlans(plansResult.plans);
      }

      if (statsResult.success) {
        setStats(statsResult.stats || {});
      }
    } catch (err) {
      console.error('[SubscriptionProvider] refresh failed:', err);
      setError('Không thể tải thông tin gói dịch vụ.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refresh();
  }, []);

  /**
   * Open Stripe Checkout for a plan upgrade.
   * @param {string} planId
   * @param {'monthly'|'yearly'} interval
   */
  const upgrade = useCallback(async (planId, interval = 'monthly') => {
    setUpgrading(true);
    try {
      const result = await createCheckoutSession(planId, interval);
      if (result.success && result.checkoutUrl) {
        // Open Stripe Checkout in a new tab
        await chrome.tabs.create({ url: result.checkoutUrl });
      } else {
        setError(result.error || 'Không thể mở trang thanh toán.');
      }
    } finally {
      setUpgrading(false);
    }
  }, []);

  /**
   * Open Stripe Customer Portal in a new tab.
   */
  const openPortal = useCallback(async () => {
    setUpgrading(true);
    try {
      const result = await createPortalSession();
      if (result.success && result.portalUrl) {
        await chrome.tabs.create({ url: result.portalUrl });
      } else {
        setError(result.error || 'Không thể mở trang quản lý thanh toán.');
      }
    } finally {
      setUpgrading(false);
    }
  }, []);

  const value = {
    plan,
    subscription,
    plans,
    stats,
    loading,
    error,
    upgrading,
    refresh,
    upgrade,
    openPortal
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get subscription + plan info
 */
export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}

/**
 * Check if a specific feature is allowed and get usage stats.
 * @param {string} feature - Feature key (e.g. 'ai_enrichment', 'watchlist_items')
 * @returns {{ allowed: boolean, limit: number, used: number, remaining: number, unlimited: boolean, percentUsed: number }}
 */
export function useFeatureGate(feature) {
  const { plan, stats } = useContext(SubscriptionContext) || {};

  if (!plan) {
    return { allowed: false, limit: 0, used: 0, remaining: 0, unlimited: false, percentUsed: 100 };
  }

  // Get limit from plan
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

  const limitKey = featureToLimitKey[feature] ?? feature;
  const limit = plan.limits?.[limitKey] ?? 0;
  const unlimited = limit === UNLIMITED;

  // Get usage from stats (only for usage-tracked features)
  const featureStat = stats?.[feature];
  const used = featureStat?.used ?? 0;

  if (unlimited) {
    return { allowed: true, limit: UNLIMITED, used, remaining: UNLIMITED, unlimited: true, percentUsed: 0 };
  }

  const allowed = used < limit;
  const remaining = Math.max(0, limit - used);
  const percentUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return { allowed, limit, used, remaining, unlimited: false, percentUsed };
}

/**
 * Check if a boolean feature is enabled for the current plan.
 * @param {string} featureFlag - Feature flag key (e.g. 'jira_integration')
 * @returns {boolean}
 */
export function usePlanFeature(featureFlag) {
  const { plan } = useContext(SubscriptionContext) || {};
  return !!(plan?.features?.[featureFlag]);
}

/**
 * Get upgrade helpers
 */
export function usePlanUpgrade() {
  const { upgrade, openPortal, upgrading, plan } = useContext(SubscriptionContext) || {};
  return {
    upgrade: upgrade || (() => {}),
    openPortal: openPortal || (() => {}),
    loading: upgrading || false,
    isFreePlan: plan?.id === 'free',
    isProPlan: plan?.id === 'pro',
    isEnterprisePlan: plan?.id === 'enterprise'
  };
}
