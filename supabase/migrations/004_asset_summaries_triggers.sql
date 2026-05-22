-- Migration: Create asset_summaries table and triggers for real-time aggregation
-- Ticket: XST-702
-- Description: Real-time net worth aggregation using PostgreSQL triggers

-- ============================================
-- Table: asset_summaries
-- Pre-computed totals for fast reads, updated via triggers
-- ============================================
CREATE TABLE IF NOT EXISTS public.asset_summaries (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_portfolio DECIMAL(20, 2) DEFAULT 0, -- Sum from portfolio table
  total_assets DECIMAL(20, 2) DEFAULT 0,    -- Sum from assets table
  total_net_worth DECIMAL(20, 2) DEFAULT 0, -- Combined total
  portfolio_breakdown JSONB DEFAULT '{}',    -- Breakdown by stock
  assets_breakdown JSONB DEFAULT '{}',       -- Breakdown by asset_type
  last_portfolio_update TIMESTAMPTZ,
  last_assets_update TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.asset_summaries IS 'Pre-computed asset totals for fast reads';

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_asset_summaries_updated ON public.asset_summaries(updated_at DESC);

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================
ALTER TABLE public.asset_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================
CREATE POLICY "Users can view own summary" 
  ON public.asset_summaries FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own summary" 
  ON public.asset_summaries FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own summary" 
  ON public.asset_summaries FOR UPDATE 
  USING (auth.uid() = user_id);

-- ============================================
-- Function: Recalculate portfolio totals for a user
-- ============================================
CREATE OR REPLACE FUNCTION public.recalculate_portfolio_summary(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total DECIMAL(20, 2);
  v_breakdown JSONB;
BEGIN
  -- Calculate totals from portfolio table
  SELECT 
    COALESCE(SUM(COALESCE(current_price, avg_price) * quantity), 0),
    COALESCE(
      jsonb_object_agg(
        symbol, 
        jsonb_build_object(
          'quantity', quantity,
          'avg_price', avg_price,
          'current_price', COALESCE(current_price, avg_price),
          'value', COALESCE(current_price, avg_price) * quantity
        )
      ),
      '{}'::jsonb
    )
  INTO v_total, v_breakdown
  FROM public.portfolio
  WHERE user_id = p_user_id;

  -- Upsert into asset_summaries
  INSERT INTO public.asset_summaries (
    user_id, 
    total_portfolio, 
    portfolio_breakdown,
    last_portfolio_update,
    updated_at
  )
  VALUES (
    p_user_id, 
    v_total, 
    v_breakdown,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_portfolio = v_total,
    portfolio_breakdown = v_breakdown,
    total_net_worth = v_total + COALESCE(asset_summaries.total_assets, 0),
    last_portfolio_update = NOW(),
    updated_at = NOW();
    
  -- Update combined total
  UPDATE public.asset_summaries
  SET total_net_worth = total_portfolio + COALESCE(total_assets, 0)
  WHERE user_id = p_user_id;
END;
$$;

-- ============================================
-- Function: Recalculate assets totals for a user
-- ============================================
CREATE OR REPLACE FUNCTION public.recalculate_assets_summary(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total DECIMAL(20, 2);
  v_breakdown JSONB;
BEGIN
  -- Calculate totals from assets table (only active assets)
  SELECT 
    COALESCE(SUM(current_value), 0),
    COALESCE(
      jsonb_object_agg(
        asset_type,
        (
          SELECT COALESCE(SUM(current_value), 0)
          FROM public.assets a2
          WHERE a2.user_id = p_user_id 
            AND a2.is_active = true 
            AND a2.asset_type = a.asset_type
        )
      ),
      '{}'::jsonb
    )
  INTO v_total, v_breakdown
  FROM (
    SELECT DISTINCT asset_type 
    FROM public.assets 
    WHERE user_id = p_user_id AND is_active = true
  ) a,
  LATERAL (
    SELECT user_id, current_value 
    FROM public.assets 
    WHERE user_id = p_user_id AND is_active = true
  ) b;

  -- Better aggregation for breakdown
  SELECT 
    COALESCE(SUM(current_value), 0)
  INTO v_total
  FROM public.assets
  WHERE user_id = p_user_id AND is_active = true;

  SELECT 
    COALESCE(
      jsonb_object_agg(asset_type, type_total),
      '{}'::jsonb
    )
  INTO v_breakdown
  FROM (
    SELECT 
      asset_type, 
      SUM(current_value) as type_total
    FROM public.assets
    WHERE user_id = p_user_id AND is_active = true
    GROUP BY asset_type
  ) grouped;

  -- Upsert into asset_summaries
  INSERT INTO public.asset_summaries (
    user_id, 
    total_assets, 
    assets_breakdown,
    last_assets_update,
    updated_at
  )
  VALUES (
    p_user_id, 
    v_total, 
    v_breakdown,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_assets = v_total,
    assets_breakdown = v_breakdown,
    total_net_worth = COALESCE(asset_summaries.total_portfolio, 0) + v_total,
    last_assets_update = NOW(),
    updated_at = NOW();
    
  -- Update combined total
  UPDATE public.asset_summaries
  SET total_net_worth = COALESCE(total_portfolio, 0) + total_assets
  WHERE user_id = p_user_id;
END;
$$;

-- ============================================
-- Trigger Function: Portfolio changes
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_portfolio_summary_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_portfolio_summary(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_portfolio_summary(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$$;

-- ============================================
-- Trigger Function: Assets changes
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_assets_summary_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_assets_summary(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_assets_summary(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$$;

-- ============================================
-- Create Triggers on portfolio table
-- ============================================
DROP TRIGGER IF EXISTS trg_portfolio_summary_insert ON public.portfolio;
CREATE TRIGGER trg_portfolio_summary_insert
  AFTER INSERT ON public.portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_portfolio_summary_update();

DROP TRIGGER IF EXISTS trg_portfolio_summary_update ON public.portfolio;
CREATE TRIGGER trg_portfolio_summary_update
  AFTER UPDATE OF quantity, avg_price, current_price ON public.portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_portfolio_summary_update();

DROP TRIGGER IF EXISTS trg_portfolio_summary_delete ON public.portfolio;
CREATE TRIGGER trg_portfolio_summary_delete
  AFTER DELETE ON public.portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_portfolio_summary_update();

-- ============================================
-- Create Triggers on assets table
-- ============================================
DROP TRIGGER IF EXISTS trg_assets_summary_insert ON public.assets;
CREATE TRIGGER trg_assets_summary_insert
  AFTER INSERT ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_assets_summary_update();

DROP TRIGGER IF EXISTS trg_assets_summary_update ON public.assets;
CREATE TRIGGER trg_assets_summary_update
  AFTER UPDATE OF current_value, asset_type, is_active ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_assets_summary_update();

DROP TRIGGER IF EXISTS trg_assets_summary_delete ON public.assets;
CREATE TRIGGER trg_assets_summary_delete
  AFTER DELETE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_assets_summary_update();

-- ============================================
-- Backfill: Initialize summaries for existing users
-- ============================================
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Get all unique user_ids from portfolio and assets
  FOR r IN 
    SELECT DISTINCT user_id FROM public.portfolio
    UNION
    SELECT DISTINCT user_id FROM public.assets
  LOOP
    PERFORM public.recalculate_portfolio_summary(r.user_id);
    PERFORM public.recalculate_assets_summary(r.user_id);
  END LOOP;
END;
$$;

-- ============================================
-- Grant permissions for Edge Functions
-- ============================================
GRANT EXECUTE ON FUNCTION public.recalculate_portfolio_summary(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_assets_summary(UUID) TO service_role;
