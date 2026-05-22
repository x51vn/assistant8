/**
 * Decision Intelligence rule engine (Phase A)
 *
 * Rule-based weighted scoring plus pre-trade guardrail checks.
 */

export const DECISION_POLICY_VERSION = 'decision-policy@1';
export const GUARDRAIL_POLICY_VERSION = 'guardrail-policy@1';

const GRADE_BANDS = [
  { min: 85, grade: 'A' },
  { min: 70, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 0, grade: 'D' },
];

const DEFAULT_SCORING_WEIGHTS = {
  checklistAdherence: 35,
  regimeAlignment: 25,
  riskControl: 25,
  repeatedMistakePenalty: 15,
};

function safePercent(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return numerator / denominator;
}

function computeChecklistAdherence(checklist = {}) {
  const vals = Object.values(checklist || {});
  if (vals.length === 0) return 0.5;
  const checked = vals.filter(Boolean).length;
  return safePercent(checked, vals.length);
}

function computeRepeatedMistakePenalty(recentErrorCount = 0) {
  if (recentErrorCount <= 0) return 0;
  if (recentErrorCount >= 5) return 1;
  return recentErrorCount / 5;
}

function gradeFromScore(score) {
  for (const band of GRADE_BANDS) {
    if (score >= band.min) return band.grade;
  }
  return 'D';
}

/**
 * @param {object} input
 * @param {object} [options]
 * @returns {{decisionScore:number, grade:string, ruleBreakdown:Array, blockingReasons:Array, advice:Array}}
 */
export function evaluateDecisionScore(input, options = {}) {
  const weights = { ...DEFAULT_SCORING_WEIGHTS, ...(options.weights || {}) };

  const checklistRatio = computeChecklistAdherence(input.checklist || {});
  const regimeOn = String(input.market_regime_snapshot || '').toUpperCase() === 'ON';

  const plannedEntry = Number(input.planned_entry);
  const plannedStoploss = Number(input.planned_stoploss);
  let riskControlRatio = 0.5;
  if (Number.isFinite(plannedEntry) && Number.isFinite(plannedStoploss) && plannedEntry > 0 && plannedStoploss > 0) {
    const relativeRisk = Math.abs((plannedEntry - plannedStoploss) / plannedEntry);
    // Better score when risk is <= 8%; linear fade to zero by 20%
    if (relativeRisk <= 0.08) riskControlRatio = 1;
    else if (relativeRisk >= 0.2) riskControlRatio = 0;
    else riskControlRatio = 1 - ((relativeRisk - 0.08) / 0.12);
  }

  const repeatedPenalty = computeRepeatedMistakePenalty(Number(input.recentErrorCount || 0));

  const checklistScore = checklistRatio * weights.checklistAdherence;
  const regimeScore = (regimeOn ? 1 : 0.35) * weights.regimeAlignment;
  const riskScore = riskControlRatio * weights.riskControl;
  const penaltyScore = repeatedPenalty * weights.repeatedMistakePenalty;

  let rawScore = checklistScore + regimeScore + riskScore - penaltyScore;
  rawScore = Math.max(0, Math.min(100, rawScore));

  const blockingReasons = [];
  if (!Number.isFinite(plannedStoploss) || plannedStoploss <= 0) {
    blockingReasons.push('Stoploss chưa hợp lệ hoặc chưa được thiết lập');
  }

  const advice = [];
  if (checklistRatio < 0.6) advice.push('Hoàn thành thêm checklist trước khi vào lệnh');
  if (!regimeOn) advice.push('Market regime đang OFF, cân nhắc giảm vị thế hoặc chờ xác nhận');
  if (riskControlRatio < 0.6) advice.push('Tỷ lệ risk hiện cao, cần điều chỉnh entry/stoploss hoặc size');
  if (repeatedPenalty >= 0.6) advice.push('Bạn đang lặp lại lỗi gần đây, nên rà soát playbook trước khi vào lệnh');

  const ruleBreakdown = [
    {
      ruleKey: 'checklist_adherence',
      weight: weights.checklistAdherence,
      score: Number(checklistScore.toFixed(2)),
      ratio: Number(checklistRatio.toFixed(4)),
      result: checklistRatio >= 0.6 ? 'pass' : 'warn',
      explanation: 'Đo tỷ lệ checklist đã đánh dấu true',
    },
    {
      ruleKey: 'regime_alignment',
      weight: weights.regimeAlignment,
      score: Number(regimeScore.toFixed(2)),
      ratio: regimeOn ? 1 : 0.35,
      result: regimeOn ? 'pass' : 'warn',
      explanation: 'Regime ON được điểm tối đa, OFF bị giảm điểm mạnh',
    },
    {
      ruleKey: 'risk_control',
      weight: weights.riskControl,
      score: Number(riskScore.toFixed(2)),
      ratio: Number(riskControlRatio.toFixed(4)),
      result: riskControlRatio >= 0.6 ? 'pass' : 'warn',
      explanation: 'Đo mức hợp lý của khoảng cách entry-stoploss',
    },
    {
      ruleKey: 'repeated_mistake_penalty',
      weight: weights.repeatedMistakePenalty,
      score: Number((-penaltyScore).toFixed(2)),
      ratio: Number(repeatedPenalty.toFixed(4)),
      result: repeatedPenalty >= 0.6 ? 'warn' : 'pass',
      explanation: 'Phạt điểm nếu lặp lại error_category nhiều lần trong 30 ngày',
    },
  ];

  const decisionScore = Number(rawScore.toFixed(2));

  return {
    decisionScore,
    grade: gradeFromScore(decisionScore),
    ruleBreakdown,
    blockingReasons,
    advice,
  };
}

