/**
 * Rollout helpers and safe Automation Hub v1 execution runtime.
 */

import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('DecisionAutomationService');

export const ROLLOUT_CAPABILITIES = {
  DECISION_SCORE: 'decision_score',
  GUARDRAIL_EVALUATION: 'guardrail_evaluation',
  PLAYBOOK_INSIGHTS: 'playbook_insights',
  AUTOMATION_HUB: 'automation_hub',
};

export const AUTOMATION_TRIGGER_TYPES = {
  MARKET_REGIME_TRANSITION: 'market_regime_transition',
  REVIEW_READY: 'review_ready',
  GUARDRAIL_STATE_CHANGE: 'guardrail_state_change',
  CHECKLIST_STATE_CHANGE: 'checklist_state_change',
};

export const AUTOMATION_ACTION_TYPES = {
  NOTIFY: 'notify',
  SUGGEST_REVIEW: 'suggest_review',
  QUEUE_TASK: 'queue_task',
  QUEUE_PROMPT: 'queue_prompt',
};

const CAPABILITY_FLAGS = {
  [ROLLOUT_CAPABILITIES.DECISION_SCORE]: {
    enabledFlag: 'decision_intelligence_enabled',
    shadowFlag: 'decision_intelligence_shadow_mode',
    cohort: 'phase-a',
  },
  [ROLLOUT_CAPABILITIES.GUARDRAIL_EVALUATION]: {
    enabledFlag: 'decision_intelligence_enabled',
    shadowFlag: 'decision_intelligence_shadow_mode',
    cohort: 'phase-a',
  },
  [ROLLOUT_CAPABILITIES.PLAYBOOK_INSIGHTS]: {
    enabledFlag: 'decision_intelligence_enabled',
    shadowFlag: 'decision_intelligence_shadow_mode',
    cohort: 'phase-b',
  },
  [ROLLOUT_CAPABILITIES.AUTOMATION_HUB]: {
    enabledFlag: 'automation_hub_enabled',
    shadowFlag: 'automation_hub_shadow_mode',
    cohort: 'phase-c',
  },
};

function normalizeUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function computeChecklistRatio(checklist = {}) {
  const values = Object.values(checklist || {});
  if (values.length === 0) return 0;
  return values.filter(Boolean).length / values.length;
}

function extractGuardrailAllowed(guardrailResult) {
  if (typeof guardrailResult === 'boolean') return guardrailResult;
  if (!guardrailResult || typeof guardrailResult !== 'object') return null;
  if (typeof guardrailResult.allowed === 'boolean') return guardrailResult.allowed;
  return null;
}

function getActionType(action) {
  return normalizeLower(action?.type || action?.kind);
}

function parseClockToMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1439, Math.round(value * 60)));
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  const hour = Number(parts[0]);
  const minute = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function buildTriggerSummary(triggerType, triggerInput) {
  switch (triggerType) {
    case AUTOMATION_TRIGGER_TYPES.MARKET_REGIME_TRANSITION:
      return `Regime ${triggerInput.previousRegime || 'N/A'} -> ${triggerInput.currentRegime || 'N/A'}`;
    case AUTOMATION_TRIGGER_TYPES.REVIEW_READY:
      return `Status ${triggerInput.previousStatus || 'none'} -> ${triggerInput.currentStatus || 'none'}`;
    case AUTOMATION_TRIGGER_TYPES.GUARDRAIL_STATE_CHANGE:
      return `Guardrail ${String(triggerInput.previousGuardrailAllowed)} -> ${String(triggerInput.currentGuardrailAllowed)}`;
    case AUTOMATION_TRIGGER_TYPES.CHECKLIST_STATE_CHANGE:
      return `Checklist changed: ${(triggerInput.checklistChangedKeys || []).join(', ') || 'none'}`;
    default:
      return 'Unsupported trigger';
  }
}

export async function getUserSettingsConfig(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('config')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.config || {};
}

