import { describe, it, expect } from 'vitest';
import { DecisionIntelligenceMapper } from '../../../src/shared/mappers/decisionIntelligenceMapper.js';

describe('DecisionIntelligenceMapper', () => {
  it('maps decision snapshot dto to entity', () => {
    const entity = DecisionIntelligenceMapper.toDecisionScoreSnapshotEntity({
      tradeJournalId: '11111111-1111-1111-1111-111111111111',
      symbol: 'VNM',
      policyVersion: 'decision-policy@1',
      inputFingerprint: 'VNM::1',
      decisionScore: 78.5,
      grade: 'B',
      ruleBreakdown: [{ key: 'a' }],
      blockingReasons: [],
      advice: ['x'],
    }, '22222222-2222-2222-2222-222222222222');

    expect(entity.user_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(entity.trade_journal_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(entity.decision_score).toBe(78.5);
    expect(entity.rule_breakdown).toHaveLength(1);
  });

  it('maps playbook entity to response model', () => {
    const mapped = DecisionIntelligenceMapper.fromPlaybookInsightEntity({
      id: 'id1',
      insight_key: 'winning_setup',
      title: 'Title',
      recommendation: 'Reco',
      evidence_summary: 'Evidence',
      confidence: '0.76',
      payload: { a: 1 },
      rank_score: '88.2',
      generated_at: '2026-04-28T00:00:00Z',
      expires_at: null,
    });

    expect(mapped.insightKey).toBe('winning_setup');
    expect(mapped.confidence).toBeCloseTo(0.76);
    expect(mapped.rankScore).toBeCloseTo(88.2);
  });

  it('maps automation workflow dto to entity defaults', () => {
    const entity = DecisionIntelligenceMapper.toAutomationWorkflowEntity({
      name: 'Regime OFF Alert',
      trigger_type: 'regime_change',
      actions: [{ type: 'notify' }],
    }, 'u1');

    expect(entity.user_id).toBe('u1');
    expect(entity.is_active).toBe(true);
    expect(entity.dedup_window_minutes).toBe(60);
  });
});