/**
 * @param {object} input
 * @param {object} [options]
 * @returns {{allowed:boolean, checks:Array, blockingReasons:Array, warnings:Array}}
 */
export function evaluateGuardrails(input, options = {}) {
  const strictRegime = options.strictRegime ?? Boolean(input.strictRegime);
  const minChecklistRatio = options.minChecklistRatio ?? 0.6;
  const maxRiskPct = options.maxRiskPct ?? 2.0;

  const checks = [];
  const blockingReasons = [];
  const warnings = [];

  const plannedEntry = Number(input.planned_entry);
  const plannedStoploss = Number(input.planned_stoploss);

  const hasStoploss = Number.isFinite(plannedStoploss) && plannedStoploss > 0;
  checks.push({ key: 'stoploss_present', level: 'hard', passed: hasStoploss, detail: hasStoploss ? 'ok' : 'missing stoploss' });
  if (!hasStoploss) blockingReasons.push('Thiếu stoploss hợp lệ');

  let computedRiskPct = null;
  if (Number.isFinite(plannedEntry) && plannedEntry > 0 && hasStoploss) {
    computedRiskPct = Math.abs((plannedEntry - plannedStoploss) / plannedEntry) * 100;
  }
  const declaredRiskPct = Number(input.risk_per_trade_pct);
  const riskPct = Number.isFinite(declaredRiskPct) ? declaredRiskPct : computedRiskPct;
  const riskOk = Number.isFinite(riskPct) ? riskPct <= maxRiskPct : false;
  checks.push({
    key: 'risk_threshold',
    level: 'hard',
    passed: riskOk,
    detail: Number.isFinite(riskPct) ? `risk ${riskPct.toFixed(2)}% <= ${maxRiskPct}%` : 'risk unavailable',
    value: Number.isFinite(riskPct) ? Number(riskPct.toFixed(4)) : null,
  });
  if (!riskOk) blockingReasons.push(`Risk per trade vượt ngưỡng ${maxRiskPct}%`);

  const regimeOn = String(input.market_regime_snapshot || '').toUpperCase() === 'ON';
  const regimePassed = strictRegime ? regimeOn : true;
  checks.push({ key: 'regime_alignment', level: strictRegime ? 'hard' : 'soft', passed: regimePassed, detail: regimeOn ? 'regime ON' : 'regime OFF' });
  if (!regimePassed) blockingReasons.push('Market regime OFF và đang bật strict regime policy');
  if (!regimeOn) warnings.push('Regime OFF: cân nhắc giảm vị thế hoặc chờ xác nhận');

  const checklistRatio = computeChecklistAdherence(input.checklist || {});
  const checklistPassed = checklistRatio >= minChecklistRatio;
  checks.push({
    key: 'checklist_threshold',
    level: 'soft',
    passed: checklistPassed,
    detail: `checklist ratio ${(checklistRatio * 100).toFixed(1)}% >= ${(minChecklistRatio * 100).toFixed(1)}%`,
  });
  if (!checklistPassed) warnings.push('Checklist chưa đạt ngưỡng tối thiểu');

  const allowed = blockingReasons.length === 0;
  return {
    allowed,
    checks,
    blockingReasons,
    warnings,
  };
}