export function resolveCapabilityRollout(capability, settingsConfig = {}) {
  const flagConfig = CAPABILITY_FLAGS[capability] || CAPABILITY_FLAGS[ROLLOUT_CAPABILITIES.DECISION_SCORE];
  const enabled = getFeatureFlag(flagConfig.enabledFlag, settingsConfig);
  const shadowMode = getFeatureFlag(flagConfig.shadowFlag, settingsConfig);

  return {
    capability,
    cohort: flagConfig.cohort,
    enabledFlag: flagConfig.enabledFlag,
    shadowFlag: flagConfig.shadowFlag,
    enabled,
    shadowMode,
    stage: enabled ? 'enabled' : (shadowMode ? 'shadow' : 'disabled'),
  };
}

export function isRolloutActive(rollout) {
  return Boolean(rollout?.enabled || rollout?.shadowMode);
}

export function buildJournalAutomationTriggerInput({
  eventName,
  currentEntry,
  previousEntry = null,
  decisionScore = null,
  guardrailResult = null,
}) {
  const currentChecklist = currentEntry?.checklist || {};
  const previousChecklist = previousEntry?.checklist || {};
  const allChecklistKeys = new Set([
    ...Object.keys(previousChecklist || {}),
    ...Object.keys(currentChecklist || {}),
  ]);
  const checklistChangedKeys = Array.from(allChecklistKeys).filter((key) => previousChecklist?.[key] !== currentChecklist?.[key]);

  const currentScore = toFiniteNumber(
    decisionScore?.decisionScore
    ?? decisionScore?.decision_score
    ?? currentEntry?.decision_score_snapshot?.decisionScore
  );
  const currentGuardrailAllowed = extractGuardrailAllowed(guardrailResult)
    ?? extractGuardrailAllowed(currentEntry?.guardrail_result_snapshot);
  const previousGuardrailAllowed = extractGuardrailAllowed(previousEntry?.guardrail_result_snapshot);

  return {
    eventName,
    tradeJournalId: currentEntry?.id || null,
    symbol: normalizeUpper(currentEntry?.symbol),
    currentStatus: normalizeLower(currentEntry?.status),
    previousStatus: normalizeLower(previousEntry?.status),
    currentFollowedPlan: currentEntry?.followed_plan ?? currentEntry?.followedPlan ?? null,
    previousFollowedPlan: previousEntry?.followed_plan ?? previousEntry?.followedPlan ?? null,
    currentRegime: normalizeUpper(currentEntry?.market_regime_snapshot),
    previousRegime: normalizeUpper(previousEntry?.market_regime_snapshot),
    currentChecklist,
    previousChecklist,
    currentChecklistRatio: Number(computeChecklistRatio(currentChecklist).toFixed(4)),
    previousChecklistRatio: Number(computeChecklistRatio(previousChecklist).toFixed(4)),
    checklistChangedKeys,
    currentGuardrailAllowed,
    previousGuardrailAllowed,
    decisionScore: currentScore,
    decisionGrade: decisionScore?.grade || currentEntry?.decision_score_snapshot?.grade || null,
    blockingReasons: guardrailResult?.blockingReasons
      || guardrailResult?.blocking_reasons
      || currentEntry?.guardrail_result_snapshot?.blockingReasons
      || [],
    warnings: guardrailResult?.warnings
      || currentEntry?.guardrail_result_snapshot?.warnings
      || [],
  };
}

