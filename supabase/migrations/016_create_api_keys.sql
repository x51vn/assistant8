-- ============================================
-- Enterprise API Keys Table
-- Version: 1.0 | Date: Feb 2026 | Ticket: XST-778
-- ============================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,        -- SHA-256 hash of the raw key
  key_prefix    TEXT NOT NULL,               -- First 8 chars of raw key for display (e.g. "xst_abc1")
  label         TEXT NOT NULL DEFAULT 'Default Key',
  last_used_at  TIMESTAMPTZ,
  request_count INTEGER NOT NULL DEFAULT 0,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_user_isolation" ON public.api_keys
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx  ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx     ON public.api_keys(key_hash);

COMMENT ON TABLE public.api_keys IS 'Enterprise REST API keys (XST-778). Only hashed keys stored.';
