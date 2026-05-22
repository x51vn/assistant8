/**
 * ReviewModal.jsx — Write a post-trade review (closed → reviewed)
 *
 * Fields: lessons learned, error category, star rating
 * Change: trading-journal-mvp
 */

import { h } from 'preact';
import { useState } from 'preact/hooks';
import { updateJournalEntry } from '../../api/journalApi.js';

const ERROR_CATEGORIES = [
  { value: '', label: '— Không có lỗi —' },
  { value: 'late_entry', label: 'Vào lệnh trễ' },
  { value: 'wrong_regime', label: 'Sai market regime' },
  { value: 'oversize', label: 'Quá size' },
  { value: 'no_thesis', label: 'Không có thesis rõ ràng' },
  { value: 'fomo', label: 'FOMO / tâm lý' },
  { value: 'early_exit', label: 'Thoát lệnh sớm' },
  { value: 'other', label: 'Khác' },
];

export function ReviewModal({ entry, onSaved, onClose }) {
  const [lessons, setLessons] = useState(entry.lessons || '');
  const [errorCategory, setErrorCategory] = useState(entry.error_category || '');
  const [rating, setRating] = useState(entry.rating || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const updates = {
      status: 'reviewed',
      lessons: lessons.trim() || null,
      error_category: errorCategory || null,
      rating: rating > 0 ? rating : null,
    };

    const { item, error: err } = await updateJournalEntry(entry.id, updates);
    setLoading(false);
    if (err) { setError(err.message); return; }
    onSaved(item);
  }

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-card" onClick={e => e.stopPropagation()}>
        <div class="modal-header">
          <h3>📝 Review lệnh — {entry.symbol}</h3>
          <button class="btn-ghost btn-close" onClick={onClose}>×</button>
        </div>

        <form class="modal-form" onSubmit={handleSubmit}>
          {error && <div class="alert alert-danger">{error}</div>}

          {/* Trade summary */}
          <div class="review-summary">
            {entry.pnl_pct != null && (
              <span class={`review-pnl ${entry.pnl_pct >= 0 ? 'positive' : 'negative'}`}>
                {entry.pnl_pct >= 0 ? '+' : ''}{(entry.pnl_pct * 100).toFixed(2)}%
              </span>
            )}
            {entry.r_multiple != null && (
              <span class={`review-r ${entry.r_multiple >= 0 ? 'positive' : 'negative'}`}>
                {entry.r_multiple >= 0 ? '+' : ''}{Number(entry.r_multiple).toFixed(2)}R
              </span>
            )}
          </div>

          <div class="form-group">
            <label>Bài học rút ra</label>
            <textarea
              class="form-input"
              rows="4"
              value={lessons}
              onInput={e => setLessons(e.target.value)}
              placeholder="Lần sau sẽ cải thiện điều gì?..."
            />
          </div>

          <div class="form-group">
            <label>Phân loại lỗi</label>
            <select class="form-input" value={errorCategory}
              onChange={e => setErrorCategory(e.target.value)}>
              {ERROR_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div class="form-group">
            <label>Đánh giá lệnh (1–5)</label>
            <div class="star-rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  class={`star ${n <= rating ? 'star-filled' : ''}`}
                  onClick={() => setRating(n === rating ? 0 : n)}
                  aria-label={`${n} sao`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div class="modal-actions">
            <button type="submit" class="btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu review'}
            </button>
            <button type="button" class="btn-secondary" onClick={onClose}>Hủy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReviewModal;
