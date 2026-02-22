-- ============================================
-- Stock Research Pipeline Tables Migration
-- Version: 1.0
-- Date: February 22, 2026
-- Description: Create tables for the unified stock research pipeline
-- Ticket: XST-789
-- ADR: docs/adr/ADR-001-unified-stock-research-pipeline.md
-- Spec: docs/specs/stock-research-message-schema.md
-- ============================================

-- This script creates:
--   1. stock_research_runs   — One row per research execution
--   2. stock_research_sources — Search results linked to a run
--   3. stock_research_insights — LLM-generated analysis output

-- ============================================
-- 1. STOCK_RESEARCH_RUNS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.stock_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,                        -- Stock ticker (e.g., FPT, VNM)
  mode TEXT NOT NULL DEFAULT 'stock-research', -- 'stock-research' | 'watchlist-enrich' | 'portfolio-eval'
  provider TEXT NOT NULL,                      -- AI provider used (gemini, chatgpt, claude)
  status TEXT NOT NULL DEFAULT 'queued',       -- queued | validating | retrieving | ranking | evaluating | validating_output | persisting | done | failed
  search_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  options JSONB DEFAULT '{}',                  -- Merged run options snapshot
  error_code TEXT,                             -- Error code if status='failed'
  error_message TEXT,                          -- Human-readable error message
  failed_step TEXT,                            -- Pipeline step where failure occurred
  timing JSONB DEFAULT '{}',                   -- { search_ms, analyze_ms, validate_ms, persist_ms, total_ms }
  source_count INTEGER DEFAULT 0,             -- Number of sources found
  started_at TIMESTAMPTZ,                      -- When execution started
  finished_at TIMESTAMPTZ,                     -- When execution finished (success or failure)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_mode CHECK (mode IN ('stock-research', 'watchlist-enrich', 'portfolio-eval')),
  CONSTRAINT valid_status CHECK (status IN ('queued', 'validating', 'retrieving', 'ranking', 'evaluating', 'validating_output', 'persisting', 'done', 'failed')),
  CONSTRAINT valid_provider CHECK (provider IN ('gemini', 'chatgpt', 'claude'))
);

COMMENT ON TABLE public.stock_research_runs IS 'Research pipeline execution records — one row per analysis run';
COMMENT ON COLUMN public.stock_research_runs.symbol IS 'Stock ticker symbol (e.g., FPT, VNM)';
COMMENT ON COLUMN public.stock_research_runs.mode IS 'Pipeline mode: stock-research, watchlist-enrich, portfolio-eval';
COMMENT ON COLUMN public.stock_research_runs.provider IS 'AI provider: gemini, chatgpt, or claude';
COMMENT ON COLUMN public.stock_research_runs.status IS 'Current pipeline status. Terminal states: done, failed';
COMMENT ON COLUMN public.stock_research_runs.options IS 'Snapshot of merged run options (user settings + request overrides)';
COMMENT ON COLUMN public.stock_research_runs.timing IS 'Per-step timing breakdown in milliseconds';
COMMENT ON COLUMN public.stock_research_runs.source_count IS 'Number of search sources retrieved';

-- ============================================
-- 2. STOCK_RESEARCH_SOURCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.stock_research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.stock_research_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT,
  source_type TEXT DEFAULT 'news',             -- news | blog | forum | official | research
  published_at TIMESTAMPTZ,
  score DECIMAL(5, 4) DEFAULT 0,               -- Relevance score 0.0000–1.0000
  credibility TEXT DEFAULT 'medium',           -- high | medium | low
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_source_type CHECK (source_type IN ('news', 'blog', 'forum', 'official', 'research')),
  CONSTRAINT valid_credibility CHECK (credibility IN ('high', 'medium', 'low')),
  CONSTRAINT score_range CHECK (score >= 0 AND score <= 1)
);

COMMENT ON TABLE public.stock_research_sources IS 'Search results collected during a research run';
COMMENT ON COLUMN public.stock_research_sources.run_id IS 'FK to the parent stock_research_runs record';
COMMENT ON COLUMN public.stock_research_sources.source_type IS 'Source category: news, blog, forum, official, research';
COMMENT ON COLUMN public.stock_research_sources.score IS 'Relevance/ranking score (0.0–1.0)';
COMMENT ON COLUMN public.stock_research_sources.credibility IS 'Source credibility: high, medium, low';

