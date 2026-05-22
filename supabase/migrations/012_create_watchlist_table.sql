-- ============================================
-- Watchlist Table Migration
-- Version: 1.0
-- Date: February 11, 2026
-- Description: Create watchlist table with Supabase backend
-- ============================================

-- This script creates the watchlist table for tracking stock watch items

-- ============================================
-- 1. WATCHLIST TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL, -- Stock code (e.g., VNM, FPT)
  investment_thesis TEXT, -- Investment rationale
  risk TEXT, -- Risk level ("Thấp", "Trung bình", "Cao")
  entry DECIMAL(15, 2), -- Entry price
  target DECIMAL(15, 2), -- Target price
  stoploss DECIMAL(15, 2), -- Stop loss price
  notes TEXT, -- User notes
  price DECIMAL(15, 2), -- Current market price (readonly, for display)
  ediff DECIMAL(10, 4), -- (price - entry) / price percentage
  highlighted BOOLEAN DEFAULT FALSE, -- Marked as important
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints for prices
  CONSTRAINT entry_non_negative CHECK (entry IS NULL OR entry > 0),
  CONSTRAINT target_non_negative CHECK (target IS NULL OR target > 0),
  CONSTRAINT stoploss_non_negative CHECK (stoploss IS NULL OR stoploss > 0)
);

-- Add unique constraint only if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_symbol_per_user'
  ) THEN
    ALTER TABLE public.watchlist ADD CONSTRAINT unique_symbol_per_user UNIQUE(user_id, symbol);
  END IF;
END $$;

COMMENT ON TABLE public.watchlist IS 'Stock watchlist for investment tracking';
COMMENT ON COLUMN public.watchlist.symbol IS 'Stock ticker symbol (e.g., VNM, FPT)';
COMMENT ON COLUMN public.watchlist.investment_thesis IS 'Investment rationale and thesis';
COMMENT ON COLUMN public.watchlist.risk IS 'Risk level assessment (Thấp, Trung bình, Cao)';
COMMENT ON COLUMN public.watchlist.entry IS 'Entry price per share';
COMMENT ON COLUMN public.watchlist.target IS 'Target price for exit';
COMMENT ON COLUMN public.watchlist.stoploss IS 'Stop loss price for risk management';
COMMENT ON COLUMN public.watchlist.price IS 'Current market price (for display)';
COMMENT ON COLUMN public.watchlist.ediff IS 'Entry difference percentage: (price - entry) / price';
COMMENT ON COLUMN public.watchlist.highlighted IS 'Flag for important items';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON public.watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON public.watchlist(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_watchlist_highlighted ON public.watchlist(user_id, highlighted) WHERE highlighted = TRUE;
CREATE INDEX IF NOT EXISTS idx_watchlist_updated ON public.watchlist(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_created ON public.watchlist(user_id, created_at DESC);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - WATCHLIST TABLE
-- ============================================

CREATE POLICY "Users can view own watchlist"
  ON public.watchlist
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist items"
  ON public.watchlist
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist items"
  ON public.watchlist
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist items"
  ON public.watchlist
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGER FOR AUTO-UPDATED_AT
-- ============================================

CREATE TRIGGER set_updated_at_watchlist
  BEFORE UPDATE ON public.watchlist
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- END OF WATCHLIST MIGRATION
-- ============================================