export function evaluateAutomationTrigger(workflow, triggerInput) {
  const triggerType = normalizeLower(workflow?.trigger_type || workflow?.triggerType);
  const conditions = workflow?.conditions || {};

  switch (triggerType) {
    case AUTOMATION_TRIGGER_TYPES.MARKET_REGIME_TRANSITION: {
      const changed = Boolean(
        triggerInput.previousRegime
        && triggerInput.currentRegime
        && triggerInput.previousRegime !== triggerInput.currentRegime
      );
      if (!changed) {
        return { matched: false, triggerType, reason: 'market regime did not change' };
      }

      const requiredFrom = normalizeUpper(conditions.from || conditions.previousRegime);
      const requiredTo = normalizeUpper(conditions.to || conditions.currentRegime);
      if (requiredFrom && requiredFrom !== triggerInput.previousRegime) {
        return { matched: false, triggerType, reason: `expected from ${requiredFrom}` };
      }
      if (requiredTo && requiredTo !== triggerInput.currentRegime) {
        return { matched: false, triggerType, reason: `expected to ${requiredTo}` };
      }

      return {
        matched: true,
        triggerType,
        reason: buildTriggerSummary(triggerType, triggerInput),
      };
    }

    case AUTOMATION_TRIGGER_TYPES.REVIEW_READY: {
      const targetStatus = normalizeLower(conditions.status || conditions.requiredStatus || 'closed');
      const statusReached = triggerInput.currentStatus === targetStatus && triggerInput.previousStatus !== targetStatus;
      if (!statusReached) {
        return { matched: false, triggerType, reason: `status ${targetStatus} not reached` };
      }

      const minDecisionScore = toFiniteNumber(conditions.minDecisionScore ?? conditions.min_decision_score);
      if (minDecisionScore !== null && (triggerInput.decisionScore ?? -Infinity) < minDecisionScore) {
        return { matched: false, triggerType, reason: `decision score below ${minDecisionScore}` };
      }

      const minChecklistRatio = toFiniteNumber(conditions.minChecklistRatio ?? conditions.min_checklist_ratio);
      if (minChecklistRatio !== null && triggerInput.currentChecklistRatio < minChecklistRatio) {
        return { matched: false, triggerType, reason: `checklist ratio below ${minChecklistRatio}` };
      }

      if (conditions.requireFollowedPlan === true && triggerInput.currentFollowedPlan !== true) {
        return { matched: false, triggerType, reason: 'followed_plan requirement not met' };
      }

      return {
        matched: true,
        triggerType,
        reason: buildTriggerSummary(triggerType, triggerInput),
      };
    }

    case AUTOMATION_TRIGGER_TYPES.GUARDRAIL_STATE_CHANGE: {
      if (triggerInput.currentGuardrailAllowed === null) {
        return { matched: false, triggerType, reason: 'guardrail state unavailable' };
      }

      const changed = triggerInput.previousGuardrailAllowed === null
        ? true
        : triggerInput.previousGuardrailAllowed !== triggerInput.currentGuardrailAllowed;
      if (!changed) {
        return { matched: false, triggerType, reason: 'guardrail state did not change' };
      }

      if (conditions.allowed !== undefined && Boolean(conditions.allowed) !== triggerInput.currentGuardrailAllowed) {
        return { matched: false, triggerType, reason: 'guardrail state does not match required value' };
      }

      return {
        matched: true,
        triggerType,
        reason: buildTriggerSummary(triggerType, triggerInput),
      };
    }

    case AUTOMATION_TRIGGER_TYPES.CHECKLIST_STATE_CHANGE: {
      const requiredKeys = Array.isArray(conditions.requiredKeys)
        ? conditions.requiredKeys.map((key) => String(key))
        : [];
      const changedKeys = triggerInput.checklistChangedKeys || [];
      const hasRelevantChange = requiredKeys.length === 0
        ? changedKeys.length > 0
        : requiredKeys.some((key) => changedKeys.includes(key));
      if (!hasRelevantChange) {
        return { matched: false, triggerType, reason: 'checklist change not relevant for workflow' };
      }

      const minChecklistRatio = toFiniteNumber(conditions.minChecklistRatio ?? conditions.min_checklist_ratio);
      if (minChecklistRatio !== null && triggerInput.currentChecklistRatio < minChecklistRatio) {
        return { matched: false, triggerType, reason: `checklist ratio below ${minChecklistRatio}` };
      }

      return {
        matched: true,
        triggerType,
        reason: buildTriggerSummary(triggerType, triggerInput),
      };
    }

    default:
      return { matched: false, triggerType, reason: `unsupported trigger type: ${triggerType || 'unknown'}` };
  }
}

