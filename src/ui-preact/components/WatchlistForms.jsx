/**
 * WatchlistForms.jsx - Watchlist CRUD modal forms
 * 
 * Features:
 * - AddWatchlistModal: Create new watchlist item
 * - EditWatchlistModal: Update existing watchlist item
 * - DeleteWatchlistModal: Delete confirmation
 * - Form validation (symbol required, numeric fields)  
 * - Vietnamese error messages
 * 
 * Ticket: XST-743
 */

import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Risk options for select dropdown
 */
const RISK_OPTIONS = [
  { value: '', label: '-- Chọn --' },
  { value: 'Thấp', label: 'Thấp' },
  { value: 'Trung bình', label: 'Trung bình' },
  { value: 'Cao', label: 'Cao' }
];

/**
 * Validate form data
 * @param {Object} data - Form data
 * @param {boolean} isEdit - Whether this is an edit operation
 * @returns {Object} errors - Validation errors by field
 */
function validateForm(data, isEdit = false) {
  const errors = {};

  // Symbol required (only for add, not edit)
  if (!isEdit && (!data.symbol || !data.symbol.trim())) {
    errors.symbol = 'Mã cổ phiếu là bắt buộc';
  }

  // Validate numeric fields (if provided)
  if (data.entry !== undefined && data.entry !== null && data.entry !== '') {
    const entry = Number(data.entry);
    if (isNaN(entry) || entry < 0) {
      errors.entry = 'Entry phải là số không âm';
    }
  }

  if (data.target !== undefined && data.target !== null && data.target !== '') {
    const target = Number(data.target);
    if (isNaN(target) || target < 0) {
      errors.target = 'Target phải là số không âm';
    }
  }

  if (data.stoploss !== undefined && data.stoploss !== null && data.stoploss !== '') {
    const stoploss = Number(data.stoploss);
    if (isNaN(stoploss) || stoploss < 0) {
      errors.stoploss = 'StopLoss phải là số không âm';
    }
  }

  return errors;
}

/**
 * Parse a comma/whitespace-separated symbol string into validated symbols
 */
function parseSymbols(value) {
  return value
    .split(/[,\s]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length >= 1 && /^[A-Z0-9]+$/.test(s));
}

/**
 * AddWatchlistModal - Create new watchlist item(s)
 *
 * Modes:
 *   Single  — 1 symbol → full detail form (investment_thesis, risk, entry, target, stoploss, notes)
 *   Bulk    — comma-separated symbols → symbol-only batch add, shows per-symbol progress chips
 */
