import { describe, it, expect } from 'vitest';
import {
  evaluateDecisionScore,
  evaluateGuardrails,
  buildPlaybookInsightsFromEntries,
  DECISION_POLICY_VERSION,
  GUARDRAIL_POLICY_VERSION,
} from '../../../src/background/services/decisionIntelligenceService.js';

describe('decisionIntelligenceService.evaluateDecisionScore', () => {
  it('returns deterministic output for same input', () => {
    const input = {
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 95,
      risk_per_trade_pct: 1.2,
      checklist: { a: true, b: true, c: false },
      market_regime_snapshot: 'ON',
      recentErrorCount: 1,
    };

    const a = evaluateDecisionScore(input);
    const b = evaluateDecisionScore(input);

    expect(a).toEqual(b);
    expect(a.decisionScore).toBeGreaterThanOrEqual(0);
    expect(a.decisionScore).toBeLessThanOrEqual(100);
    expect(a.ruleBreakdown.length).toBeGreaterThan(0);
  });

  it('applies penalty for repeated mistakes', () => {
    const base = evaluateDecisionScore({
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 95,
      checklist: { a: true, b: true },
      market_regime_snapshot: 'ON',
      recentErrorCount: 0,
    });

    const penalized = evaluateDecisionScore({
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 95,
      checklist: { a: true, b: true },
      market_regime_snapshot: 'ON',
      recentErrorCount: 5,
    });

    expect(penalized.decisionScore).toBeLessThan(base.decisionScore);
  });

  it('returns blocking reason when stoploss missing', () => {
    const result = evaluateDecisionScore({
      symbol: 'VNM',
      planned_entry: 100,
      checklist: { a: true },
      market_regime_snapshot: 'OFF',
      recentErrorCount: 0,
    });

    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });
});

describe('decisionIntelligenceService.evaluateGuardrails', () => {
  it('blocks when stoploss missing', () => {
    const result = evaluateGuardrails({
      symbol: 'VNM',
      planned_entry: 100,
      checklist: { a: true },
      market_regime_snapshot: 'ON',
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons.join(' ')).toMatch(/stoploss/i);
  });

  it('blocks when risk exceeds threshold', () => {
    const result = evaluateGuardrails({
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 85,
      risk_per_trade_pct: 10,
      checklist: { a: true, b: true },
      market_regime_snapshot: 'ON',
    }, { maxRiskPct: 2 });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons.some((r) => r.includes('Risk per trade'))).toBe(true);
  });

  it('returns warning (not block) for checklist below threshold', () => {
    const result = evaluateGuardrails({
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 99,
      risk_per_trade_pct: 1,
      checklist: { a: false, b: false, c: true },
      market_regime_snapshot: 'ON',
    }, { minChecklistRatio: 0.8 });

    expect(result.allowed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('blocks when strict regime is enabled and regime OFF', () => {
    const result = evaluateGuardrails({
      symbol: 'VNM',
      planned_entry: 100,
      planned_stoploss: 99,
      risk_per_trade_pct: 1,
      checklist: { a: true, b: true },
      market_regime_snapshot: 'OFF',
      strictRegime: true,
    });

    expect(result.allowed).toBe(false);
  });

  it('exports policy versions', () => {
    expect(DECISION_POLICY_VERSION).toMatch(/decision-policy/);
    expect(GUARDRAIL_POLICY_VERSION).toMatch(/guardrail-policy/);
  });
});

describe('decisionIntelligenceService.buildPlaybookInsightsFromEntries', () => {
  it('returns empty array for sparse/no closed history', () => {
    const insights = buildPlaybookInsightsFromEntries([
      { status: 'planned', setup: 'Breakout', pnl_pct: null },
      { status: 'open', setup: 'Pullback', pnl_pct: null },
    ]);

    expect(insights).toEqual([]);
  });

  it('returns max top-3 ranked insights', () => {
    const entries = [
      { status: 'closed', setup: 'Breakout', pnl_pct: 0.1, error_category: 'late_entry', entry_date: '2026-04-01T08:00:00Z' },
      { status: 'reviewed', setup: 'Breakout', pnl_pct: 0.08, error_category: 'late_entry', entry_date: '2026-04-02T08:00:00Z' },
      { status: 'closed', setup: 'Pullback', pnl_pct: -0.04, error_category: 'oversized', entry_date: '2026-04-03T10:00:00Z' },
      { status: 'reviewed', setup: 'Range', pnl_pct: 0.03, error_category: null, entry_date: '2026-04-03T10:00:00Z' },
    ];

    const insights = buildPlaybookInsightsFromEntries(entries);
    expect(insights.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < insights.length; i += 1) {
      expect(insights[i - 1].rankScore).toBeGreaterThanOrEqual(insights[i].rankScore);
    }
  });
});