export function buildAutomationDedupKey(workflow, triggerInput) {
  const triggerType = normalizeLower(workflow?.trigger_type || workflow?.triggerType);
  const base = [workflow?.id || workflow?.name || 'workflow', triggerType, triggerInput.symbol || 'UNKNOWN'];

  switch (triggerType) {
    case AUTOMATION_TRIGGER_TYPES.MARKET_REGIME_TRANSITION:
      base.push(`${triggerInput.previousRegime || 'N/A'}->${triggerInput.currentRegime || 'N/A'}`);
      break;
    case AUTOMATION_TRIGGER_TYPES.REVIEW_READY:
      base.push(triggerInput.currentStatus || 'unknown');
      break;
    case AUTOMATION_TRIGGER_TYPES.GUARDRAIL_STATE_CHANGE:
      base.push(`${String(triggerInput.previousGuardrailAllowed)}->${String(triggerInput.currentGuardrailAllowed)}`);
      break;
    case AUTOMATION_TRIGGER_TYPES.CHECKLIST_STATE_CHANGE:
      base.push((triggerInput.checklistChangedKeys || []).sort().join('|') || 'none');
      break;
    default:
      base.push('generic');
      break;
  }

  return base.join('::');
}

export function isWithinQuietHours(quietHours, now = new Date()) {
  if (!quietHours || typeof quietHours !== 'object') return false;

  const start = parseClockToMinutes(quietHours.start ?? quietHours.from ?? quietHours.startHour);
  const end = parseClockToMinutes(quietHours.end ?? quietHours.to ?? quietHours.endHour);
  if (start === null || end === null || start === end) return false;

  const offsetMinutes = toFiniteNumber(quietHours.timezoneOffsetMinutes) ?? 0;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const localMinutes = ((utcMinutes + offsetMinutes) % 1440 + 1440) % 1440;

  if (start < end) {
    return localMinutes >= start && localMinutes < end;
  }

  return localMinutes >= start || localMinutes < end;
}

function buildNotificationPayload(workflow, triggerInput, action = {}) {
  const symbol = triggerInput.symbol || 'N/A';
  return {
    title: action.title || `Automation: ${workflow?.name || symbol}`,
    message: action.message || `Workflow ${workflow?.name || 'automation'} matched for ${symbol}.`,
  };
}

function buildSuggestionPayload(action, triggerInput) {
  return {
    type: AUTOMATION_ACTION_TYPES.SUGGEST_REVIEW,
    summary: action.summary || `Review ${triggerInput.symbol || 'trade'} after ${triggerInput.eventName || 'journal update'}`,
    tradeJournalId: triggerInput.tradeJournalId,
  };
}

function buildQueuedPayload(action, triggerInput, type) {
  return {
    type,
    label: action.label || action.prompt || action.task || `${type}:${triggerInput.symbol || 'item'}`,
    tradeJournalId: triggerInput.tradeJournalId,
    symbol: triggerInput.symbol,
  };
}

export async function executeSafeAutomationActions(
  workflow,
  triggerInput,
  rollout,
  { notifications = globalThis.chrome?.notifications, runtime = globalThis.chrome?.runtime } = {}
) {
  const actions = Array.isArray(workflow?.actions) ? workflow.actions : [];
  const outcomes = [];

  for (const action of actions) {
    const actionType = getActionType(action);
    if (!actionType) continue;

    if (!rollout.enabled) {
      outcomes.push({
        type: actionType,
        status: rollout.shadowMode ? 'shadowed' : 'disabled',
        preview: action,
      });
      continue;
    }

    switch (actionType) {
      case AUTOMATION_ACTION_TYPES.NOTIFY: {
        const payload = buildNotificationPayload(workflow, triggerInput, action);
        try {
          if (notifications?.create) {
            notifications.create(`automation-${workflow?.id || Date.now()}-${outcomes.length}`, {
              type: 'basic',
              iconUrl: runtime?.getURL ? runtime.getURL('icons/icon48.png') : 'icons/icon48.png',
              title: payload.title,
              message: payload.message,
              priority: 1,
            });
            outcomes.push({ type: actionType, status: 'executed', ...payload });
          } else {
            outcomes.push({ type: actionType, status: 'logged', ...payload });
          }
        } catch (error) {
          outcomes.push({ type: actionType, status: 'failed', error: error?.message || String(error) });
        }
        break;
      }

      case AUTOMATION_ACTION_TYPES.SUGGEST_REVIEW:
        outcomes.push({ status: 'logged', ...buildSuggestionPayload(action, triggerInput) });
        break;

      case AUTOMATION_ACTION_TYPES.QUEUE_TASK:
        outcomes.push({ status: 'logged', ...buildQueuedPayload(action, triggerInput, AUTOMATION_ACTION_TYPES.QUEUE_TASK) });
        break;

      case AUTOMATION_ACTION_TYPES.QUEUE_PROMPT:
        outcomes.push({ status: 'logged', ...buildQueuedPayload(action, triggerInput, AUTOMATION_ACTION_TYPES.QUEUE_PROMPT) });
        break;

      default:
        outcomes.push({ type: actionType, status: 'unsupported', preview: action });
        break;
    }
  }

  return {
    executed: rollout.enabled,
    shadowMode: rollout.shadowMode,
    actionCount: outcomes.length,
    actions: outcomes,
  };
}