/**
 * Build ranked playbook insights from journal entries.
 * @param {Array<object>} entries
 * @returns {Array<object>}
 */
export function buildPlaybookInsightsFromEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const closed = entries.filter((e) => ['closed', 'reviewed'].includes(e.status));
  if (closed.length === 0) return [];

  const setupStats = new Map();
  const errorStats = new Map();
  const hourStats = new Map();

  for (const e of closed) {
    const setup = e.setup || 'unknown_setup';
    const pnl = Number(e.pnl_pct || 0);
    if (!setupStats.has(setup)) setupStats.set(setup, { count: 0, wins: 0 });
    const s = setupStats.get(setup);
    s.count += 1;
    if (pnl > 0) s.wins += 1;

    if (e.error_category) {
      errorStats.set(e.error_category, (errorStats.get(e.error_category) || 0) + 1);
    }

    if (e.entry_date) {
      const h = new Date(e.entry_date).getUTCHours();
      hourStats.set(h, (hourStats.get(h) || 0) + 1);
    }
  }

  const setupRank = Array.from(setupStats.entries())
    .map(([setup, v]) => ({ setup, winRate: v.count > 0 ? v.wins / v.count : 0, count: v.count }))
    .sort((a, b) => (b.winRate - a.winRate) || (b.count - a.count));

  const topSetup = setupRank[0];
  const topErrors = Array.from(errorStats.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topHour = Array.from(hourStats.entries()).sort((a, b) => b[1] - a[1])[0];

  const insights = [];

  if (topSetup) {
    const confidence = Math.min(0.95, 0.35 + (topSetup.count / Math.max(10, closed.length)));
    insights.push({
      insightKey: 'winning_setup',
      title: `Setup hiệu quả nhất: ${topSetup.setup}`,
      recommendation: `Ưu tiên setup ${topSetup.setup} khi đủ điều kiện checklist.`,
      evidenceSummary: `Win rate ${Math.round(topSetup.winRate * 100)}% trên ${topSetup.count} giao dịch gần đây`,
      confidence,
      payload: topSetup,
      rankScore: confidence * 100,
    });
  }

  if (topErrors.length > 0) {
    const totalErrors = topErrors.reduce((s, [, c]) => s + c, 0);
    const confidence = Math.min(0.9, 0.3 + totalErrors / Math.max(10, closed.length));
    insights.push({
      insightKey: 'repeated_errors',
      title: 'Lỗi lặp lại nổi bật',
      recommendation: `Tập trung khắc phục lỗi: ${topErrors.map(([k]) => k).join(', ')}`,
      evidenceSummary: topErrors.map(([k, c]) => `${k}: ${c}`).join(' | '),
      confidence,
      payload: { topErrors: topErrors.map(([category, count]) => ({ category, count })) },
      rankScore: confidence * 95,
    });
  }

  if (topHour) {
    const confidence = Math.min(0.8, 0.25 + (topHour[1] / Math.max(10, closed.length)));
    insights.push({
      insightKey: 'timing_pattern',
      title: 'Khung giờ hoạt động nổi trội',
      recommendation: 'Ưu tiên review kỹ các lệnh ở khung giờ hoạt động cao để kiểm soát chất lượng quyết định.',
      evidenceSummary: `Khung giờ UTC ${topHour[0]} có tần suất cao nhất (${topHour[1]} lệnh).`,
      confidence,
      payload: { hour: topHour[0], count: topHour[1] },
      rankScore: confidence * 80,
    });
  }

  return insights.sort((a, b) => b.rankScore - a.rankScore).slice(0, 3);
}
