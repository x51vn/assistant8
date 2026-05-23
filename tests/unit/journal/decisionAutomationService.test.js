import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/supabaseConfig.js', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn(async (fn) => fn()),
}));

vi.mock('../../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  ROLLOUT_CAPABILITIES,
  AUTOMATION_TRIGGER_TYPES,
  AUTOMATION_ACTION_TYPES,
  resolveCapabilityRollout,
  buildJournalAutomationTriggerInput,
  evaluateAutomationTrigger,
  buildAutomationDedupKey,
  isWithinQuietHours,
  evaluateAutomationWorkflowRun,
} from '../../../src/background/services/decisionAutomationService.js';

describe('decisionAutomationService.resolveCapabilityRollout', () => {
  it('returns enabled decision rollout context by default', () => {
    const rollout = resolveCapabilityRollout(ROLLOUT_CAPABILITIES.DECISION_SCORE, {});

    expect(rollout.stage).toBe('enabled');
    expect(rollout.shadowMode).toBe(true);
  });

  it('returns shadow automation rollout context by default', () => {
    const rollout = resolveCapabilityRollout(ROLLOUT_CAPABILITIES.AUTOMATION_HUB, {});

    expect(rollout.stage).toBe('shadow');
    expect(rollout.enabled).toBe(false);
  });

  it('returns disabled rollout when both flags are false', () => {
    const rollout = resolveCapabilityRollout(ROLLOUT_CAPABILITIES.AUTOMATION_HUB, {
      automation_hub_enabled: false,
      automation_hub_shadow_mode: false,
    });

    expect(rollout.stage).toBe('disabled');
  });
});

describe('decisionAutomationService trigger evaluation', () => {
  const baseTriggerInput = buildJournalAutomationTriggerInput({
    eventName: 'journal_update',
    previousEntry: {
      id: 'j-1',
      symbol: 'VNM',
      status: 'open',
      market_regime_snapshot: 'OFF',
      checklist: { regime_ok: false, stoploss_set: true },
      guardrail_result_snapshot: { allowed: true },
    },
    currentEntry: {
      id: 'j-1',
      symbol: 'VNM',
      status: 'closed',
      market_regime_snapshot: 'ON',
      checklist: { regime_ok: true, stoploss_set: true },
      guardrail_result_snapshot: { allowed: false },
      decision_score_snapshot: { decisionScore: 82, grade: 'B' },
    },
    decisionScore: { decisionScore: 82, grade: 'B' },
    guardrailResult: { allowed: false, blockingReasons: ['Risk too high'], warnings: [] },
  });

  it('matches market regime transitions', () => {
    const result = evaluateAutomationTrigger({
      trigger_type: AUTOMATION_TRIGGER_TYPES.MARKET_REGIME_TRANSITION,
      conditions: { from: 'OFF', to: 'ON' },
    }, baseTriggerInput);

    expect(result.matched).toBe(true);
  });

  it('matches review readiness with checklist threshold', () => {
    const result = evaluateAutomationTrigger({
      trigger_type: AUTOMATION_TRIGGER_TYPES.REVIEW_READY,
      conditions: { status: 'closed', minChecklistRatio: 0.5, minDecisionScore: 70 },
    }, baseTriggerInput);

    expect(result.matched).toBe(true);
  });

  it('matches guardrail state changes', () => {
    const result = evaluateAutomationTrigger({
      trigger_type: AUTOMATION_TRIGGER_TYPES.GUARDRAIL_STATE_CHANGE,
      conditions: { allowed: false },
    }, baseTriggerInput);

    expect(result.matched).toBe(true);
  });

  it('matches checklist state changes for required keys', () => {
    const result = evaluateAutomationTrigger({
      trigger_type: AUTOMATION_TRIGGER_TYPES.CHECKLIST_STATE_CHANGE,
      conditions: { requiredKeys: ['regime_ok'] },
    }, baseTriggerInput);

    expect(result.matched).toBe(true);
  });

  it('builds stable dedup keys', () => {
    const dedupKey = buildAutomationDedupKey({
      id: 'wf-1',
      trigger_type: AUTOMATION_TRIGGER_TYPES.REVIEW_READY,
    }, baseTriggerInput);

    expect(dedupKey).toContain('wf-1');
    expect(dedupKey).toContain('review_ready');
  });
});