export async function evaluateAutomationWorkflowRun(
  workflow,
  triggerInput,
  {
    rollout,
    now = new Date(),
    dedupHit = false,
    evaluation = null,
    dedupKey = null,
    notifications,
    runtime,
  } = {}
) {
  const workflowEvaluation = evaluation || evaluateAutomationTrigger(workflow, triggerInput);
  const resolvedDedupKey = dedupKey || buildAutomationDedupKey(workflow, triggerInput);
  const evaluationResult = {
    ...workflowEvaluation,
    rollout,
    summary: buildTriggerSummary(workflowEvaluation.triggerType, triggerInput),
  };

  if (!workflowEvaluation.matched) {
    return {
      matched: false,
      status: 'not_matched',
      dedupKey: resolvedDedupKey,
      evaluationResult,
      actionOutcome: { executed: false, shadowMode: rollout?.shadowMode, actionCount: 0, actions: [] },
    };
  }

  if (!isRolloutActive(rollout)) {
    return {
      matched: true,
      status: 'disabled',
      dedupKey: resolvedDedupKey,
      evaluationResult,
      actionOutcome: { executed: false, shadowMode: false, actionCount: 0, actions: [] },
    };
  }

  if (dedupHit) {
    return {
      matched: true,
      status: 'dedup_skipped',
      dedupKey: resolvedDedupKey,
      evaluationResult,
      actionOutcome: { executed: false, shadowMode: rollout.shadowMode, actionCount: 0, actions: [], reason: 'dedup_window_active' },
    };
  }

  if (isWithinQuietHours(workflow?.quiet_hours || workflow?.quietHours, now)) {
    return {
      matched: true,
      status: 'quiet_hours_suppressed',
      dedupKey: resolvedDedupKey,
      evaluationResult,
      actionOutcome: { executed: false, shadowMode: rollout.shadowMode, actionCount: 0, actions: [], reason: 'quiet_hours_active' },
    };
  }

  const actionOutcome = await executeSafeAutomationActions(workflow, triggerInput, rollout, { notifications, runtime });

  return {
    matched: true,
    status: rollout.enabled ? 'executed' : 'shadowed',
    dedupKey: resolvedDedupKey,
    evaluationResult,
    actionOutcome,
  };
}

