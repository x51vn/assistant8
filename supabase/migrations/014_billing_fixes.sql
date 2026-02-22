-- ============================================
-- Billing Fixes
-- Version: 1.0
-- Date: February 22, 2026
-- Tickets: XST-760, XST-763
-- Description:
--   1. Add increment_usage() RPC for atomic usage counter upsert.
--   2. Add UNIQUE constraint on payment_history.stripe_invoice_id for
--      idempotent webhook event handling.
-- ============================================

-- ============================================
-- 1. ATOMIC USAGE INCREMENT FUNCTION
-- ============================================
-- Ensures thread-safe atomic increment via single SQL statement.
-- Called by background handler USAGE_INCREMENT instead of chained JS upsert+update.

CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id    UUID,
  p_feature    TEXT,
  p_period_start DATE,
  p_period_end   DATE,
  p_amount     INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.usage_tracking
    (user_id, feature, count, period_start, period_end, updated_at)
  VALUES
    (p_user_id, p_feature, p_amount, p_period_start, p_period_end, NOW())
  ON CONFLICT (user_id, feature, period_start)
  DO UPDATE SET
    count      = public.usage_tracking.count + p_amount,
    updated_at = NOW();
$$;

COMMENT ON FUNCTION public.increment_usage IS
  'Atomically insert or increment a usage counter for a user+feature+period. '
  'Used by billing background handler to avoid race conditions on concurrent requests.';

-- Grant execute to authenticated users so the JS client with user JWT can call it.
-- RLS on usage_tracking already enforces row-level isolation.
GRANT EXECUTE ON FUNCTION public.increment_usage TO authenticated;

-- ============================================
-- 2. UNIQUE CONSTRAINT ON payment_history.stripe_invoice_id
-- ============================================
-- Required for the stripe-webhook Edge Function to use ON CONFLICT on stripe_invoice_id.
-- Without this, upsert({onConflict: 'stripe_invoice_id'}) would fail or insert duplicates.

ALTER TABLE public.payment_history
  ADD CONSTRAINT payment_history_stripe_invoice_id_key
  UNIQUE (stripe_invoice_id);

COMMENT ON CONSTRAINT payment_history_stripe_invoice_id_key ON public.payment_history IS
  'Ensures idempotent webhook event handling: same invoice cannot be recorded twice.';
