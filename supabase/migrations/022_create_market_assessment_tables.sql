-- ============================================
-- Market Daily Assessment Tables Migration
-- Version: 1.0
-- Date: March 3, 2026
-- Description: Create tables for daily market assessment feature
--   1. market_assessment — Flat per-symbol records (1 row = 1 symbol per run)
--   2. sectors — User-managed sector catalog for constrained classification
-- ============================================

-- ============================================
-- 1. SECTORS TABLE (user's sector catalog)
-- ============================================

CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sector_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT sectors_unique_per_user UNIQUE (user_id, sector_name)
);

COMMENT ON TABLE public.sectors IS 'User-managed sector catalog — constrained classification when active sectors exist';

CREATE INDEX IF NOT EXISTS idx_sectors_user_active ON public.sectors(user_id, is_active);

-- ============================================
-- 2. MARKET_ASSESSMENT TABLE (1 row per symbol per run)
-- ============================================

CREATE TABLE IF NOT EXISTS public.market_assessment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,

  -- Symbol info
  symbol TEXT NOT NULL,
  sector_name TEXT NOT NULL,

  -- Market regime
  market_regime_state TEXT NOT NULL,
  market_regime_score INTEGER NOT NULL,
  market_regime_explanation TEXT,

  -- Sector assessment
  sector_score INTEGER NOT NULL,
  sector_trend TEXT NOT NULL,
  sector_explanation TEXT,

  -- Symbol assessment
  symbol_score INTEGER NOT NULL,
  action TEXT NOT NULL,
  symbol_explanation TEXT,

  -- Metadata
  classification_mode TEXT NOT NULL DEFAULT 'AUTO',
  provider TEXT,
  raw_record JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT ma_unique_run_symbol UNIQUE (user_id, run_id, symbol),
  CONSTRAINT ma_valid_regime_state CHECK (market_regime_state IN ('ON', 'OFF')),
  CONSTRAINT ma_valid_regime_score CHECK (market_regime_score >= 0 AND market_regime_score <= 100),
  CONSTRAINT ma_valid_sector_score CHECK (sector_score >= 0 AND sector_score <= 100),
  CONSTRAINT ma_valid_sector_trend CHECK (sector_trend IN ('UP', 'NEUTRAL', 'DOWN')),
  CONSTRAINT ma_valid_symbol_score CHECK (symbol_score >= 0 AND symbol_score <= 100),
  CONSTRAINT ma_valid_action CHECK (action IN ('BUY', 'HOLD', 'SELL', 'WATCH')),
  CONSTRAINT ma_valid_classification CHECK (classification_mode IN ('AUTO', 'CONSTRAINED'))
);

COMMENT ON TABLE public.market_assessment IS 'Daily market assessment — one row per symbol per run, flat model';

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ma_user_date ON public.market_assessment(user_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_ma_user_symbol_date ON public.market_assessment(user_id, symbol, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_ma_user_sector_date ON public.market_assessment(user_id, sector_name, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_ma_user_runid ON public.market_assessment(user_id, run_id);

-- ============================================
-- RLS — sectors
-- ============================================

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sectors" ON public.sectors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sectors" ON public.sectors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sectors" ON public.sectors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sectors" ON public.sectors FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- RLS — market_assessment
-- ============================================

ALTER TABLE public.market_assessment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assessments" ON public.market_assessment FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assessments" ON public.market_assessment FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assessments" ON public.market_assessment FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assessments" ON public.market_assessment FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER set_updated_at_sectors
  BEFORE UPDATE ON public.sectors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_market_assessment
  BEFORE UPDATE ON public.market_assessment
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
