import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockGetUserSettingsConfig: vi.fn(),
  mockResolveCapabilityRollout: vi.fn(),
  mockRecordRolloutTelemetry: vi.fn(),
  mockRunJournalAutomationWorkflows: vi.fn(),
  queryState: {
    decisionCount: 1,
    insertedJournalRow: null,
    guardrailAllowed: true,
    playbookRows: [],
    executionRows: [],
  },
}));

globalThis.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getURL: vi.fn((path) => `chrome-extension://test/${path}`),
  },
  notifications: {
    create: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
};

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    startOperation: vi.fn(() => 'corr-op'),
    endOperation: vi.fn(),
  }),
  generateCorrelationId: vi.fn(() => 'test-corr-id'),
}));

vi.mock('../../src/background/services/decisionAutomationService.js', () => ({
  ROLLOUT_CAPABILITIES: {
    DECISION_SCORE: 'decision_score',
    GUARDRAIL_EVALUATION: 'guardrail_evaluation',
    PLAYBOOK_INSIGHTS: 'playbook_insights',
    AUTOMATION_HUB: 'automation_hub',
  },
  getUserSettingsConfig: (...args) => hoisted.mockGetUserSettingsConfig(...args),
  resolveCapabilityRollout: (...args) => hoisted.mockResolveCapabilityRollout(...args),
  isRolloutActive: vi.fn((rollout) => rollout.enabled || rollout.shadowMode),
  recordRolloutTelemetry: (...args) => hoisted.mockRecordRolloutTelemetry(...args),
  runJournalAutomationWorkflows: (...args) => hoisted.mockRunJournalAutomationWorkflows(...args),
}));

vi.mock('../../src/background/utils/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue('test-user-123'),
}));

vi.mock('../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn(async (fn) => fn()),
}));

function makeFilterBuilder(resultFactory) {
  const builder = {
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    gte: vi.fn(async () => resultFactory()),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => resultFactory()),
    maybeSingle: vi.fn(async () => resultFactory()),
    single: vi.fn(async () => resultFactory()),
    select: vi.fn(() => builder),
    upsert: vi.fn(async () => ({ error: null })),
    insert: vi.fn(() => ({ select: () => ({ single: async () => resultFactory() }) })),
    update: vi.fn(() => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => resultFactory() }) }) }) })),
    delete: vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) })),
  };
  return builder;
}

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'trade_journal') {
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const countBuilder = {
                eq: vi.fn(() => countBuilder),
                not: vi.fn(() => countBuilder),
                gte: vi.fn(async () => ({ count: hoisted.queryState.decisionCount, error: null })),
              };
              return countBuilder;
            }

            const selectBuilder = {
              eq: vi.fn(() => selectBuilder),
              order: vi.fn(() => selectBuilder),
              limit: vi.fn(async () => ({ data: hoisted.queryState.playbookRows, error: null })),
              single: vi.fn(async () => ({ data: hoisted.queryState.insertedJournalRow, error: null })),
            };
            return selectBuilder;
          }),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: hoisted.queryState.insertedJournalRow, error: null })),
            })),
          })),
          update: vi.fn((updateData) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { ...hoisted.queryState.insertedJournalRow, ...updateData },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'decision_score_snapshots' || table === 'guardrail_evaluations') {
        return {
          insert: vi.fn(async () => ({ error: null })),
        };
      }

      if (table === 'playbook_insights') {
        return {
          select: vi.fn(() => {
            const builder = {
              eq: vi.fn(() => builder),
              order: vi.fn(() => builder),
              limit: vi.fn(async () => ({ data: hoisted.queryState.playbookRows, error: null })),
            };
            return builder;
          }),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }

      if (table === 'playbook_insight_feedback') {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        };
      }

      if (table === 'automation_execution_logs') {
        return {
          select: vi.fn(() => {
            const builder = {
              eq: vi.fn(() => builder),
              order: vi.fn(() => builder),
              limit: vi.fn(async () => ({ data: hoisted.queryState.executionRows, error: null })),
            };
            return builder;
          }),
        };
      }

      if (table === 'checklist_templates') {
        return {
          select: vi.fn(() => {
            const builder = {
              eq: vi.fn(() => builder),
              order: vi.fn(async () => ({ data: [], error: null })),
            };
            return builder;
          }),
        };
      }

      return makeFilterBuilder(() => ({ data: null, error: null }));
    }),
  },
}));

import { route } from '../../src/background/messageRouter.js';
import { MESSAGE_TYPES } from '../../src/shared/messageSchema.js';

await import('../../src/background/handlers/decisionIntelligence.js');
await import('../../src/background/handlers/journal.js');

function makeMessage(type, data = {}) {
  return {
    v: 1,
    type,
    correlationId: 'test-corr-001',
    timestamp: Date.now(),
    data,
  };
}

