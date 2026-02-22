-- ============================================
-- Multi-Portfolio Support
-- Version: 1.0 | Date: Feb 2026 | Ticket: XST-779
-- ============================================

-- 1. portfolios table
CREATE TABLE IF NOT EXISTS public.portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Default',
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios_user_isolation" ON public.portfolios
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON public.portfolios(user_id);

-- 2. Add portfolio_id FK to portfolio table (nullable = backward compatible)
ALTER TABLE public.portfolio
  ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS portfolio_portfolio_id_idx ON public.portfolio(portfolio_id);

-- 3. Data migration: create a default portfolio for every existing user who has stocks
-- and link their existing stocks to it.
-- This runs as a DO block so it is idempotent.
DO $$
DECLARE
  r RECORD;
  new_portfolio_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM public.portfolio WHERE portfolio_id IS NULL
  LOOP
    -- Check if default portfolio already exists for this user
    SELECT id INTO new_portfolio_id
    FROM public.portfolios
    WHERE user_id = r.user_id AND is_default = TRUE
    LIMIT 1;

    IF new_portfolio_id IS NULL THEN
      INSERT INTO public.portfolios (user_id, name, is_default)
      VALUES (r.user_id, 'Default', TRUE)
      RETURNING id INTO new_portfolio_id;
    END IF;

    -- Link unlinked stocks
    UPDATE public.portfolio
    SET portfolio_id = new_portfolio_id
    WHERE user_id = r.user_id AND portfolio_id IS NULL;
  END LOOP;
END $$;

COMMENT ON TABLE public.portfolios IS 'Named portfolios per user (XST-779). Free=1, Pro=3, Enterprise=unlimited.';
COMMENT ON COLUMN public.portfolio.portfolio_id IS 'FK to portfolios table. NULL = legacy (treated as default).';