-- ============================================
-- 3. STOCK_RESEARCH_INSIGHTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.stock_research_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.stock_research_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL,                -- BUY | HOLD | SELL | WATCH
  confidence INTEGER NOT NULL,                 -- 0–100
  target_price DECIMAL(15, 2),                 -- Target price in VND (thousands)
  stop_loss DECIMAL(15, 2),                    -- Stop loss in VND (thousands)
  time_horizon TEXT,                           -- 1w | 1m | 1-3m | 3-6m | 6-12m | 1y+
  thesis JSONB NOT NULL DEFAULT '[]',          -- Array of thesis strings (Vietnamese)
  risks JSONB NOT NULL DEFAULT '[]',           -- Array of risk strings (Vietnamese)
  catalysts JSONB DEFAULT '[]',                -- Array of catalyst strings (Vietnamese)
  source_refs JSONB DEFAULT '[]',              -- Array of { url, reason, credibility }
  raw_output JSONB,                            -- Full LLM response for debugging
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_recommendation CHECK (recommendation IN ('BUY', 'HOLD', 'SELL', 'WATCH')),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 100),
  CONSTRAINT valid_time_horizon CHECK (time_horizon IS NULL OR time_horizon IN ('1w', '1m', '1-3m', '3-6m', '6-12m', '1y+')),
  CONSTRAINT target_price_positive CHECK (target_price IS NULL OR target_price > 0),
  CONSTRAINT stop_loss_positive CHECK (stop_loss IS NULL OR stop_loss > 0),

  -- One insight per run
  CONSTRAINT unique_insight_per_run UNIQUE(run_id)
);

COMMENT ON TABLE public.stock_research_insights IS 'LLM-generated analysis output per research run';
COMMENT ON COLUMN public.stock_research_insights.recommendation IS 'Investment recommendation: BUY, HOLD, SELL, WATCH';
COMMENT ON COLUMN public.stock_research_insights.confidence IS 'Confidence level 0–100%';
COMMENT ON COLUMN public.stock_research_insights.thesis IS 'Array of investment thesis points (Vietnamese)';
COMMENT ON COLUMN public.stock_research_insights.risks IS 'Array of risk factors (Vietnamese)';
COMMENT ON COLUMN public.stock_research_insights.catalysts IS 'Array of upcoming catalysts (Vietnamese)';
COMMENT ON COLUMN public.stock_research_insights.source_refs IS 'References to sources with { url, reason, credibility }';
COMMENT ON COLUMN public.stock_research_insights.raw_output IS 'Full raw LLM JSON response for debugging/audit';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- stock_research_runs
CREATE INDEX IF NOT EXISTS idx_research_runs_user ON public.stock_research_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_user_symbol ON public.stock_research_runs(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_research_runs_user_status ON public.stock_research_runs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_research_runs_user_created ON public.stock_research_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_runs_symbol_created ON public.stock_research_runs(symbol, created_at DESC);

-- stock_research_sources
CREATE INDEX IF NOT EXISTS idx_research_sources_run ON public.stock_research_sources(run_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_user ON public.stock_research_sources(user_id);

-- stock_research_insights
CREATE INDEX IF NOT EXISTS idx_research_insights_run ON public.stock_research_insights(run_id);
CREATE INDEX IF NOT EXISTS idx_research_insights_user ON public.stock_research_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_research_insights_recommendation ON public.stock_research_insights(user_id, recommendation);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.stock_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_research_insights ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES — STOCK_RESEARCH_RUNS
-- ============================================

CREATE POLICY "Users can view own research runs"
  ON public.stock_research_runs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research runs"
  ON public.stock_research_runs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research runs"
  ON public.stock_research_runs
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own research runs"
  ON public.stock_research_runs
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES — STOCK_RESEARCH_SOURCES
-- ============================================

CREATE POLICY "Users can view own research sources"
  ON public.stock_research_sources
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research sources"
  ON public.stock_research_sources
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own research sources"
  ON public.stock_research_sources
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES — STOCK_RESEARCH_INSIGHTS
-- ============================================

CREATE POLICY "Users can view own research insights"
  ON public.stock_research_insights
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research insights"
  ON public.stock_research_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research insights"
  ON public.stock_research_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own research insights"
  ON public.stock_research_insights
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS FOR AUTO-UPDATED_AT
-- ============================================

CREATE TRIGGER set_updated_at_stock_research_runs
  BEFORE UPDATE ON public.stock_research_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_stock_research_insights
  BEFORE UPDATE ON public.stock_research_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- END OF STOCK RESEARCH PIPELINE MIGRATION
-- ============================================
