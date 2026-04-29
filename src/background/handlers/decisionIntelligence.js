/**
 * Decision Intelligence / Guardrails / Playbook / Automation handlers
 * Change: decision-intelligence-roadmap
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';
import {
  DECISION_POLICY_VERSION,
  GUARDRAIL_POLICY_VERSION,
  evaluateDecisionScore,
  evaluateGuardrails,
  buildPlaybookInsightsFromEntries,
} from '../services/decisionIntelligenceService.js';
import { DecisionIntelligenceMapper } from '../../shared/mappers/decisionIntelligenceMapper.js';

const logger = createLogger('Handlers/DecisionIntelligence');

async function getRecentErrorCount(userId, symbol) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from('trade_journal')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('symbol', String(symbol || '').toUpperCase())
    .not('error_category', 'is', null)
    .gte('updated_at', since.toISOString());

  if (error) throw error;
  return data?.length || 0;
}

async function persistDecisionSnapshot(userId, payload) {
  const entity = DecisionIntelligenceMapper.toDecisionScoreSnapshotEntity(payload, userId);
  const { error } = await supabase.from('decision_score_snapshots').insert(entity);
  if (error) throw error;
}

async function persistGuardrailEvaluation(userId, payload) {
  const entity = DecisionIntelligenceMapper.toGuardrailEvaluationEntity(payload, userId);
  const { error } = await supabase.from('guardrail_evaluations').insert(entity);
  if (error) throw error;
}

registerHandler(MESSAGE_TYPES.DECISION_SCORE_EVALUATE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const input = message.data || {};

    const recentErrorCount = await supabaseWithRetry(
      () => getRecentErrorCount(userId, input.symbol),
      { operationName: 'decision.recentErrorCount', correlationId }
    );

    const result = evaluateDecisionScore({
      ...input,
      recentErrorCount,
    });

    await supabaseWithRetry(
      () => persistDecisionSnapshot(userId, {
        symbol: String(input.symbol || '').toUpperCase(),
        tradeJournalId: input.tradeJournalId || null,
        policyVersion: DECISION_POLICY_VERSION,
        inputFingerprint: `${String(input.symbol || '').toUpperCase()}::${Date.now()}`,
        ...result,
      }),
      { operationName: 'decision.persistSnapshot', correlationId, maxRetries: 1 }
    );

    return createResponse(message, MESSAGE_TYPES.DECISION_SCORE_RESULT, {
      success: true,
      policyVersion: DECISION_POLICY_VERSION,
      ...result,
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('DECISION_SCORE_EVALUATE failed', { correlationId, error: error?.message });
    return createErrorResponse(message, 'DECISION_SCORE_ERROR', error?.message || 'Không thể chấm điểm quyết định');
  }
});

registerHandler(MESSAGE_TYPES.JOURNAL_GUARDRAIL_EVALUATE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const input = message.data || {};

    const result = evaluateGuardrails(input, {
      strictRegime: input.strictRegime,
      minChecklistRatio: input.minChecklistRatio,
      maxRiskPct: input.maxRiskPct,
    });

    await supabaseWithRetry(
      () => persistGuardrailEvaluation(userId, {
        symbol: String(input.symbol || '').toUpperCase(),
        tradeJournalId: input.tradeJournalId || null,
        policyVersion: GUARDRAIL_POLICY_VERSION,
        ...result,
      }),
      { operationName: 'guardrail.persistEvaluation', correlationId, maxRetries: 1 }
    );

    return createResponse(message, MESSAGE_TYPES.JOURNAL_GUARDRAIL_RESULT, {
      success: true,
      policyVersion: GUARDRAIL_POLICY_VERSION,
      ...result,
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('JOURNAL_GUARDRAIL_EVALUATE failed', { correlationId, error: error?.message });
    return createErrorResponse(message, 'GUARDRAIL_EVALUATION_ERROR', error?.message || 'Không thể chạy guardrail checks');
  }
});

registerHandler(MESSAGE_TYPES.PLAYBOOK_INSIGHTS_GET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { refresh = false, limit = 3 } = message.data || {};

    if (refresh) {
      const entries = await supabaseWithRetry(async () => {
        const { data, error } = await supabase
          .from('trade_journal')
          .select('status, setup, pnl_pct, error_category, entry_date')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }, { operationName: 'playbook.entries', correlationId });

      const insights = buildPlaybookInsightsFromEntries(entries);
      for (const insight of insights) {
        const upsertPayload = {
          user_id: userId,
          insight_key: insight.insightKey,
          title: insight.title,
          recommendation: insight.recommendation,
          evidence_summary: insight.evidenceSummary,
          confidence: insight.confidence,
          payload: insight.payload,
          rank_score: insight.rankScore,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await supabaseWithRetry(async () => {
          const { error } = await supabase
            .from('playbook_insights')
            .upsert(upsertPayload, { onConflict: 'user_id,insight_key' });
          if (error) throw error;
        }, { operationName: 'playbook.upsertInsight', correlationId, maxRetries: 1 });
      }
    }

    const rows = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('playbook_insights')
        .select('*')
        .eq('user_id', userId)
        .order('rank_score', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    }, { operationName: 'playbook.fetchInsights', correlationId });

    return createResponse(message, MESSAGE_TYPES.PLAYBOOK_INSIGHTS_DATA, {
      success: true,
      items: rows.map(DecisionIntelligenceMapper.fromPlaybookInsightEntity),
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('PLAYBOOK_INSIGHTS_GET failed', { correlationId, error: error?.message });
    return createErrorResponse(message, 'PLAYBOOK_INSIGHTS_ERROR', error?.message || 'Không thể tải playbook insights');
  }
});

registerHandler(MESSAGE_TYPES.PLAYBOOK_INSIGHT_FEEDBACK, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { insightId, helpful } = message.data || {};

    const entity = DecisionIntelligenceMapper.toPlaybookFeedbackEntity({ insightId, helpful }, userId);
    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('playbook_insight_feedback')
        .upsert(entity, { onConflict: 'user_id,insight_id' });
      if (error) throw error;
    }, { operationName: 'playbook.saveFeedback', correlationId, maxRetries: 1 });

    return createResponse(message, MESSAGE_TYPES.PLAYBOOK_INSIGHT_FEEDBACK_SAVED, {
      success: true,
      insightId,
      helpful: Boolean(helpful),
    });
  } catch (error) {
    if (error.errorCode) return error;
    logger.error('PLAYBOOK_INSIGHT_FEEDBACK failed', { correlationId, error: error?.message });
    return createErrorResponse(message, 'PLAYBOOK_FEEDBACK_ERROR', error?.message || 'Không thể lưu feedback insight');
  }
});

registerHandler(MESSAGE_TYPES.AUTOMATION_WORKFLOWS_GET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const rows = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('automation_workflows')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }, { operationName: 'automation.getWorkflows', correlationId });

    return createResponse(message, MESSAGE_TYPES.AUTOMATION_WORKFLOWS_DATA, {
      success: true,
      items: rows.map(DecisionIntelligenceMapper.fromAutomationWorkflowEntity),
    });
  } catch (error) {
    if (error.errorCode) return error;
    return createErrorResponse(message, 'AUTOMATION_WORKFLOW_ERROR', error?.message || 'Không thể tải workflows');
  }
});

registerHandler(MESSAGE_TYPES.AUTOMATION_WORKFLOW_CREATE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const payload = DecisionIntelligenceMapper.toAutomationWorkflowEntity(message.data || {}, userId);

    const row = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('automation_workflows')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'automation.createWorkflow', correlationId });

    return createResponse(message, MESSAGE_TYPES.AUTOMATION_WORKFLOW_CREATED, {
      success: true,
      item: DecisionIntelligenceMapper.fromAutomationWorkflowEntity(row),
    });
  } catch (error) {
    if (error.errorCode) return error;
    return createErrorResponse(message, 'AUTOMATION_WORKFLOW_ERROR', error?.message || 'Không thể tạo workflow');
  }
});

registerHandler(MESSAGE_TYPES.AUTOMATION_WORKFLOW_UPDATE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { id, updates } = message.data || {};

    const patch = DecisionIntelligenceMapper.toAutomationWorkflowEntity(updates || {}, userId);
    delete patch.user_id;

    const row = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('automation_workflows')
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'automation.updateWorkflow', correlationId });

    return createResponse(message, MESSAGE_TYPES.AUTOMATION_WORKFLOW_UPDATED, {
      success: true,
      item: DecisionIntelligenceMapper.fromAutomationWorkflowEntity(row),
    });
  } catch (error) {
    if (error.errorCode) return error;
    return createErrorResponse(message, 'AUTOMATION_WORKFLOW_ERROR', error?.message || 'Không thể cập nhật workflow');
  }
});

registerHandler(MESSAGE_TYPES.AUTOMATION_WORKFLOW_DELETE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { id } = message.data || {};

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('automation_workflows')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    }, { operationName: 'automation.deleteWorkflow', correlationId });

    return createResponse(message, MESSAGE_TYPES.AUTOMATION_WORKFLOW_DELETED, {
      success: true,
      id,
    });
  } catch (error) {
    if (error.errorCode) return error;
    return createErrorResponse(message, 'AUTOMATION_WORKFLOW_ERROR', error?.message || 'Không thể xóa workflow');
  }
});

registerHandler(MESSAGE_TYPES.AUTOMATION_EXECUTIONS_GET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { workflowId, limit = 100 } = message.data || {};

    const rows = await supabaseWithRetry(async () => {
      let query = supabase
        .from('automation_execution_logs')
        .select('*')
        .eq('user_id', userId)
        .order('executed_at', { ascending: false })
        .limit(limit);

      if (workflowId) query = query.eq('workflow_id', workflowId);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }, { operationName: 'automation.getExecutions', correlationId });

    return createResponse(message, MESSAGE_TYPES.AUTOMATION_EXECUTIONS_DATA, {
      success: true,
      items: rows.map(DecisionIntelligenceMapper.fromAutomationExecutionEntity),
    });
  } catch (error) {
    if (error.errorCode) return error;
    return createErrorResponse(message, 'AUTOMATION_EXECUTION_ERROR', error?.message || 'Không thể tải execution logs');
  }
});
