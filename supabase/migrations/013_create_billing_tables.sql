-- ============================================
-- Billing & Subscription Tables
-- Version: 1.0
-- Date: February 21, 2026
-- Ticket: XST-758
-- Description: Plans, subscriptions, usage tracking, payment history
-- ============================================

-- ============================================
-- 1. PLANS TABLE (public, no RLS needed - read-only for users)
-- ============================================

CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,                          -- 'free', 'pro', 'enterprise'
  name TEXT NOT NULL,                           -- Display name
  price_monthly NUMERIC(10, 2) DEFAULT 0,       -- Monthly price in USD
  price_yearly NUMERIC(10, 2) DEFAULT 0,        -- Yearly price in USD (discounted)
  currency TEXT NOT NULL DEFAULT 'USD',
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,     -- Feature quantity limits
  features JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Boolean feature flags
  stripe_price_id_monthly TEXT,                  -- Stripe Price ID for monthly billing
  stripe_price_id_yearly TEXT,                   -- Stripe Price ID for yearly billing
  display_order INTEGER NOT NULL DEFAULT 0,      -- Sort order in UI
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plans are public read-only (anyone can see pricing)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_all" ON public.plans
  FOR SELECT USING (true);

-- Only service_role can modify plans
CREATE POLICY "plans_admin_only" ON public.plans
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.plans IS 'Subscription plan definitions with feature limits and Stripe price IDs';
COMMENT ON COLUMN public.plans.limits IS 'JSON: { portfolio_stocks, watchlist_items, ai_enrichment_monthly, writing_prompts_monthly, context_menu_monthly, asset_types, chat_history_days, custom_prompts }';
COMMENT ON COLUMN public.plans.features IS 'JSON: { jira_integration, confluence_upload, data_export, priority_support, team_workspace, api_access }';

-- ============================================
-- 2. SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired', 'incomplete')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each user has at most one active subscription
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_user
  ON public.subscriptions (user_id)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON public.subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

-- RLS: Users can only read/modify their own subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Inserts & updates handled by Edge Functions with service_role
-- Users should NOT directly modify subscriptions (Stripe webhooks handle this)
CREATE POLICY "subscriptions_service_role_manage" ON public.subscriptions
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.subscriptions IS 'User subscription records linked to Stripe';

-- ============================================
-- 3. USAGE TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One record per user + feature + period
  CONSTRAINT unique_usage_per_period UNIQUE (user_id, feature, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_feature
  ON public.usage_tracking (user_id, feature);

CREATE INDEX IF NOT EXISTS idx_usage_period
  ON public.usage_tracking (period_start, period_end);

-- RLS: Users can see and increment their own usage
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_select_own" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_insert_own" ON public.usage_tracking
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "usage_update_own" ON public.usage_tracking
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.usage_tracking IS 'Per-feature usage counts per billing period for limit enforcement';
COMMENT ON COLUMN public.usage_tracking.feature IS 'Feature key: ai_enrichment, writing_prompts, context_menu, etc.';

-- ============================================
-- 4. PAYMENT HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_invoice_id TEXT,
  amount INTEGER NOT NULL,                     -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('succeeded', 'failed', 'pending', 'refunded')),
  description TEXT,
  plan_id TEXT REFERENCES public.plans(id),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user
  ON public.payment_history (user_id);

CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent
  ON public.payment_history (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_created
  ON public.payment_history (created_at DESC);

-- RLS: Users can only view their own payment history
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own" ON public.payment_history
  FOR SELECT USING (auth.uid() = user_id);

-- Inserts handled by Edge Functions (webhook) with service_role
CREATE POLICY "payments_service_role_manage" ON public.payment_history
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.payment_history IS 'Payment records from Stripe for billing history display';

-- ============================================
-- 5. SEED DATA: Plans
-- ============================================

INSERT INTO public.plans (id, name, price_monthly, price_yearly, currency, limits, features, display_order, is_active)
VALUES
  (
    'free',
    'Miễn phí',
    0, 0, 'USD',
    '{
      "portfolio_stocks": 5,
      "watchlist_items": 10,
      "ai_enrichment_monthly": 5,
      "writing_prompts_monthly": 10,
      "context_menu_monthly": 10,
      "asset_types": 3,
      "chat_history_days": 30,
      "custom_prompts": 3
    }'::jsonb,
    '{
      "jira_integration": false,
      "confluence_upload": false,
      "data_export": false,
      "priority_support": false,
      "team_workspace": false,
      "api_access": false,
      "market_indices": true,
      "commodity_prices": true
    }'::jsonb,
    1, true
  ),
  (
    'pro',
    'Pro',
    4.99, 49.90, 'USD',
    '{
      "portfolio_stocks": 50,
      "watchlist_items": 100,
      "ai_enrichment_monthly": 100,
      "writing_prompts_monthly": 200,
      "context_menu_monthly": 200,
      "asset_types": 8,
      "chat_history_days": 365,
      "custom_prompts": 13
    }'::jsonb,
    '{
      "jira_integration": true,
      "confluence_upload": true,
      "data_export": true,
      "priority_support": true,
      "team_workspace": false,
      "api_access": false,
      "market_indices": true,
      "commodity_prices": true
    }'::jsonb,
    2, true
  ),
  (
    'enterprise',
    'Enterprise',
    14.99, 149.90, 'USD',
    '{
      "portfolio_stocks": -1,
      "watchlist_items": -1,
      "ai_enrichment_monthly": -1,
      "writing_prompts_monthly": -1,
      "context_menu_monthly": -1,
      "asset_types": -1,
      "chat_history_days": -1,
      "custom_prompts": -1
    }'::jsonb,
    '{
      "jira_integration": true,
      "confluence_upload": true,
      "data_export": true,
      "priority_support": true,
      "team_workspace": true,
      "api_access": true,
      "market_indices": true,
      "commodity_prices": true
    }'::jsonb,
    3, true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================
-- 6. AUTO-PROVISION FREE SUBSCRIPTION
-- ============================================
-- When a new user signs up, they get a Free plan subscription automatically.
-- Implemented via a trigger function.

CREATE OR REPLACE FUNCTION public.provision_free_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start)
  VALUES (NEW.id, 'free', 'active', NOW())
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Fire on new user creation in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_provision_sub ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_sub
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_free_subscription();

COMMENT ON FUNCTION public.provision_free_subscription IS 'Auto-creates a Free plan subscription for new users';

-- ============================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_usage_updated_at
  BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
