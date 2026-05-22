/**
 * ChecklistSettingsModal.jsx — Manage checklist template rules
 *
 * Features:
 *   - List rules with active/inactive toggle
 *   - Edit label
 *   - Delete rule
 *   - Add new rule
 *
 * Change: trading-journal-mvp
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  fetchChecklistTemplates, createChecklistRule, updateChecklistRule, deleteChecklistRule,
} from '../../api/checklistApi.js';

export function ChecklistSettingsModal({ onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState(null);
  const [addLoading, setAddLoading] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { items, isDefault: def, error: err } = await fetchChecklistTemplates();
      setLoading(false);
      if (err) { setError(err.message); return; }
      setTemplates(items);
      setIsDefault(def);
    }
    load();
  }, []);

  async function handleToggle(item) {
    if (isDefault) {
      // Can't toggle defaults — user needs to save their own rules first
      setError('Lưu ít nhất một rule trước khi chỉnh sửa');
      return;
    }
    const { item: updated, error: err } = await updateChecklistRule(item.id, { is_active: !item.is_active });
    if (err) { setError(err.message); return; }
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  async function handleDelete(id) {
    if (isDefault) return;
    const { error: err } = await deleteChecklistRule(id);
    if (err) { setError(err.message); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddError(null);
    if (!newKey.trim() || !newLabel.trim()) {
      setAddError('rule_key và label là bắt buộc');
      return;
    }
    setAddLoading(true);
    const nextOrder = templates.reduce((max, t) => Math.max(max, t.order_num || 0), 0) + 1;
    const { item, error: err } = await createChecklistRule({
      rule_key: newKey.trim().toLowerCase().replace(/\s+/g, '_'),
      label: newLabel.trim(),
      order_num: nextOrder,
    });
    setAddLoading(false);
    if (err) { setAddError(err.message); return; }
    setTemplates(prev => [...prev, item]);
    setNewKey('');
    setNewLabel('');
    setIsDefault(false);
  }

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-card" onClick={e => e.stopPropagation()}>
        <div class="modal-header">
          <h3>⚙️ Cài đặt Checklist Rules</h3>
          <button class="btn-ghost btn-close" onClick={onClose}>×</button>
        </div>

        <div class="modal-body">
          {error && <div class="alert alert-danger" onClick={() => setError(null)}>{error} ×</div>}

          {loading ? (
            <div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>
          ) : (
            <>
              {isDefault && (
                <div class="alert alert-info">
                  Đang hiển thị rules mặc định. Thêm rule mới để bắt đầu tùy chỉnh.
                </div>
              )}

              <ul class="checklist-settings-list">
                {templates.map((t, idx) => (
                  <li key={t.id || t.rule_key} class={`checklist-rule-item ${t.is_active === false ? 'inactive' : ''}`}>
                    <span class="rule-order">{idx + 1}</span>
                    <span class="rule-label">{t.label}</span>
                    <span class="rule-key text-muted">[{t.rule_key}]</span>
                    <div class="rule-actions">
                      {!isDefault && (
                        <>
                          <button
                            class={`btn-small ${t.is_active !== false ? 'btn-warning' : 'btn-success'}`}
                            title={t.is_active !== false ? 'Tắt' : 'Bật'}
                            onClick={() => handleToggle(t)}
                          >
                            {t.is_active !== false ? 'Tắt' : 'Bật'}
                          </button>
                          <button
                            class="btn-small btn-ghost"
                            title="Xóa"
                            onClick={() => handleDelete(t.id)}
                          >
                            <i class="fas fa-trash-alt"></i>
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Add new rule */}
              <form class="add-rule-form" onSubmit={handleAdd}>
                <h4>Thêm rule mới</h4>
                {addError && <div class="alert alert-danger">{addError}</div>}
                <div class="form-row">
                  <div class="form-group">
                    <label>Key <span class="text-muted">(không dấu, không cách)</span></label>
                    <input
                      class="form-input"
                      type="text"
                      value={newKey}
                      onInput={e => setNewKey(e.target.value)}
                      placeholder="VD: volume_ok"
                    />
                  </div>
                  <div class="form-group">
                    <label>Label</label>
                    <input
                      class="form-input"
                      type="text"
                      value={newLabel}
                      onInput={e => setNewLabel(e.target.value)}
                      placeholder="VD: Khối lượng đủ lớn"
                    />
                  </div>
                </div>
                <button type="submit" class="btn-primary" disabled={addLoading}>
                  {addLoading ? 'Đang lưu...' : '+ Thêm rule'}
                </button>
              </form>
            </>
          )}
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

export default ChecklistSettingsModal;