describe('decisionAutomationService quiet hours and execution', () => {
  beforeEach(() => {
    globalThis.chrome = {
      notifications: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn((path) => `chrome-extension://test/${path}`),
      },
    };
  });

  it('detects overnight quiet hours windows', () => {
    const now = new Date('2026-05-23T22:30:00Z');
    const insideQuietHours = isWithinQuietHours({ start: '22:00', end: '06:00' }, now);

    expect(insideQuietHours).toBe(true);
  });

  it('returns shadowed execution when automation rollout is shadow-only', async () => {
    const triggerInput = buildJournalAutomationTriggerInput({
      eventName: 'journal_update',
      previousEntry: { symbol: 'VNM', status: 'open', checklist: {}, guardrail_result_snapshot: { allowed: true } },
      currentEntry: { symbol: 'VNM', status: 'closed', checklist: {}, guardrail_result_snapshot: { allowed: true } },
      decisionScore: { decisionScore: 80, grade: 'B' },
      guardrailResult: { allowed: true, blockingReasons: [], warnings: [] },
    });

    const execution = await evaluateAutomationWorkflowRun({
      id: 'wf-1',
      name: 'Review Ready',
      trigger_type: AUTOMATION_TRIGGER_TYPES.REVIEW_READY,
      actions: [{ type: AUTOMATION_ACTION_TYPES.NOTIFY }],
    }, triggerInput, {
      rollout: resolveCapabilityRollout(ROLLOUT_CAPABILITIES.AUTOMATION_HUB, {}),
    });

    expect(execution.status).toBe('shadowed');
    expect(execution.actionOutcome.actions[0].status).toBe('shadowed');
  });

  it('enforces requireFollowedPlan when configured', () => {
    const triggerInput = buildJournalAutomationTriggerInput({
      eventName: 'journal_update',
      previousEntry: { symbol: 'VNM', status: 'open', checklist: {} },
      currentEntry: { symbol: 'VNM', status: 'closed', checklist: {}, followed_plan: false },
      decisionScore: { decisionScore: 80, grade: 'B' },
      guardrailResult: { allowed: true, blockingReasons: [], warnings: [] },
    });

    const result = evaluateAutomationTrigger({
      trigger_type: AUTOMATION_TRIGGER_TYPES.REVIEW_READY,
      conditions: { status: 'closed', requireFollowedPlan: true },
    }, triggerInput);

    expect(result.matched).toBe(false);
    expect(result.reason).toContain('followed_plan');
  });

  it('executes safe actions when automation rollout is enabled', async () => {
    const triggerInput = buildJournalAutomationTriggerInput({
      eventName: 'journal_update',
      previousEntry: { symbol: 'VNM', status: 'open', checklist: {}, guardrail_result_snapshot: { allowed: true } },
      currentEntry: { symbol: 'VNM', status: 'closed', checklist: {}, guardrail_result_snapshot: { allowed: true } },
      decisionScore: { decisionScore: 80, grade: 'B' },
      guardrailResult: { allowed: true, blockingReasons: [], warnings: [] },
    });

    const execution = await evaluateAutomationWorkflowRun({
      id: 'wf-1',
      name: 'Review Ready',
      trigger_type: AUTOMATION_TRIGGER_TYPES.REVIEW_READY,
      actions: [{ type: AUTOMATION_ACTION_TYPES.NOTIFY }, { type: AUTOMATION_ACTION_TYPES.SUGGEST_REVIEW }],
    }, triggerInput, {
      rollout: resolveCapabilityRollout(ROLLOUT_CAPABILITIES.AUTOMATION_HUB, {
        automation_hub_enabled: true,
        automation_hub_shadow_mode: false,
      }),
    });

    expect(execution.status).toBe('executed');
    expect(globalThis.chrome.notifications.create).toHaveBeenCalledTimes(1);
    expect(execution.actionOutcome.actions.some((action) => action.status === 'logged')).toBe(true);
  });

  it('suppresses execution when dedup window is active', async () => {
    const triggerInput = buildJournalAutomationTriggerInput({
      eventName: 'journal_update',
      previousEntry: { symbol: 'VNM', status: 'open', checklist: {}, guardrail_result_snapshot: { allowed: true } },
      currentEntry: { symbol: 'VNM', status: 'closed', checklist: {}, guardrail_result_snapshot: { allowed: true } },
      decisionScore: { decisionScore: 80, grade: 'B' },
      guardrailResult: { allowed: true, blockingReasons: [], warnings: [] },
    });

    const execution = await evaluateAutomationWorkflowRun({
      id: 'wf-1',
      name: 'Review Ready',
      trigger_type: AUTOMATION_TRIGGER_TYPES.REVIEW_READY,
      actions: [{ type: AUTOMATION_ACTION_TYPES.NOTIFY }],
    }, triggerInput, {
      rollout: resolveCapabilityRollout(ROLLOUT_CAPABILITIES.AUTOMATION_HUB, {
        automation_hub_enabled: true,
        automation_hub_shadow_mode: false,
      }),
      dedupHit: true,
    });

    expect(execution.status).toBe('dedup_skipped');
  });
});