const mockSender = { tab: null, id: 'test' };

describe('Decision automation handler integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.queryState.decisionCount = 2;
    hoisted.queryState.insertedJournalRow = {
      id: 'journal-1',
      symbol: 'VNM',
      status: 'planned',
      checklist: { regime_ok: true },
      decision_score_snapshot: { decisionScore: 82, grade: 'B' },
      guardrail_result_snapshot: { allowed: true, warnings: [], blockingReasons: [] },
    };
    hoisted.queryState.playbookRows = [
      {
        id: 'insight-1',
        insight_key: 'winning_setup',
        title: 'Winning setup',
        recommendation: 'Focus on breakouts',
        evidence_summary: '2/3 recent wins',
        confidence: '0.8',
        payload: {},
        rank_score: '88',
        generated_at: '2026-05-23T00:00:00Z',
        expires_at: null,
      },
    ];
    hoisted.queryState.executionRows = [
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        trigger_input: { symbol: 'VNM' },
        evaluation_result: { rollout: { stage: 'shadow' } },
        action_outcome: { actions: [{ type: 'notify', status: 'shadowed' }] },
        status: 'shadowed',
        dedup_key: 'wf-1::review_ready::VNM',
        executed_at: '2026-05-23T00:00:00Z',
      },
    ];

    hoisted.mockGetUserSettingsConfig.mockResolvedValue({});
    hoisted.mockResolveCapabilityRollout.mockImplementation((capability) => ({
      capability,
      enabled: capability !== 'automation_hub',
      shadowMode: true,
      stage: capability !== 'automation_hub' ? 'enabled' : 'shadow',
    }));
    hoisted.mockRecordRolloutTelemetry.mockResolvedValue(true);
    hoisted.mockRunJournalAutomationWorkflows.mockResolvedValue({
      rollout: { enabled: false, shadowMode: true, stage: 'shadow' },
      executions: [{ workflowId: 'wf-1', status: 'shadowed' }],
    });
  });

  it('returns rollout metadata for DECISION_SCORE_EVALUATE', async () => {
    const response = await route(makeMessage(MESSAGE_TYPES.DECISION_SCORE_EVALUATE, {
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 95,
      checklist: { regime_ok: true },
      market_regime_snapshot: 'ON',
    }), mockSender);

    expect(response.type).toBe(MESSAGE_TYPES.DECISION_SCORE_RESULT);
    expect(response.rollout.stage).toBe('enabled');
    expect(hoisted.mockRecordRolloutTelemetry).toHaveBeenCalled();
  });

  it('returns rollout metadata for JOURNAL_GUARDRAIL_EVALUATE', async () => {
    const response = await route(makeMessage(MESSAGE_TYPES.JOURNAL_GUARDRAIL_EVALUATE, {
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 99,
      risk_per_trade_pct: 1,
      checklist: { regime_ok: true },
      market_regime_snapshot: 'ON',
    }), mockSender);

    expect(response.type).toBe(MESSAGE_TYPES.JOURNAL_GUARDRAIL_RESULT);
    expect(response.rollout.stage).toBe('enabled');
    expect(hoisted.mockRecordRolloutTelemetry).toHaveBeenCalled();
  });

  it('returns rollout metadata for PLAYBOOK_INSIGHTS_GET', async () => {
    const response = await route(makeMessage(MESSAGE_TYPES.PLAYBOOK_INSIGHTS_GET, {
      refresh: false,
      limit: 3,
    }), mockSender);

    expect(response.type).toBe(MESSAGE_TYPES.PLAYBOOK_INSIGHTS_DATA);
    expect(response.rollout.stage).toBe('enabled');
    expect(response.items).toHaveLength(1);
  });

  it('invokes automation runner during JOURNAL_CREATE', async () => {
    const response = await route(makeMessage(MESSAGE_TYPES.JOURNAL_CREATE, {
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 99,
      risk_per_trade_pct: 1,
      checklist: { regime_ok: true, stoploss_set: true },
      market_regime_snapshot: 'ON',
    }), mockSender);

    expect(response.type).toBe(MESSAGE_TYPES.JOURNAL_CREATED);
    expect(hoisted.mockRunJournalAutomationWorkflows).toHaveBeenCalled();
    expect(hoisted.mockRunJournalAutomationWorkflows.mock.calls[0][0].currentEntry.id).toBe('journal-1');
  });

  it('returns mapped automation execution history', async () => {
    const response = await route(makeMessage(MESSAGE_TYPES.AUTOMATION_EXECUTIONS_GET, {
      limit: 10,
    }), mockSender);

    expect(response.type).toBe(MESSAGE_TYPES.AUTOMATION_EXECUTIONS_DATA);
    expect(response.items[0].evaluationResult.rollout.stage).toBe('shadow');
    expect(response.items[0].actionOutcome.actions[0].status).toBe('shadowed');
  });
});
