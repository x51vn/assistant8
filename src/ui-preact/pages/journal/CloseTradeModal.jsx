/**
 * CloseTradeModal.jsx — Close an open trade or confirm entry from planned
 *
 * Used for:
 *   planned → open: records actual_entry, actual_qty, entry_date
 *   open → closed: records exit_price, exit_date, followed_plan, computes P&L
 *
 * Change: trading-journal-mvp
 */

import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { updateJournalEntry } from '../../api/journalApi.js';

function computePnlPreview(exitPrice, entry, qty) {
  if (!exitPrice || !entry || !qty) return null;
  const pnl = (Number(exitPrice) - Number(entry)) * Number(qty);
  const pct = (Number(exitPrice) - Number(entry)) / Number(entry);
  return { pnl, pct };
}

export function CloseTradeModal({ entry, onSaved, onClose }) {
  const isOpeningFromPlanned = entry.status === 'planned' || entry._nextStatus === 'open';
  const nextStatus = isOpeningFromPlanned ? 'open' : 'closed';

  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
  const [actualEntry, setActualEntry] = useState(entry.actual_entry || '');
  const [actualQty, setActualQty] = useState(entry.actual_qty || '');
  const [entryDate, setEntryDate] = useState(entry.entry_date || new Date().toISOString().slice(0, 10));
  const [followedPlan, setFollowedPlan] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const preview = useMemo(() => {
    if (isOpeningFromPlanned) return null;
    const ref = actualEntry || entry.actual_entry;
    const qty = actualQty || entry.actual_qty;
    return computePnlPreview(exitPrice, ref, qty);
  }, [exitPrice, actualEntry, actualQty, entry, isOpeningFromPlanned]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let updates = { status: nextStatus };

    if (isOpeningFromPlanned) {
      if (!actualEntry) { setError('Entry thực là bắt buộc'); setLoading(false); return; }
      updates.actual_entry = Number(actualEntry);
      if (actualQty) updates.actual_qty = Number(actualQty);
      updates.entry_date = entryDate || null;
    } else {
      if (!exitPrice) { setError('Giá thoát là bắt buộc'); setLoading(false); return; }
      updates.exit_price = Number(exitPrice);
      updates.exit_date = exitDate || null;
      updates.followed_plan = followedPlan;
    }

    const { item, error: err } = await updateJournalEntry(entry.id, updates);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onSaved(item);
  }

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-card" onClick={e => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{isOpeningFromPlanned ? '▶️ Mở lệnh' : '✅ Đóng lệnh'} — {entry.symbol}</h3>
          <button class="btn-ghost btn-close" onClick={onClose}>×</button>
        </div>

        <form class="modal-form" onSubmit={handleSubmit}>
          {error && <div class="alert alert-danger">{error}</div>}

          <div class="entry-summary">
            <span>Entry KH: <strong>{entry.planned_entry ?? '—'}</strong></span>
            <span>Target: <strong>{entry.planned_target ?? '—'}</strong></span>
            <span>Stoploss: <strong>{entry.planned_stoploss ?? '—'}</strong></span>
          </div>

          {isOpeningFromPlanned ? (
            <>
              <div class="form-group">
                <label>Entry thực <span class="required">*</span></label>
                <input class="form-input" type="number" step="0.01"
                  value={actualEntry} onInput={e => setActualEntry(e.target.value)} required />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>KL thực</label>
                  <input class="form-input" type="number"
                    value={actualQty} onInput={e => setActualQty(e.target.value)} />
                </div>
                <div class="form-group">
                  <label>Ngày vào</label>
                  <input class="form-input" type="date"
                    value={entryDate} onInput={e => setEntryDate(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div class="form-row">
                <div class="form-group">
                  <label>Giá thoát <span class="required">*</span></label>
                  <input class="form-input" type="number" step="0.01"
                    value={exitPrice} onInput={e => setExitPrice(e.target.value)} required />
                </div>
                <div class="form-group">
                  <label>Ngày thoát</label>
                  <input class="form-input" type="date"
                    value={exitDate} onInput={e => setExitDate(e.target.value)} />
                </div>
              </div>

              {preview && (
                <div class={`pnl-preview ${preview.pct >= 0 ? 'positive' : 'negative'}`}>
                  P&L: {preview.pct >= 0 ? '+' : ''}{(preview.pct * 100).toFixed(2)}%
                  {' '}({preview.pnl >= 0 ? '+' : ''}{Number(preview.pnl).toLocaleString('vi-VN')} VND)
                </div>
              )}

              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" checked={followedPlan} onChange={e => setFollowedPlan(e.target.checked)} />
                  Đã tuân theo kế hoạch giao dịch
                </label>
              </div>
            </>
          )}

          <div class="modal-actions">
            <button type="submit" class="btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : (isOpeningFromPlanned ? 'Xác nhận vào lệnh' : 'Đóng lệnh')}
            </button>
            <button type="button" class="btn-secondary" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CloseTradeModal;
