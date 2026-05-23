-- ============================================
-- Decision Automation Rollout Telemetry
-- Version: 1.0
-- Date: May 23, 2026
-- Description: durable rollout telemetry for decision intelligence and automation rollout paths
-- Change: complete-decision-automation-rollout
-- ============================================

CREATE TABLE IF NOT EXISTS public.decision_rollout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  workflow_id UUID REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  trade_journal_id UUID REFERENCES public.trade_journal(id) ON DELETE SET NULL,
  rollout_context JSONB NOT NULL DEFAULT '{}',
  trigger_input JSONB NOT NULL DEFAULT '{}',
  result_payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'captured',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.decision_rollout_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_rollout_events_user_isolation" ON public.decision_rollout_events
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_decision_rollout_events_user_executed
  ON public.decision_rollout_events(user_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_rollout_events_capability
  ON public.decision_rollout_events(user_id, capability, executed_at DESC);
