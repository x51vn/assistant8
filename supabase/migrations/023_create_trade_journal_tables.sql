-- ============================================
-- Trade Journal Tables Migration
-- Version: 1.0
-- Date: April 28, 2026
-- Description: Create trade_journal and checklist_templates tables
--              for the Trading Journal MVP feature
-- Change: trading-journal-mvp
-- ============================================

-- ============================================
-- 1. TRADE_JOURNAL TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional link back to watchlist (nullable - not all trades come from watchlist)
  watchlist_id UUID REFERENCES public.watchlist(id) ON DELETE SET NULL,

  -- Core identification
  symbol TEXT NOT NULL,

  -- Snapshot at decision time (immutable after creation)
  setup TEXT,                              -- 'Breakout', 'Pullback to support', 'Range base', etc.
  thesis_snapshot TEXT,                    -- Copy of investment_thesis from watchlist at entry time
  market_regime_snapshot TEXT,             -- 'ON' or 'OFF' at entry time
  market_score_snapshot INTEGER,           -- market_regime_score at entry time (0-100)
  market_action_snapshot TEXT,             -- BUY/HOLD/SELL/WATCH at entry time

  -- Pre-trade plan
  planned_entry DECIMAL(15, 2),
  planned_target DECIMAL(15, 2),
  planned_stoploss DECIMAL(15, 2),
  planned_qty INTEGER,
  risk_per_trade_pct DECIMAL(5, 2),        -- % of account willing to risk
  account_size_snapshot DECIMAL(18, 2),    -- Account size at time of entry (for R% calc)

  -- Checklist snapshot (JSONB: { rule_key: boolean })
  checklist JSONB DEFAULT '{}',

  -- Status machine: planned → open → closed → reviewed
  status TEXT NOT NULL DEFAULT 'planned',

  -- Actual execution (filled when status → open)
  actual_entry DECIMAL(15, 2),
  actual_qty INTEGER,
  entry_date DATE,

  -- Post-trade (filled when status → closed)
  exit_price DECIMAL(15, 2),
  exit_date DATE,
  realized_pnl DECIMAL(18, 2),             -- (exit_price - actual_entry) × actual_qty
  pnl_pct DECIMAL(10, 6),                  -- (exit_price - actual_entry) / actual_entry
  r_multiple DECIMAL(10, 4),               -- (exit_price - actual_entry) / (actual_entry - planned_stoploss)
  followed_plan BOOLEAN,

  -- Review (filled when status → reviewed)
  lessons TEXT,
  error_category TEXT,                     -- 'entry_too_early', 'ignored_stoploss', 'oversized', etc.
  rating INTEGER,                          -- 1–5 self-assessment rating

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT trade_journal_valid_status CHECK (status IN ('planned', 'open', 'closed', 'reviewed')),
  CONSTRAINT trade_journal_valid_rating CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  CONSTRAINT trade_journal_symbol_not_empty CHECK (LENGTH(TRIM(symbol)) > 0),
  CONSTRAINT trade_journal_planned_entry_positive CHECK (planned_entry IS NULL OR planned_entry > 0),
  CONSTRAINT trade_journal_planned_target_positive CHECK (planned_target IS NULL OR planned_target > 0),
  CONSTRAINT trade_journal_planned_stoploss_positive CHECK (planned_stoploss IS NULL OR planned_stoploss > 0),
  CONSTRAINT trade_journal_actual_entry_positive CHECK (actual_entry IS NULL OR actual_entry > 0),
  CONSTRAINT trade_journal_exit_price_positive CHECK (exit_price IS NULL OR exit_price > 0)
);

COMMENT ON TABLE public.trade_journal IS 'Trading journal entries — records investment decisions with pre/post-trade data';
COMMENT ON COLUMN public.trade_journal.watchlist_id IS 'Optional FK to watchlist; SET NULL on watchlist delete to preserve journal history';
COMMENT ON COLUMN public.trade_journal.thesis_snapshot IS 'Immutable copy of investment thesis captured at decision time';
COMMENT ON COLUMN public.trade_journal.market_regime_snapshot IS 'Market regime state (ON/OFF) at time of entry decision';
COMMENT ON COLUMN public.trade_journal.checklist IS 'Snapshot of rule checklist: { rule_key: boolean }';
COMMENT ON COLUMN public.trade_journal.status IS 'Status machine: planned → open → closed → reviewed';
COMMENT ON COLUMN public.trade_journal.r_multiple IS 'R-multiple: (exit - entry) / (entry - stoploss). Null if entry = stoploss.';
COMMENT ON COLUMN public.trade_journal.error_category IS 'Post-trade error classification for pattern analysis';
COMMENT ON COLUMN public.trade_journal.account_size_snapshot IS 'Account size at entry time used for risk % calculation';

-- ============================================
-- 2. CHECKLIST_TEMPLATES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,                  -- snake_case identifier e.g. 'regime_ok'
  label TEXT NOT NULL,                     -- Display text e.g. 'Market regime phải ON'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  order_num INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only have one rule per key
  CONSTRAINT checklist_templates_unique_rule_per_user UNIQUE (user_id, rule_key),
  CONSTRAINT checklist_templates_rule_key_not_empty CHECK (LENGTH(TRIM(rule_key)) > 0),
  CONSTRAINT checklist_templates_label_not_empty CHECK (LENGTH(TRIM(label)) > 0)
);

COMMENT ON TABLE public.checklist_templates IS 'User-defined pre-trade rule checklist templates';
COMMENT ON COLUMN public.checklist_templates.rule_key IS 'Snake_case identifier used as key in trade_journal.checklist JSONB';
COMMENT ON COLUMN public.checklist_templates.label IS 'Human-readable rule label displayed in UI';
COMMENT ON COLUMN public.checklist_templates.is_active IS 'Inactive rules are hidden from new entry forms but preserved for history';
COMMENT ON COLUMN public.checklist_templates.order_num IS 'Display order in checklist UI';

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_journal_user_isolation" ON public.trade_journal
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_templates_user_isolation" ON public.checklist_templates
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4. INDEXES
-- ============================================

-- trade_journal indexes
CREATE INDEX IF NOT EXISTS idx_trade_journal_user_status
  ON public.trade_journal(user_id, status);

CREATE INDEX IF NOT EXISTS idx_trade_journal_user_symbol
  ON public.trade_journal(user_id, symbol);

CREATE INDEX IF NOT EXISTS idx_trade_journal_user_created
  ON public.trade_journal(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_journal_user_entry_date
  ON public.trade_journal(user_id, entry_date DESC);

-- checklist_templates indexes
CREATE INDEX IF NOT EXISTS idx_checklist_templates_user_active_order
  ON public.checklist_templates(user_id, is_active, order_num);

-- ============================================
-- END
-- ============================================
