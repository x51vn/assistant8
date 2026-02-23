-- Migration: Add DEFAULT 0 to assets.current_value
-- Ticket: bugfix/assets-gold-null-current-value
-- Description: current_value was NOT NULL without DEFAULT, causing insert failures for
--              gold assets where current_value is intentionally stored as 0 (live price
--              is calculated at display time). Adding DEFAULT 0 prevents similar issues.

ALTER TABLE public.assets
  ALTER COLUMN current_value SET DEFAULT 0;

COMMENT ON COLUMN public.assets.current_value IS
  'Stored value in VND. For gold/crypto assets, value=0 is a sentinel — actual value is calculated at display time from live market prices (quantity × unit_price).';
