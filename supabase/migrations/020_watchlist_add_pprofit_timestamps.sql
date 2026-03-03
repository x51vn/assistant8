-- ============================================
-- Watchlist: Add pprofit + field timestamps + AI rate limit
-- Version: 1.0
-- Date: February 24, 2026
-- Description: Add pprofit column, per-field update timestamps,
--              and last_ai_analysis_at for rate limiting.
-- ============================================

-- pprofit = (target - entry) / entry — potential profit percentage
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS pprofit DECIMAL(10, 4);

-- Per-field update timestamps (when entry/target/stoploss were last changed)
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS entry_updated_at TIMESTAMPTZ;
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS target_updated_at TIMESTAMPTZ;
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS stoploss_updated_at TIMESTAMPTZ;

-- AI analysis rate-limit marker
ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS last_ai_analysis_at TIMESTAMPTZ;

COMMENT ON COLUMN public.watchlist.pprofit IS 'Potential profit: (target - entry) / entry';
COMMENT ON COLUMN public.watchlist.entry_updated_at IS 'Timestamp of last entry price change';
COMMENT ON COLUMN public.watchlist.target_updated_at IS 'Timestamp of last target price change';
COMMENT ON COLUMN public.watchlist.stoploss_updated_at IS 'Timestamp of last stoploss change';
COMMENT ON COLUMN public.watchlist.last_ai_analysis_at IS 'Timestamp of last AI enrichment run (rate-limit)';

-- ============================================
-- END
-- ============================================
