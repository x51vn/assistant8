-- Migration: Facts → Signals → Decisions (System Upgrade v2)
-- Ticket: FACTS_SIGNALS_DECISIONS_REQUIREMENTS
-- Date: 2026-03-04

-- ============================================================
-- 1) Watchlist: add price provenance columns (FR-WP-04)
-- ============================================================
ALTER TABLE watchlist
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS price_provider   TEXT         NULL;

COMMENT ON COLUMN watchlist.price_updated_at IS 'Timestamp of last background price fetch';
COMMENT ON COLUMN watchlist.price_provider   IS 'Provider used for last price fetch (vps, ssi)';

-- ============================================================
-- 2) stock_research_runs: add market_snapshot + facts_context
-- ============================================================
ALTER TABLE stock_research_runs
  ADD COLUMN IF NOT EXISTS market_snapshot  JSONB NULL,
  ADD COLUMN IF NOT EXISTS facts_context    JSONB NULL,
  ADD COLUMN IF NOT EXISTS sources_used     TEXT[] NULL;

COMMENT ON COLUMN stock_research_runs.market_snapshot IS 'MarketSnapshotFact used during this run';
COMMENT ON COLUMN stock_research_runs.facts_context   IS 'Full FactsContext injected into LLM prompt';
COMMENT ON COLUMN stock_research_runs.sources_used    IS 'Validated sourcesUsed URLs from LLM output';

-- ============================================================
-- 3) market_assessment: add market_snapshot column
-- ============================================================
ALTER TABLE market_assessment
  ADD COLUMN IF NOT EXISTS market_snapshot  JSONB NULL,
  ADD COLUMN IF NOT EXISTS snapshot_missing BOOLEAN DEFAULT false;

COMMENT ON COLUMN market_assessment.market_snapshot  IS 'MarketSnapshotFact used during this run';
COMMENT ON COLUMN market_assessment.snapshot_missing IS 'True if snapshot fetch failed (pipeline continued without it)';