export function AddWatchlistModal({ isOpen, onClose, onSave }) {
  const [symbolInput, setSymbolInput] = useState('');
  const [formData, setFormData] = useState({
    investment_thesis: '',
    risk: '',
    entry: '',
    target: '',
    stoploss: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Bulk progress: [{ symbol, status: 'pending'|'success'|'error', error? }]
  const [bulkResults, setBulkResults] = useState([]);

  const isBulkMode = symbolInput.includes(',');
  const bulkSymbols = isBulkMode ? parseSymbols(symbolInput) : [];
  const bulkDone = bulkResults.length > 0 && !isSubmitting;

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSymbolInput('');
      setFormData({ investment_thesis: '', risk: '', entry: '', target: '', stoploss: '', notes: '' });
      setErrors({});
      setIsSubmitting(false);
      setBulkResults([]);
    }
  }, [isOpen]);

  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  }, [errors]);

  const handleSymbolChange = (value) => {
    setSymbolInput(value.toUpperCase());
    if (errors.symbol) setErrors(prev => { const e = { ...prev }; delete e.symbol; return e; });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isBulkMode) {
      // ── Bulk mode ────────────────────────────────────────────────────────
      if (bulkSymbols.length === 0) {
        setErrors({ symbol: 'Nhập ít nhất một mã hợp lệ' });
        return;
      }
      setIsSubmitting(true);
      setBulkResults(bulkSymbols.map(s => ({ symbol: s, status: 'pending' })));

      for (let i = 0; i < bulkSymbols.length; i++) {
        const sym = bulkSymbols[i];
        try {
          await onSave({ symbol: sym });
          setBulkResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'success' } : r
          ));
        } catch (err) {
          setBulkResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error', error: err.message } : r
          ));
        }
      }
      setIsSubmitting(false);
      // Keep modal open so user sees the results summary; close via "Đóng"

    } else {
      // ── Single mode ──────────────────────────────────────────────────────
      const singleData = {
        symbol: symbolInput.trim().toUpperCase(),
        investment_thesis: formData.investment_thesis.trim() || undefined,
        risk: formData.risk || undefined,
        entry: formData.entry ? Number(formData.entry) : undefined,
        target: formData.target ? Number(formData.target) : undefined,
        stoploss: formData.stoploss ? Number(formData.stoploss) : undefined,
        notes: formData.notes.trim() || undefined
      };
      const validationErrors = validateForm({ ...formData, symbol: symbolInput }, false);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setIsSubmitting(true);
      try {
        await onSave(singleData);
        onClose();
      } catch (error) {
        console.error('[AddWatchlistModal] Submit failed:', error);
        setErrors({ submit: error.message || 'Có lỗi xảy ra khi thêm mục watchlist' });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const bulkSuccessCount = bulkResults.filter(r => r.status === 'success').length;
  const bulkErrorCount = bulkResults.filter(r => r.status === 'error').length;

  if (!isOpen) return null;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal watchlist-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>
            <i class="fas fa-plus"></i> Thêm Watchlist
          </h3>
          <button class="modal-close" onClick={onClose} type="button">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <form class="modal-body" onSubmit={handleSubmit}>
          {/* Submit error */}
          {errors.submit && (
            <div class="form-error-banner">
              <i class="fas fa-exclamation-triangle"></i> {errors.submit}
            </div>
          )}

          {/* Symbol input */}
          <div class="form-group">
            <label for="add-symbol">
              <i class="fas fa-chart-line"></i> Mã cổ phiếu *
              {isBulkMode && bulkSymbols.length > 0 && (
                <span class="badge-count">{bulkSymbols.length} mã</span>
              )}
            </label>
            <input
              id="add-symbol"
              type="text"
              class={`input-field ${errors.symbol ? 'input-error' : ''}`}
              placeholder="VD: HPG — hoặc nhiều mã: BCC, VPI, HAG, CTI"
              value={symbolInput}
              onInput={(e) => handleSymbolChange(e.target.value)}
              autoFocus
              required
            />
            {errors.symbol && (
              <span class="error-text">
                <i class="fas fa-exclamation-circle"></i> {errors.symbol}
              </span>
            )}
            {/* Symbol chips — shown in bulk mode */}
            {isBulkMode && bulkSymbols.length > 0 && (
              <div class="symbol-chips">
                {bulkSymbols.map(s => {
                  const r = bulkResults.find(x => x.symbol === s);
                  const cls = r?.status === 'success' ? 'chip chip--success'
                    : r?.status === 'error' ? 'chip chip--error'
                    : r?.status === 'pending' ? 'chip chip--pending'
                    : 'chip';
                  return (
                    <span key={s} class={cls} title={r?.error || s}>
                      {r?.status === 'success' && <i class="fas fa-check"></i>}
                      {r?.status === 'error'   && <i class="fas fa-times"></i>}
                      {r?.status === 'pending' && <i class="fas fa-spinner fa-spin"></i>}
                      {' '}{s}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bulk results summary */}
          {bulkDone && (
            <div class={`form-info-banner ${bulkErrorCount > 0 ? 'form-info-banner--warn' : 'form-info-banner--success'}`}>
              <i class={`fas ${bulkErrorCount > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle'}`}></i>
              {bulkSuccessCount > 0 && ` Thêm thành công ${bulkSuccessCount} mã.`}
              {bulkErrorCount > 0 && ` ${bulkErrorCount} mã thất bại.`}
            </div>
          )}

          {/* Optional fields — hidden in bulk mode */}
          {!isBulkMode && (
            <>
              <div class="form-group">
                <label for="add-thesis">
                  <i class="fas fa-lightbulb"></i> Luận điểm đầu tư
                </label>
                <textarea
                  id="add-thesis"
                  class="input-field"
                  placeholder="Mô tả luận điểm đầu tư cho cổ phiếu này..."
                  rows="3"
                  value={formData.investment_thesis}
                  onInput={(e) => handleChange('investment_thesis', e.target.value)}
                />
              </div>

              <div class="form-group">
                <label for="add-risk">
                  <i class="fas fa-exclamation-triangle"></i> Mức rủi ro
                </label>
                <select
                  id="add-risk"
                  class="input-field"
                  value={formData.risk}
                  onChange={(e) => handleChange('risk', e.target.value)}
                >
                  {RISK_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="add-entry"><i class="fas fa-arrow-down"></i> Entry</label>
                  <input
                    id="add-entry"
                    type="number"
                    class={`input-field ${errors.entry ? 'input-error' : ''}`}
                    placeholder="Giá nhập"
                    step="0.01" min="0"
                    value={formData.entry}
                    onInput={(e) => handleChange('entry', e.target.value)}
                  />
                  {errors.entry && <span class="error-text"><i class="fas fa-exclamation-circle"></i> {errors.entry}</span>}
                </div>

                <div class="form-group">
                  <label for="add-target"><i class="fas fa-arrow-up"></i> Target</label>
                  <input
                    id="add-target"
                    type="number"
                    class={`input-field ${errors.target ? 'input-error' : ''}`}
                    placeholder="Giá mục tiêu"
                    step="0.01" min="0"
                    value={formData.target}
                    onInput={(e) => handleChange('target', e.target.value)}
                  />
                  {errors.target && <span class="error-text"><i class="fas fa-exclamation-circle"></i> {errors.target}</span>}
                </div>

                <div class="form-group">
                  <label for="add-stoploss"><i class="fas fa-hand-paper"></i> StopLoss</label>
                  <input
                    id="add-stoploss"
                    type="number"
                    class={`input-field ${errors.stoploss ? 'input-error' : ''}`}
                    placeholder="Giá dừng lỗ"
                    step="0.01" min="0"
                    value={formData.stoploss}
                    onInput={(e) => handleChange('stoploss', e.target.value)}
                  />
                  {errors.stoploss && <span class="error-text"><i class="fas fa-exclamation-circle"></i> {errors.stoploss}</span>}
                </div>
              </div>

              <div class="form-group">
                <label for="add-notes"><i class="fas fa-note-sticky"></i> Ghi chú</label>
                <textarea
                  id="add-notes"
                  class="input-field"
                  placeholder="Ghi chú thêm..."
                  rows="2"
                  value={formData.notes}
                  onInput={(e) => handleChange('notes', e.target.value)}
                />
              </div>
            </>
          )}

          <div class="modal-footer">
            <button type="button" class="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              <i class="fas fa-times"></i> {bulkDone ? 'Đóng' : 'Hủy'}
            </button>
            {!bulkDone && (
              <button
                type="submit"
                class="btn-primary"
                disabled={isSubmitting || (isBulkMode && bulkSymbols.length === 0)}
              >
                {isSubmitting ? (
                  <><i class="fas fa-spinner fa-spin"></i> Đang thêm...</>
                ) : isBulkMode ? (
                  <><i class="fas fa-layer-group"></i> Thêm {bulkSymbols.length} mã</>
                ) : (
                  <><i class="fas fa-save"></i> Thêm</>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * EditWatchlistModal - Update existing watchlist item
 */
export function EditWatchlistModal({ isOpen, item, onClose, onSave }) {
  const [formData, setFormData] = useState({
    investment_thesis: '',
    risk: '',
    entry: '',
    target: '',
    stoploss: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when modal opens or item changes
  useEffect(() => {
    if (isOpen && item) {
      setFormData({
        investment_thesis: item.investment_thesis || '',
        risk: item.risk || '',
        entry: item.entry !== null && item.entry !== undefined ? item.entry.toString() : '',
        target: item.target !== null && item.target !== undefined ? item.target.toString() : '',
        stoploss: item.stoploss !== null && item.stoploss !== undefined ? item.stoploss.toString() : '',
        notes: item.notes || ''
      });
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, item]);

  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!item || !item.symbol) {
      console.error('[EditWatchlistModal] No item to edit');
      return;
    }

    // Validate
    const validationErrors = validateForm(formData, true);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare updates - only include changed fields
      const updates = {};
      if (formData.investment_thesis.trim() !== (item.investment_thesis || '')) {
        updates.investment_thesis = formData.investment_thesis.trim() || undefined;
      }
      if (formData.risk !== (item.risk || '')) {
        updates.risk = formData.risk || undefined;
      }
      if (formData.entry !== (item.entry !== null && item.entry !== undefined ? item.entry.toString() : '')) {
        updates.entry = formData.entry ? Number(formData.entry) : undefined;
      }
      if (formData.target !== (item.target !== null && item.target !== undefined ? item.target.toString() : '')) {
        updates.target = formData.target ? Number(formData.target) : undefined;
      }
      if (formData.stoploss !== (item.stoploss !== null && item.stoploss !== undefined ? item.stoploss.toString() : '')) {
        updates.stoploss = formData.stoploss ? Number(formData.stoploss) : undefined;
      }
      if (formData.notes.trim() !== (item.notes || '')) {
        updates.notes = formData.notes.trim() || undefined;
      }

      await onSave(item.symbol, updates);
      onClose(); // Close modal on success
    } catch (error) {
      console.error('[EditWatchlistModal] Submit failed:', error);
      setErrors({ submit: error.message || 'Có lỗi xảy ra khi cập nhật mục watchlist' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal watchlist-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>
            <i class="fas fa-edit"></i> Sửa Watchlist: {item.symbol}
          </h3>
          <button class="modal-close" onClick={onClose} type="button">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <form class="modal-body" onSubmit={handleSubmit}>
          {/* Submit Error */}
          {errors.submit && (
            <div class="form-error-banner">
              <i class="fas fa-exclamation-triangle"></i>
              {errors.submit}
            </div>
          )}

          {/* Investment Thesis */}
          <div class="form-group">
            <label for="edit-thesis">
              <i class="fas fa-lightbulb"></i> Luận điểm đầu tư
            </label>
            <textarea
              id="edit-thesis"
              class="input-field"
              placeholder="Mô tả luận điểm đầu tư cho cổ phiếu này..."
              rows="3"
              value={formData.investment_thesis}
              onInput={(e) => handleChange('investment_thesis', e.target.value)}
            />
          </div>

          {/* Risk */}
          <div class="form-group">
            <label for="edit-risk">
              <i class="fas fa-exclamation-triangle"></i> Mức rủi ro
            </label>
            <select
              id="edit-risk"
              class="input-field"
              value={formData.risk}
              onChange={(e) => handleChange('risk', e.target.value)}
            >
              {RISK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Price Fields Row */}
          <div class="form-row">
            <div class="form-group">
              <label for="edit-entry">
                <i class="fas fa-arrow-down"></i> Entry
              </label>
              <input
                id="edit-entry"
                type="number"
                class={`input-field ${errors.entry ? 'input-error' : ''}`}
                placeholder="Giá nhập"
                step="0.01"
                min="0"
                value={formData.entry}
                onInput={(e) => handleChange('entry', e.target.value)}
              />
              {errors.entry && (
                <span class="error-text">
                  <i class="fas fa-exclamation-circle"></i> {errors.entry}
                </span>
              )}
            </div>

            <div class="form-group">
              <label for="edit-target">
                <i class="fas fa-arrow-up"></i> Target
              </label>
              <input
                id="edit-target"
                type="number"
                class={`input-field ${errors.target ? 'input-error' : ''}`}
                placeholder="Giá mục tiêu"
                step="0.01"
                min="0"
                value={formData.target}
                onInput={(e) => handleChange('target', e.target.value)}
              />
              {errors.target && (
                <span class="error-text">
                  <i class="fas fa-exclamation-circle"></i> {errors.target}
                </span>
              )}
            </div>

            <div class="form-group">
              <label for="edit-stoploss">
                <i class="fas fa-hand-paper"></i> StopLoss
              </label>
              <input
                id="edit-stoploss"
                type="number"
                class={`input-field ${errors.stoploss ? 'input-error' : ''}`}
                placeholder="Giá dừng lỗ"
                step="0.01"
                min="0"
                value={formData.stoploss}
                onInput={(e) => handleChange('stoploss', e.target.value)}
              />
              {errors.stoploss && (
                <span class="error-text">
                  <i class="fas fa-exclamation-circle"></i> {errors.stoploss}
                </span>
              )}
            </div>
          </div>

          {/* Notes */}
          <div class="form-group">
            <label for="edit-notes">
              <i class="fas fa-note-sticky"></i> Ghi chú
            </label>
            <textarea
              id="edit-notes"
              class="input-field"
              placeholder="Ghi chú thêm..."
              rows="2"
              value={formData.notes}
              onInput={(e) => handleChange('notes', e.target.value)}
            />
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              <i class="fas fa-times"></i> Hủy
            </button>
            <button
              type="submit"
              class="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <i class="fas fa-spinner fa-spin"></i> Đang cập nhật...
                </>
              ) : (
                <>
                  <i class="fas fa-save"></i> Cập nhật
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * DeleteWatchlistModal - Delete confirmation modal
 */
export function DeleteWatchlistModal({ isOpen, item, onClose, onConfirm }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!item || !item.symbol) {
      console.error('[DeleteWatchlistModal] No item to delete');
      return;
    }

    setIsDeleting(true);
    try {
      await onConfirm(item.symbol);
      onClose(); // Close modal on success
    } catch (error) {
      console.error('[DeleteWatchlistModal] Delete failed:', error);
      alert(error.message || 'Có lỗi xảy ra khi xóa mục watchlist');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>
            <i class="fas fa-trash-alt"></i> Xóa Watchlist
          </h3>
          <button class="modal-close" onClick={onClose} type="button">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal-body">
          <p>
            Bạn có chắc chắn muốn xóa <strong>{item.symbol}</strong> khỏi watchlist?
          </p>
          <p class="text-muted">Hành động này không thể hoàn tác.</p>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            <i class="fas fa-times"></i> Hủy
          </button>
          <button
            type="button"
            class="btn-danger"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <i class="fas fa-spinner fa-spin"></i> Đang xóa...
              </>
            ) : (
              <>
                <i class="fas fa-trash-alt"></i> Xóa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
