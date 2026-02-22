-- ============================================
-- Price Alerts Table
-- Version: 1.0 | Date: Feb 2026 | Ticket: XST-776
-- ============================================

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  -- alert_type: 'above' | 'below' | 'change_pct'
  alert_type   TEXT NOT NULL CHECK (alert_type IN ('above', 'below', 'change_pct')),
  target_value NUMERIC(18,4) NOT NULL,
  current_value NUMERIC(18,4),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  triggered    BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_alerts_user_isolation" ON public.price_alerts
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS price_alerts_user_id_idx ON public.price_alerts(user_id);
CREATE INDEX IF NOT EXISTS price_alerts_symbol_idx  ON public.price_alerts(symbol);
CREATE INDEX IF NOT EXISTS price_alerts_enabled_idx ON public.price_alerts(enabled, triggered);

COMMENT ON TABLE public.price_alerts IS 'User-defined price alerts for stocks (XST-776)';
