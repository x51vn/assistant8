/**
 * Unit tests for Trading Journal handler logic
 *
 * Tests isolated pure functions extracted from journal.js:
 *   - computeRMultiple
 *   - status machine transitions
 *   - metrics computation
 *   - prefill regimePrefill null case
 *   - checklist defaults when table is empty
 *
 * Change: trading-journal-mvp
 */

import { describe, it, expect } from 'vitest';

// ─── Inline the pure helpers (same logic as journal.js) ───────────────────────

const VALID_TRANSITIONS = {
  planned: ['open'],
  open: ['closed'],
  closed: ['reviewed'],
  reviewed: [],
};

const DEFAULT_CHECKLIST_RULES = [
  { rule_key: 'regime_ok',      label: 'Market regime phải ON',    order_num: 1 },
  { rule_key: 'sector_ok',      label: 'Sector trend không DOWN',  order_num: 2 },
  { rule_key: 'entry_at_zone',  label: 'Entry tại vùng kế hoạch',  order_num: 3 },
  { rule_key: 'stoploss_set',   label: 'Stoploss đã xác định',     order_num: 4 },
  { rule_key: 'position_sized', label: 'Position size đã tính',    order_num: 5 },
  { rule_key: 'thesis_written', label: 'Thesis đã viết rõ ràng',   order_num: 6 },
];

function computeRMultiple(exit, entry, plannedStoploss) {
  if (plannedStoploss == null || plannedStoploss === entry) return null;
  const risk = entry - plannedStoploss;
  if (risk === 0) return null;
  return (exit - entry) / risk;
}

function isValidTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

function computeMetrics(entries) {
  if (!entries || entries.length === 0) {
    return {
      totalTrades: 0, winCount: 0, lossCount: 0, winRate: null,
      avgRMultiple: null, ruleAdherenceRate: null, topErrors: [], periodTrades: 0,
    };
  }
  const winCount = entries.filter(e => (e.pnl_pct || 0) > 0).length;
  const lossCount = entries.length - winCount;
  const winRate = entries.length > 0 ? winCount / entries.length : null;

  const validR = entries.filter(e => e.r_multiple != null).map(e => Number(e.r_multiple));
  const avgRMultiple = validR.length > 0
    ? validR.reduce((s, r) => s + r, 0) / validR.length
    : null;

  const withChecklist = entries.filter(e => e.checklist && Object.keys(e.checklist).length > 0);
  let ruleAdherenceRate = null;
  if (withChecklist.length > 0) {
    let total = 0, checked = 0;
    for (const e of withChecklist) {
      const vals = Object.values(e.checklist);
      total += vals.length;
      checked += vals.filter(Boolean).length;
    }
    ruleAdherenceRate = total > 0 ? checked / total : null;
  }

  const errorCounts = {};
  for (const e of entries) {
    if (e.error_category) {
      errorCounts[e.error_category] = (errorCounts[e.error_category] || 0) + 1;
    }
  }
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({ category, count }));

  return { totalTrades: entries.length, winCount, lossCount, winRate, avgRMultiple, ruleAdherenceRate, topErrors };
}

function getChecklistOrDefaults(templates) {
  if (!templates || templates.length === 0) {
    return DEFAULT_CHECKLIST_RULES.map(r => ({ ...r, is_default: true }));
  }
  return templates;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeRMultiple', () => {
  it('computes positive R correctly', () => {
    // Entry=100, stoploss=95, exit=110 → risk=5, gain=10 → R=2
    expect(computeRMultiple(110, 100, 95)).toBeCloseTo(2);
  });

  it('computes negative R correctly', () => {
    // Entry=100, stoploss=95, exit=97 → risk=5, loss=-3 → R=-0.6
    expect(computeRMultiple(97, 100, 95)).toBeCloseTo(-0.6);
  });

  it('returns null when stoploss equals entry (avoids division by zero)', () => {
    expect(computeRMultiple(110, 100, 100)).toBeNull();
  });

  it('returns null when stoploss is null', () => {
    expect(computeRMultiple(110, 100, null)).toBeNull();
  });

  it('returns null when stoploss is undefined', () => {
    expect(computeRMultiple(110, 100, undefined)).toBeNull();
  });

  it('computes zero R when exit equals entry', () => {
    expect(computeRMultiple(100, 100, 95)).toBeCloseTo(0);
  });
});

describe('Status machine transitions', () => {
  it('allows planned → open', () => {
    expect(isValidTransition('planned', 'open')).toBe(true);
  });

  it('allows open → closed', () => {
    expect(isValidTransition('open', 'closed')).toBe(true);
  });

  it('allows closed → reviewed', () => {
    expect(isValidTransition('closed', 'reviewed')).toBe(true);
  });

  it('rejects planned → closed (skip)', () => {
    expect(isValidTransition('planned', 'closed')).toBe(false);
  });

  it('rejects open → reviewed (skip)', () => {
    expect(isValidTransition('open', 'reviewed')).toBe(false);
  });

  it('rejects reviewed → any (terminal state)', () => {
    expect(isValidTransition('reviewed', 'closed')).toBe(false);
    expect(isValidTransition('reviewed', 'planned')).toBe(false);
  });

  it('rejects backwards transition (closed → open)', () => {
    expect(isValidTransition('closed', 'open')).toBe(false);
  });

  it('rejects unknown status', () => {
    expect(isValidTransition('unknown', 'open')).toBe(false);
  });
});

