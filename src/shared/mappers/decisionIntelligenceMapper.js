/**
 * Decision Intelligence mappers
 * Converts transport/app DTO <-> persistence entities.
 */

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const DecisionIntelligenceMapper = {
  toDecisionScoreSnapshotEntity(dto, userId) {
    return {
      user_id: userId,
      trade_journal_id: dto.tradeJournalId ?? null,
      symbol: dto.symbol,
      policy_version: dto.policyVersion,
      input_fingerprint: dto.inputFingerprint ?? null,
      decision_score: toNumberOrNull(dto.decisionScore),
      grade: dto.grade,
      rule_breakdown: Array.isArray(dto.ruleBreakdown) ? dto.ruleBreakdown : [],
      blocking_reasons: Array.isArray(dto.blockingReasons) ? dto.blockingReasons : [],
      advice: Array.isArray(dto.advice) ? dto.advice : [],
    };
  },

  toGuardrailEvaluationEntity(dto, userId) {
    return {
      user_id: userId,
      trade_journal_id: dto.tradeJournalId ?? null,
      symbol: dto.symbol,
      policy_version: dto.policyVersion,
      allowed: Boolean(dto.allowed),
      checks: Array.isArray(dto.checks) ? dto.checks : [],
      blocking_reasons: Array.isArray(dto.blockingReasons) ? dto.blockingReasons : [],
      warnings: Array.isArray(dto.warnings) ? dto.warnings : [],
    };
  },

  fromPlaybookInsightEntity(row) {
    return {
      id: row.id,
      insightKey: row.insight_key,
      title: row.title,
      recommendation: row.recommendation,
      evidenceSummary: row.evidence_summary,
      confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : 0,
      payload: row.payload || {},
      rankScore: row.rank_score !== null && row.rank_score !== undefined ? Number(row.rank_score) : 0,
      generatedAt: row.generated_at,
      expiresAt: row.expires_at,
    };
  },

  toPlaybookFeedbackEntity(dto, userId) {
    return {
      user_id: userId,
      insight_id: dto.insightId,
      helpful: Boolean(dto.helpful),
      updated_at: new Date().toISOString(),
    };
  },

  toAutomationWorkflowEntity(dto, userId) {
    return {
      user_id: userId,
      name: dto.name,
      trigger_type: dto.trigger_type,
      conditions: dto.conditions || {},
      actions: Array.isArray(dto.actions) ? dto.actions : [],
      dedup_window_minutes: toNumberOrNull(dto.dedup_window_minutes) ?? 60,
      quiet_hours: dto.quiet_hours || null,
      is_active: dto.is_active !== undefined ? Boolean(dto.is_active) : true,
      updated_at: new Date().toISOString(),
    };
  },

  fromAutomationWorkflowEntity(row) {
    return {
      id: row.id,
      name: row.name,
      triggerType: row.trigger_type,
      conditions: row.conditions || {},
      actions: row.actions || [],
      dedupWindowMinutes: row.dedup_window_minutes,
      quietHours: row.quiet_hours,
      isActive: row.is_active,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    };
  },

  fromAutomationExecutionEntity(row) {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      triggerInput: row.trigger_input || {},
      evaluationResult: row.evaluation_result || {},
      actionOutcome: row.action_outcome || {},
      status: row.status,
      dedupKey: row.dedup_key,
      executedAt: row.executed_at,
    };
  },
};
