-- ============================================
-- Decision Intelligence Phase A
-- Version: 1.0
-- Date: April 28, 2026
-- Description: scoring snapshots, guardrail evaluations,
--              playbook insights, feedback, automation workflows/logs
-- Change: decision-intelligence-roadmap
-- ============================================

-- 1) Extend trade_journal with decision snapshots
ALTER TABLE public.trade_journal
  ADD COLUMN IF NOT EXISTS decision_score_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS guardrail_result_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS guardrail_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS playbook_hint_snapshot JSONB;

COMMENT ON COLUMN public.trade_journal.decision_score_snapshot IS 'Decision scoring output captured at create/update decision time';
COMMENT ON COLUMN public.trade_journal.guardrail_result_snapshot IS 'Guardrail evaluation payload captured at pre-trade confirmation';
COMMENT ON COLUMN public.trade_journal.guardrail_policy_version IS 'Version identifier of guardrail policy used for evaluation';
COMMENT ON COLUMN public.trade_journal.playbook_hint_snapshot IS 'Top playbook hints shown to user at decision time';

-- 2) Decision score snapshots
CREATE TABLE IF NOT EXISTS public.decision_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_journal_id UUID REFERENCES public.trade_journal(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  input_fingerprint TEXT,
  decision_score DECIMAL(6,2) NOT NULL,
  grade TEXT NOT NULL,
  rule_breakdown JSONB NOT NULL DEFAULT '[]',
  blocking_reasons JSONB NOT NULL DEFAULT '[]',
  advice JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Guardrail evaluations
CREATE TABLE IF NOT EXISTS public.guardrail_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_journal_id UUID REFERENCES public.trade_journal(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]',
  blocking_reasons JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) Playbook insights
CREATE TABLE IF NOT EXISTS public.playbook_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_key TEXT NOT NULL,
  title TEXT NOT NULL,
  recommendation TEXT,
  evidence_summary TEXT,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}',
  rank_score DECIMAL(10,4) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT playbook_insights_unique_key_per_user UNIQUE(user_id, insight_key)
);

CREATE TABLE IF NOT EXISTS public.playbook_insight_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_id UUID NOT NULL REFERENCES public.playbook_insights(id) ON DELETE CASCADE,
  helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT playbook_feedback_unique_user_insight UNIQUE(user_id, insight_id)
);

-- 5) Automation workflows + logs (safe sandbox actions)
CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  dedup_window_minutes INTEGER NOT NULL DEFAULT 60,
  quiet_hours JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
  trigger_input JSONB NOT NULL DEFAULT '{}',
  evaluation_result JSONB NOT NULL DEFAULT '{}',
  action_outcome JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'executed',
  dedup_key TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.decision_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrail_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_insight_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_score_snapshots_user_isolation" ON public.decision_score_snapshots
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "guardrail_evaluations_user_isolation" ON public.guardrail_evaluations
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "playbook_insights_user_isolation" ON public.playbook_insights
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "playbook_insight_feedback_user_isolation" ON public.playbook_insight_feedback
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "automation_workflows_user_isolation" ON public.automation_workflows
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "automation_execution_logs_user_isolation" ON public.automation_execution_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_decision_score_snapshots_user_created
  ON public.decision_score_snapshots(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_score_snapshots_user_symbol
  ON public.decision_score_snapshots(user_id, symbol);

CREATE INDEX IF NOT EXISTS idx_guardrail_evaluations_user_created
  ON public.guardrail_evaluations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_playbook_insights_user_rank
  ON public.playbook_insights(user_id, rank_score DESC, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_playbook_feedback_user
  ON public.playbook_insight_feedback(user_id, insight_id);

CREATE INDEX IF NOT EXISTS idx_automation_workflows_user_active
  ON public.automation_workflows(user_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_execution_logs_user_executed
  ON public.automation_execution_logs(user_id, executed_at DESC);