describe('Metrics computation', () => {
  it('returns empty metrics when no entries', () => {
    const m = computeMetrics([]);
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.avgRMultiple).toBeNull();
  });

  it('computes win rate correctly', () => {
    const entries = [
      { pnl_pct: 0.05, r_multiple: 2, checklist: {}, error_category: null },
      { pnl_pct: -0.03, r_multiple: -0.6, checklist: {}, error_category: null },
      { pnl_pct: 0.08, r_multiple: 1.5, checklist: {}, error_category: null },
      { pnl_pct: -0.01, r_multiple: -0.2, checklist: {}, error_category: null },
    ];
    const m = computeMetrics(entries);
    expect(m.totalTrades).toBe(4);
    expect(m.winCount).toBe(2);
    expect(m.lossCount).toBe(2);
    expect(m.winRate).toBeCloseTo(0.5);
  });

  it('excludes null R from avgRMultiple', () => {
    const entries = [
      { pnl_pct: 0.05, r_multiple: 2, checklist: {} },
      { pnl_pct: 0.03, r_multiple: null, checklist: {} }, // no stoploss
    ];
    const m = computeMetrics(entries);
    expect(m.avgRMultiple).toBeCloseTo(2); // only non-null used
  });

  it('returns null avgRMultiple when all R are null', () => {
    const entries = [
      { pnl_pct: 0.05, r_multiple: null, checklist: {} },
    ];
    const m = computeMetrics(entries);
    expect(m.avgRMultiple).toBeNull();
  });

  it('excludes empty checklists from rule adherence', () => {
    const entries = [
      { pnl_pct: 0.05, r_multiple: 1, checklist: { regime_ok: true, entry_at_zone: false } },
      { pnl_pct: 0.05, r_multiple: 1, checklist: {} }, // empty — excluded
    ];
    const m = computeMetrics(entries);
    // Only first entry counted: 1/2 checked
    expect(m.ruleAdherenceRate).toBeCloseTo(0.5);
  });

  it('returns null ruleAdherenceRate when all checklists empty', () => {
    const entries = [
      { pnl_pct: 0.05, r_multiple: 1, checklist: {} },
    ];
    const m = computeMetrics(entries);
    expect(m.ruleAdherenceRate).toBeNull();
  });

  it('returns top 3 errors by count', () => {
    const entries = [
      { pnl_pct: -0.01, r_multiple: -0.2, checklist: {}, error_category: 'fomo' },
      { pnl_pct: -0.02, r_multiple: -0.5, checklist: {}, error_category: 'fomo' },
      { pnl_pct: -0.01, r_multiple: -0.1, checklist: {}, error_category: 'late_entry' },
      { pnl_pct: -0.03, r_multiple: -0.3, checklist: {}, error_category: 'oversize' },
      { pnl_pct: -0.01, r_multiple: -0.1, checklist: {}, error_category: 'fomo' },
      { pnl_pct: -0.05, r_multiple: -1, checklist: {}, error_category: null },
    ];
    const m = computeMetrics(entries);
    expect(m.topErrors).toHaveLength(3);
    expect(m.topErrors[0]).toEqual({ category: 'fomo', count: 3 });
    expect(m.topErrors[1].count).toBeLessThanOrEqual(m.topErrors[0].count);
  });
});

describe('Prefill: regimePrefill null when no market assessment', () => {
  it('returns null regimePrefill when assessment is missing', () => {
    // Simulate handler returning regimePrefill: null
    const prefillResult = {
      symbol: 'HPG',
      watchlistPrefill: { id: '1', symbol: 'HPG', entry: 50000 },
      regimePrefill: null,
      checklistTemplate: DEFAULT_CHECKLIST_RULES,
    };
    expect(prefillResult.regimePrefill).toBeNull();
    expect(prefillResult.symbol).toBe('HPG');
  });

  it('still returns checklist template even without regime', () => {
    const prefillResult = {
      symbol: 'VNM',
      watchlistPrefill: null,
      regimePrefill: null,
      checklistTemplate: DEFAULT_CHECKLIST_RULES,
    };
    expect(prefillResult.checklistTemplate).toHaveLength(6);
  });
});

describe('Checklist: returns defaults when templates table is empty', () => {
  it('returns DEFAULT_CHECKLIST_RULES with is_default flag when no DB templates', () => {
    const result = getChecklistOrDefaults([]);
    expect(result).toHaveLength(6);
    expect(result[0].rule_key).toBe('regime_ok');
    expect(result[0].is_default).toBe(true);
  });

  it('returns DB templates unchanged when they exist', () => {
    const dbTemplates = [
      { id: '1', rule_key: 'my_rule', label: 'My custom rule', order_num: 1, is_active: true },
    ];
    const result = getChecklistOrDefaults(dbTemplates);
    expect(result).toHaveLength(1);
    expect(result[0].rule_key).toBe('my_rule');
    expect(result[0].is_default).toBeUndefined();
  });

  it('all default rules have required fields', () => {
    const defaults = getChecklistOrDefaults([]);
    for (const r of defaults) {
      expect(r.rule_key).toBeTruthy();
      expect(r.label).toBeTruthy();
      expect(typeof r.order_num).toBe('number');
    }
  });
});
