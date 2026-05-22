/**
 * NewEntryModal.jsx — Create a new trading journal entry
 *
 * Pre-fills fields from watchlist + market assessment snapshots when available.
 * Change: trading-journal-mvp
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { createJournalEntry } from '../../api/journalApi.js';

const ERROR_CATEGORIES = [
  { value: '', label: '— Chọn loại lỗi —' },
  { value: 'late_entry', label: 'Vào lệnh trễ' },
  { value: 'wrong_regime', label: 'Sai market regime' },
  { value: 'oversize', label: 'Quá size' },
  { value: 'no_thesis', label: 'Không có thesis rõ ràng' },
  { value: 'fomo', label: 'FOMO / tâm lý' },
  { value: 'other', label: 'Khác' },
];

function buildInitialChecklist(template) {
  if (!template || template.length === 0) return {};
  return template.reduce((acc, rule) => {
    acc[rule.rule_key] = false;
    return acc;
  }, {});
}

export function NewEntryModal({ prefill, onSaved, onClose }) {
  const watchlist = prefill?.watchlistPrefill || null;
  const regime = prefill?.regimePrefill || null;
  const template = prefill?.checklistTemplate || [];

  const [symbol, setSymbol] = useState(prefill?.symbol || '');
  const [setup, setSetup] = useState('');
  const [thesis, setThesis] = useState(watchlist?.investment_thesis || '');
  const [plannedEntry, setPlannedEntry] = useState(watchlist?.entry || '');
  const [plannedTarget, setPlannedTarget] = useState(watchlist?.target || '');
  const [plannedStoploss, setPlannedStoploss] = useState(watchlist?.stoploss || '');
  const [plannedQty, setPlannedQty] = useState('');
  const [riskPct, setRiskPct] = useState('');
  const [actualEntry, setActualEntry] = useState('');
  const [actualQty, setActualQty] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [checklist, setChecklist] = useState(() => buildInitialChecklist(template));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function toggleChecklist(key) {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!symbol.trim()) { setError('Symbol là bắt buộc'); return; }
    setLoading(true);
    setError(null);

    const data = {
      symbol: symbol.trim().toUpperCase(),
      setup: setup.trim() || null,
      thesis_snapshot: thesis.trim() || null,
      // Market assessment snapshots
      market_regime_snapshot: regime?.market_regime_state || null,
      market_score_snapshot: regime?.market_regime_score ?? null,
      market_action_snapshot: regime?.action || null,
      // Watchlist data
      watchlist_id: watchlist?.id || null,
      planned_entry: plannedEntry !== '' ? Number(plannedEntry) : null,
      planned_target: plannedTarget !== '' ? Number(plannedTarget) : null,
      planned_stoploss: plannedStoploss !== '' ? Number(plannedStoploss) : null,
      planned_qty: plannedQty !== '' ? Number(plannedQty) : null,
      risk_per_trade_pct: riskPct !== '' ? Number(riskPct) / 100 : null,
      actual_entry: actualEntry !== '' ? Number(actualEntry) : null,
      actual_qty: actualQty !== '' ? Number(actualQty) : null,
      entry_date: entryDate || null,
      checklist,
    };

    const { item, error: err } = await createJournalEntry(data);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onSaved(item);
  }

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-card modal-large" onClick={e => e.stopPropagation()}>
        <div class="modal-header">
          <h3>📓 Tạo Journal Entry</h3>
          <button class="btn-ghost btn-close" onClick={onClose}>×</button>
        </div>

        <form class="modal-form" onSubmit={handleSubmit}>
          {error && <div class="alert alert-danger">{error}</div>}

          {/* Market snapshot banner */}
          {regime && (
            <div class="prefill-banner">
              <strong>Snapshot thị trường:</strong>{' '}
              {regime.market_regime_state} | Score {regime.market_regime_score ?? '—'} | {regime.action}
            </div>
          )}

          {/* Basics */}
          <div class="form-row">
            <div class="form-group">
              <label>Mã CK <span class="required">*</span></label>
              <input class="form-input" type="text" value={symbol}
                onInput={e => setSymbol(e.target.value.toUpperCase())} placeholder="VD: HPG" required />
            </div>
            <div class="form-group">
              <label>Setup</label>
              <input class="form-input" type="text" value={setup}
                onInput={e => setSetup(e.target.value)} placeholder="VD: Breakout, Pullback..." />
            </div>
          </div>

          <div class="form-group">
            <label>Thesis</label>
            <textarea class="form-input" rows="3" value={thesis}
              onInput={e => setThesis(e.target.value)} placeholder="Lý do vào lệnh..." />
          </div>

          {/* Plan */}
          <h4 class="form-section-title">Kế hoạch</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Entry kế hoạch</label>
              <input class="form-input" type="number" step="0.01" value={plannedEntry}
                onInput={e => setPlannedEntry(e.target.value)} placeholder="Giá vào" />
            </div>
            <div class="form-group">
              <label>Target</label>
              <input class="form-input" type="number" step="0.01" value={plannedTarget}
                onInput={e => setPlannedTarget(e.target.value)} placeholder="Giá mục tiêu" />
            </div>
            <div class="form-group">
              <label>Stoploss</label>
              <input class="form-input" type="number" step="0.01" value={plannedStoploss}
                onInput={e => setPlannedStoploss(e.target.value)} placeholder="Giá cắt lỗ" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>KL kế hoạch</label>
              <input class="form-input" type="number" value={plannedQty}
                onInput={e => setPlannedQty(e.target.value)} placeholder="Số lượng" />
            </div>
            <div class="form-group">
              <label>Risk / trade (%)</label>
              <input class="form-input" type="number" step="0.1" value={riskPct}
                onInput={e => setRiskPct(e.target.value)} placeholder="VD: 2" />
            </div>
          </div>

          {/* Actual entry (optional — triggers status=open) */}
          <h4 class="form-section-title">Thực tế (nếu đã vào)</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Entry thực</label>
              <input class="form-input" type="number" step="0.01" value={actualEntry}
                onInput={e => setActualEntry(e.target.value)} />
            </div>
            <div class="form-group">
              <label>KL thực</label>
              <input class="form-input" type="number" value={actualQty}
                onInput={e => setActualQty(e.target.value)} />
            </div>
            <div class="form-group">
              <label>Ngày vào</label>
              <input class="form-input" type="date" value={entryDate}
                onInput={e => setEntryDate(e.target.value)} />
            </div>
          </div>

          {/* Checklist */}
          {template.length > 0 && (
            <div class="checklist-section">
              <h4 class="form-section-title">Checklist</h4>
              {template.map(rule => (
                <label key={rule.rule_key} class="checklist-item">
                  <input
                    type="checkbox"
                    checked={!!checklist[rule.rule_key]}
                    onChange={() => toggleChecklist(rule.rule_key)}
                  />
                  <span>{rule.label}</span>
                </label>
              ))}
            </div>
          )}

          <div class="modal-actions">
            <button type="submit" class="btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu entry'}
            </button>
            <button type="button" class="btn-secondary" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewEntryModal;