async function hasRecentAutomationExecution(userId, workflowId, dedupKey, dedupWindowMinutes, correlationId) {
  if (!workflowId || !dedupKey || !Number.isFinite(dedupWindowMinutes) || dedupWindowMinutes <= 0) {
    return false;
  }

  const since = new Date(Date.now() - (dedupWindowMinutes * 60 * 1000)).toISOString();
  const rows = await supabaseWithRetry(async () => {
    const { data, error } = await supabase
      .from('automation_execution_logs')
      .select('id, executed_at')
      .eq('user_id', userId)
      .eq('workflow_id', workflowId)
      .eq('dedup_key', dedupKey)
      .gte('executed_at', since)
      .order('executed_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data || [];
  }, { operationName: 'automation.checkDedup', correlationId, maxRetries: 1 });

  return rows.length > 0;
}

async function persistAutomationExecutionLog(userId, workflowId, triggerInput, execution, correlationId) {
  return supabaseWithRetry(async () => {
    const { data, error } = await supabase
      .from('automation_execution_logs')
      .insert({
        user_id: userId,
        workflow_id: workflowId,
        trigger_input: triggerInput,
        evaluation_result: execution.evaluationResult,
        action_outcome: execution.actionOutcome,
        status: execution.status,
        dedup_key: execution.dedupKey,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }, { operationName: 'automation.persistExecution', correlationId, maxRetries: 1 });
}

export async function recordRolloutTelemetry({
  userId,
  capability,
  rollout,
  triggerInput = {},
  resultPayload = {},
  status = 'captured',
  workflowId = null,
  tradeJournalId = null,
  correlationId = null,
}) {
  try {
    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('decision_rollout_events')
        .insert({
          user_id: userId,
          capability,
          workflow_id: workflowId,
          trade_journal_id: tradeJournalId,
          rollout_context: rollout || {},
          trigger_input: triggerInput || {},
          result_payload: resultPayload || {},
          status,
        });
      if (error) throw error;
    }, { operationName: `rollout.${capability}`, correlationId, maxRetries: 1 });

    return true;
  } catch (error) {
    logger.warn('Failed to persist rollout telemetry', {
      capability,
      correlationId,
      error: error?.message,
    });
    return false;
  }
}

export async function runJournalAutomationWorkflows({
  userId,
  currentEntry,
  previousEntry = null,
  decisionScore = null,
  guardrailResult = null,
  eventName = 'journal_update',
  correlationId = null,
  settingsConfig = null,
}) {
  const effectiveSettingsConfig = settingsConfig || await getUserSettingsConfig(userId);
  const rollout = resolveCapabilityRollout(ROLLOUT_CAPABILITIES.AUTOMATION_HUB, effectiveSettingsConfig);
  if (!isRolloutActive(rollout)) {
    return { rollout, executions: [] };
  }

  const workflows = await supabaseWithRetry(async () => {
    const { data, error } = await supabase
      .from('automation_workflows')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }, { operationName: 'automation.fetchActiveWorkflows', correlationId, maxRetries: 1 });

  if (workflows.length === 0) {
    return { rollout, executions: [] };
  }

  const triggerInput = buildJournalAutomationTriggerInput({
    eventName,
    currentEntry,
    previousEntry,
    decisionScore,
    guardrailResult,
  });

  const executions = [];
  for (const workflow of workflows) {
    const evaluation = evaluateAutomationTrigger(workflow, triggerInput);
    if (!evaluation.matched) continue;

    try {
      const dedupKey = buildAutomationDedupKey(workflow, triggerInput);
      const dedupWindowMinutes = Number(workflow.dedup_window_minutes || workflow.dedupWindowMinutes || 60);
      const dedupHit = await hasRecentAutomationExecution(
        userId,
        workflow.id,
        dedupKey,
        dedupWindowMinutes,
        correlationId
      );

      const execution = await evaluateAutomationWorkflowRun(workflow, triggerInput, {
        rollout,
        evaluation,
        dedupKey,
        dedupHit,
      });
      if (!execution.matched) continue;

      const persisted = await persistAutomationExecutionLog(userId, workflow.id, triggerInput, execution, correlationId);
      await recordRolloutTelemetry({
        userId,
        capability: ROLLOUT_CAPABILITIES.AUTOMATION_HUB,
        workflowId: workflow.id,
        tradeJournalId: currentEntry?.id || null,
        rollout,
        triggerInput,
        resultPayload: {
          executionLogId: persisted?.id || null,
          status: execution.status,
          evaluationResult: execution.evaluationResult,
          actionOutcome: execution.actionOutcome,
        },
        status: execution.status,
        correlationId,
      });

      executions.push({
        workflowId: workflow.id,
        status: execution.status,
        dedupKey,
        evaluationResult: execution.evaluationResult,
        actionOutcome: execution.actionOutcome,
      });
    } catch (error) {
      logger.warn('Workflow execution failed', {
        workflowId: workflow.id,
        correlationId,
        error: error?.message,
      });
    }
  }

  return { rollout, executions };
}
